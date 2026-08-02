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
# STEP 3: Generate Prisma client
# ============================================================================
log "Step 3: Generating Prisma client..."
if [ -f ".env.production" ]; then
    export $(grep -v '^#' ".env.production" | grep DATABASE_URL | xargs)
fi
npx prisma generate 2>&1
ok "Prisma client generated"

# ============================================================================
# STEP 4: Build production bundle
# ============================================================================
log "Step 4: Building production bundle..."
npm run build 2>&1 | tail -10
ok "Build complete"

# ============================================================================
# STEP 5: Copy .env.production → standalone .env
# ============================================================================
log "Step 5: Setting up environment..."

mkdir -p logs

if [ -f ".env.production" ]; then
    cp .env.production .next/standalone/.env
    # Ensure correct domain and port
    sed -i "s|NEXTAUTH_URL=.*|NEXTAUTH_URL=https://${DOMAIN}|g" .next/standalone/.env
    sed -i "s|PORT=.*|PORT=${PORT}|g" .next/standalone/.env
    ok "Environment configured for ${DOMAIN}:${PORT}"
else
    warn "No .env.production found! Create it manually."
fi

# ============================================================================
# STEP 6: Run database migration
# ============================================================================
log "Step 6: Running database migration..."
if [ -f ".next/standalone/.env" ]; then
    export $(grep -v '^#' ".next/standalone/.env" | grep DATABASE_URL | xargs)
fi
npx prisma db push --accept-data-loss 2>&1 && ok "Database schema synced" || warn "DB migration failed — check MySQL connection"

# ============================================================================
# STEP 7: Configure Nginx
# ============================================================================
log "Step 7: Configuring Nginx..."

NGINX_CONF="deploy/nginx/ibetpro-http.conf"
if [ "${SETUP_SSL}" = "--ssl" ] && [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    NGINX_CONF="deploy/nginx/ibetpro-ssl.conf"
    log "Using SSL config"
fi

if [ -f "${NGINX_CONF}" ]; then
    sed -e "s/yourdomain.com/${DOMAIN}/g" \
        -e "s/www\.yourdomain\.com/www.${DOMAIN}/g" \
        -e "s/127\.0\.0\.1:3000/127.0.0.1:${PORT}/g" \
        "${NGINX_CONF}" | sudo tee /etc/nginx/sites-available/ibetpro > /dev/null

    sudo ln -sf /etc/nginx/sites-available/ibetpro /etc/nginx/sites-enabled/ibetpro
    sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

    if sudo nginx -t 2>&1; then
        sudo systemctl reload nginx
        ok "Nginx configured for ${DOMAIN} → :${PORT}"
    else
        warn "Nginx config test failed. Check: sudo nginx -t"
    fi
else
    warn "Nginx config not found at ${NGINX_CONF}"
fi

# ============================================================================
# STEP 8: Start with PM2
# ============================================================================
log "Step 8: Starting application with PM2..."
pm2 delete ibetpro 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save 2>/dev/null || true
ok "Application started"

# ============================================================================
# STEP 9: Health check
# ============================================================================
log "Step 9: Running health check..."
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
echo "    1. SSL (first time): sudo certbot --nginx -d ${DOMAIN}"
echo "       Then re-run: bash deploy/deploy.sh --ssl"
echo "    2. Telegram webhook: curl -X POST https://${DOMAIN}/api/telegram/setup"
echo "    3. Future updates:   bash deploy/deploy.sh"
echo ""
echo "  Commands:"
echo "    pm2 logs ibetpro     pm2 restart ibetpro     pm2 status"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
