#!/bin/bash
# ============================================================================
# iBetPro — Full Auto Deployment Script (run ON the VPS)
# 
# One directory. Pull, build, deploy. Done.
#
# Usage:
#   First time:  bash deploy/deploy.sh
#   Updates:     bash deploy/deploy.sh
#   With SSL:    bash deploy/deploy.sh --ssl
# ============================================================================

set -euo pipefail

# ---- Configuration ----
APP_NAME="ibetpro"
APP_DIR="/home/lightworld/webapps/ibetpro"
LOG_DIR="/home/lightworld/webapps/ibetpro/logs"
DOMAIN="ibetpro.lightworldtech.com"
PORT=3007
SETUP_SSL="${1:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[DEPLOY]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  iBetPro — Auto Deployment${NC}"
echo -e "${BLUE}  ${DOMAIN}:${PORT}${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

cd "${APP_DIR}"

# ============================================================================
# STEP 1: Pull latest code
# ============================================================================
log "Step 1: Pulling latest code..."
git fetch origin main
git reset --hard origin/main
CURRENT_COMMIT=$(git log --oneline -1)
ok "Code updated: ${CURRENT_COMMIT}"

# ============================================================================
# STEP 2: Install dependencies
# ============================================================================
log "Step 2: Installing dependencies..."
npm install --production=false 2>&1 | tail -5
ok "Dependencies installed"

# ============================================================================
# STEP 3: Create .env.production if missing
# ============================================================================
log "Step 3: Checking environment..."

if [ ! -f ".env.production" ]; then
    log "Creating .env.production with default values..."
    cat > .env.production << 'ENVEOF'
DATABASE_URL=mysql://lightworld_db_user:myjesus4mE2018@localhost:3306/lightworld_ibetpro_db
NEXTAUTH_URL=https://ibetpro.lightworldtech.com
NEXTAUTH_SECRET=CHANGE_ME_TO_A_RANDOM_64_CHAR_STRING
TELEGRAM_BOT_TOKEN=8667289261:AAFry07KkbkHEvIgVOP5D2OXgQ0zxdm3i8c
NODE_ENV=production
PORT=3007
HOSTNAME=0.0.0.0
ENVEOF
    warn "Created .env.production — UPDATE NEXTAUTH_SECRET with: openssl rand -base64 48"
fi

ok "Environment file ready"

# ============================================================================
# STEP 4: Generate Prisma client
# ============================================================================
log "Step 4: Generating Prisma client..."
export $(grep -v '^#' ".env.production" | grep DATABASE_URL | xargs)
npx prisma generate 2>&1
ok "Prisma client generated"

# ============================================================================
# STEP 5: Build production bundle
# ============================================================================
log "Step 5: Building production bundle..."
npm run build 2>&1 | tail -10
ok "Build complete"

# ============================================================================
# STEP 6: Copy .env.production → standalone .env
# ============================================================================
log "Step 6: Setting up environment..."

mkdir -p logs

cp .env.production .next/standalone/.env
# Ensure correct domain and port
sed -i "s|NEXTAUTH_URL=.*|NEXTAUTH_URL=https://${DOMAIN}|g" .next/standalone/.env
sed -i "s|PORT=.*|PORT=${PORT}|g" .next/standalone/.env
ok "Environment configured for ${DOMAIN}:${PORT}"

# ============================================================================
# STEP 7: Run database migration
# ============================================================================
log "Step 7: Running database migration..."
export $(grep -v '^#' ".next/standalone/.env" | grep DATABASE_URL | xargs)
npx prisma db push --accept-data-loss 2>&1 && ok "Database schema synced" || warn "DB migration failed — check MySQL connection"

# ============================================================================
# STEP 8: Configure Nginx (Webuzo-compatible)
# ============================================================================
log "Step 8: Configuring Nginx..."

NGINX_TEMPLATE="deploy/nginx/ibetpro-http.conf"
if [ "${SETUP_SSL}" = "--ssl" ] && [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    NGINX_TEMPLATE="deploy/nginx/ibetpro-ssl.conf"
    log "Using SSL config"
fi

# Generate the config content with domain and port replaced
NGINX_CONTENT=$(sed -e "s/yourdomain.com/${DOMAIN}/g" \
    -e "s/www\.yourdomain\.com/www.${DOMAIN}/g" \
    -e "s/127\.0\.0\.1:3000/127.0.0.1:${PORT}/g" \
    "${NGINX_TEMPLATE}" 2>/dev/null || echo "")

if [ -n "${NGINX_CONTENT}" ]; then
    # Try standard Debian/Ubuntu paths first
    if [ -d "/etc/nginx/sites-available" ]; then
        echo "${NGINX_CONTENT}" | sudo tee /etc/nginx/sites-available/ibetpro > /dev/null
        sudo ln -sf /etc/nginx/sites-available/ibetpro /etc/nginx/sites-enabled/ibetpro 2>/dev/null || true
    # Webuzo uses conf.d
    elif [ -d "/etc/nginx/conf.d" ]; then
        echo "${NGINX_CONTENT}" | sudo tee /etc/nginx/conf.d/ibetpro.conf > /dev/null
    # Fallback: try vhosts
    elif [ -d "/etc/nginx/vhosts" ]; then
        echo "${NGINX_CONTENT}" | sudo tee /etc/nginx/vhosts/ibetpro.conf > /dev/null
    else
        warn "Can't find Nginx config directory. Config saved to: ${APP_DIR}/nginx-ibetpro.conf"
        echo "${NGINX_CONTENT}" > "${APP_DIR}/nginx-ibetpro.conf"
        echo "  Install it manually to your Nginx config."
    fi

    if sudo nginx -t 2>&1; then
        sudo systemctl reload nginx 2>/dev/null || sudo nginx -s reload 2>/dev/null || true
        ok "Nginx configured for ${DOMAIN} → :${PORT}"
    else
        warn "Nginx config test failed. Check: sudo nginx -t"
    fi
else
    warn "Nginx template not found. Configure manually."
fi

# ============================================================================
# STEP 9: Start with PM2
# ============================================================================
log "Step 9: Starting application with PM2..."
pm2 delete ibetpro 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save 2>/dev/null || true
ok "Application started"

# ============================================================================
# STEP 10: Health check
# ============================================================================
log "Step 10: Running health check..."
sleep 5
if curl -s -o /dev/null -w "%{http_code}" http://localhost:${PORT} | grep -q "200\|302"; then
    ok "Application is healthy!"
else
    warn "App not responding yet. Check: pm2 logs ibetpro"
fi

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  DEPLOYMENT COMPLETE!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Directory:  ${APP_DIR}"
echo "  Port:       ${PORT}"
echo "  URL:        https://${DOMAIN}"
echo "  Commit:     ${CURRENT_COMMIT}"
echo ""
echo "  Next steps:"
echo "    1. Generate NEXTAUTH_SECRET:"
echo "       openssl rand -base64 48"
echo "       Then update .env.production and re-run: bash deploy/deploy.sh"
echo ""
echo "    2. SSL (first time):"
echo "       sudo certbot --nginx -d ${DOMAIN}"
echo "       Then re-run: bash deploy/deploy.sh --ssl"
echo ""
echo "    3. Telegram webhook:"
echo "       curl -X POST https://${DOMAIN}/api/telegram/setup"
echo ""
echo "    4. Future updates:"
echo "       bash deploy/deploy.sh"
echo ""
echo "  Commands:"
echo "    pm2 logs ibetpro     pm2 restart ibetpro     pm2 status"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
