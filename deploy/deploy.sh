#!/bin/bash
# ============================================================================
# iBetPro — VPS Deployment Script
# Usage: bash deploy/deploy.sh [domain]
# Example: bash deploy/deploy.sh ibetpro.example.com
# ============================================================================

set -euo pipefail

# ---- Configuration ----
APP_NAME="ibetpro"
APP_DIR="/home/ibetpro/app"
LOG_DIR="/home/ibetpro/logs"
NODE_VERSION="20"
DOMAIN="${1:-}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

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

# ---- Pre-flight checks ----
log "Starting iBetPro deployment..."

if [ "$(id -u)" -eq 0 ]; then
    warn "Running as root. Consider creating a dedicated user."
fi

# ---- 1. Install system dependencies ----
log "Step 1: Installing system dependencies..."

if ! command -v node &> /dev/null; then
    log "Installing Node.js ${NODE_VERSION}..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo bash -
    sudo apt-get install -y nodejs
fi

if ! command -v pm2 &> /dev/null; then
    log "Installing PM2..."
    sudo npm install -g pm2
    pm2 startup systemd -u ibetpro --hp /home/ibetpro 2>/dev/null || true
fi

if ! command -v nginx &> /dev/null; then
    log "Installing Nginx..."
    sudo apt-get update
    sudo apt-get install -y nginx
fi

ok "System dependencies installed"

# ---- 2. Create directories ----
log "Step 2: Creating application directories..."

sudo mkdir -p "${APP_DIR}"
sudo mkdir -p "${LOG_DIR}"
sudo chown -R "$(whoami)" "${APP_DIR}" "${LOG_DIR}" 2>/dev/null || true

ok "Directories created"

# ---- 3. Copy application files ----
log "Step 3: Copying application files..."

# Copy the standalone build output
if [ -d ".next/standalone" ]; then
    # Copy standalone server
    rsync -av --delete .next/standalone/ "${APP_DIR}/.next/standalone/"
    # Copy static files
    rsync -av .next/static/ "${APP_DIR}/.next/standalone/.next/static/"
    # Copy public folder
    rsync -av public/ "${APP_DIR}/.next/standalone/public/"
    ok "Standalone build copied"
else
    err "No standalone build found! Run 'npm run build' first."
fi

# Copy Prisma schema and migrations
mkdir -p "${APP_DIR}/prisma/migrations"
cp prisma/schema.prisma "${APP_DIR}/prisma/"
cp prisma.config.ts "${APP_DIR}/" 2>/dev/null || true
# Copy migration SQL files
if [ -d "prisma/migrations" ]; then
    rsync -av prisma/migrations/ "${APP_DIR}/prisma/migrations/"
fi

# Copy ecosystem config
cp ecosystem.config.js "${APP_DIR}/"

# Copy .env.production
if [ -f ".env.production" ]; then
    cp .env.production "${APP_DIR}/.env.production"
    # Also create .env for the standalone server
    cp .env.production "${APP_DIR}/.next/standalone/.env"
    ok "Environment files copied"
else
    warn "No .env.production found! You'll need to create it manually."
fi

# Copy Prisma generated client
if [ -d "src/generated" ]; then
    mkdir -p "${APP_DIR}/.next/standalone/src/generated"
    rsync -av src/generated/ "${APP_DIR}/.next/standalone/src/generated/"
fi

ok "Application files copied"

# ---- 4. Update .env for production ----
log "Step 4: Updating production environment..."

if [ -f "${APP_DIR}/.next/standalone/.env" ]; then
    # Update NEXTAUTH_URL if domain is provided
    if [ -n "${DOMAIN}" ]; then
        sed -i "s|NEXTAUTH_URL=.*|NEXTAUTH_URL=https://${DOMAIN}|g" "${APP_DIR}/.next/standalone/.env"
    fi
    
    ok "Environment updated"
fi

# ---- 5. Run database migration ----
log "Step 5: Running database migration (prisma db push)..."

# Load DATABASE_URL from .env for Prisma CLI
export $(grep -v '^#' "${APP_DIR}/.next/standalone/.env" | grep DATABASE_URL | xargs)

# Use prisma db push to sync schema to MySQL (handles both fresh and existing DBs)
cd "${APP_DIR}"
if npx prisma db push --accept-data-loss 2>&1; then
    ok "Database schema synced to MySQL"
else
    warn "Prisma db push failed. Check MySQL connection and credentials."
    echo "  Manual fallback: mysql -u lightworld_db_user -p lightworld_ibetpro_db < prisma/migrations/0001_mysql_init/migration.sql"
fi

# ---- 6. Configure Nginx ----
log "Step 6: Configuring Nginx..."

if [ -n "${DOMAIN}" ]; then
    # Update domain in nginx config
    NGINX_CONF="deploy/nginx/ibetpro-http.conf"
    if [ -f "${NGINX_CONF}" ]; then
        sed "s/yourdomain.com/${DOMAIN}/g; s/www\.yourdomain\.com/www.${DOMAIN}/g" "${NGINX_CONF}" | \
            sudo tee /etc/nginx/sites-available/ibetpro > /dev/null
        
        # Enable site
        sudo ln -sf /etc/nginx/sites-available/ibetpro /etc/nginx/sites-enabled/ibetpro
        
        # Remove default site
        sudo rm -f /etc/nginx/sites-enabled/default
        
        # Test and reload
        sudo nginx -t && sudo systemctl reload nginx
        ok "Nginx configured for ${DOMAIN}"
    else
        warn "Nginx config template not found. Configure manually."
    fi
else
    warn "No domain provided. Skip Nginx config. Usage: bash deploy/deploy.sh yourdomain.com"
fi

# ---- 7. Start with PM2 ----
log "Step 7: Starting application with PM2..."

cd "${APP_DIR}"

# Stop existing process if running
pm2 delete ibetpro 2>/dev/null || true

# Start the app
pm2 start ecosystem.config.js --env production

# Save PM2 process list (auto-restart on reboot)
pm2 save

ok "Application started with PM2"

# ---- 8. Wait for health check ----
log "Step 8: Running health check..."

sleep 5
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200\|302"; then
    ok "Application is healthy!"
else
    warn "Application may not be responding. Check: pm2 logs ibetpro"
fi

# ---- 9. Register Telegram webhook ----
if [ -n "${DOMAIN}" ]; then
    log "Step 9: Registering Telegram webhook..."
    
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}  TELEGRAM WEBHOOK SETUP${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  To register the webhook, login as admin and call:"
    echo ""
    echo -e "  ${GREEN}curl -X POST https://${DOMAIN}/api/telegram/setup \\${NC}"
    echo -e "  ${GREEN}    -H 'Content-Type: application/json' \\${NC}"
    echo -e "  ${GREEN}    -H 'Cookie: next-auth.session-token=YOUR_SESSION_TOKEN' \\${NC}"
    echo -e "  ${GREEN}    -d '{\"webhookUrl\": \"https://${DOMAIN}\"}'${NC}"
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
fi

# ---- Summary ----
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  DEPLOYMENT COMPLETE!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  App directory: ${APP_DIR}"
echo "  Database:      MySQL (lightworld_ibetpro_db)"
echo "  Logs:          ${LOG_DIR}/"
echo ""
if [ -n "${DOMAIN}" ]; then
    echo "  URL:           https://${DOMAIN}"
    echo ""
    echo "  Next steps:"
    echo "    1. Set up SSL:  sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
    echo "    2. Register Telegram webhook (see above)"
    echo "    3. Connect Telegram: Settings → Connect Telegram"
    echo "    4. Start the bot from the dashboard"
else
    echo "  URL:           http://YOUR_VPS_IP:3000"
    echo ""
    echo "  Next steps:"
    echo "    1. Update .env with your domain and NEXTAUTH_SECRET"
    echo "    2. Configure Nginx: bash deploy/deploy.sh yourdomain.com"
    echo "    3. Set up SSL with certbot"
fi
echo ""
echo "  Useful commands:"
echo "    pm2 logs ibetpro          # View logs"
echo "    pm2 restart ibetpro       # Restart app"
echo "    pm2 monit                 # Monitor resources"
echo "    pm2 status                # Check status"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
