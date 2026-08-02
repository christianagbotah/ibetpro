#!/bin/bash
# ============================================================================
# iBetPro — Full Auto Deployment Script (run ON the VPS)
# 
# This script handles EVERYTHING:
#   - Clones or pulls the latest code from GitHub
#   - Installs dependencies
#   - Builds the production bundle
#   - Copies the standalone build to the webapps directory
#   - Runs database migration
#   - Configures Nginx
#   - Starts/restarts PM2
#   - Runs health check
#
# Usage:
#   First time:  bash deploy/deploy.sh
#   Updates:     bash deploy/deploy.sh
#   With SSL:    bash deploy/deploy.sh --ssl
# ============================================================================

set -euo pipefail

# ---- Configuration ----
APP_NAME="ibetpro"
REPO_URL="https://github.com/christianagbotah/ibetpro.git"
SRC_DIR="/home/lightworld/ibetpro-src"          # where source code lives
APP_DIR="/home/lightworld/webapps/ibetpro"       # where production runtime lives
LOG_DIR="/home/lightworld/webapps/ibetpro/logs"
NODE_VERSION="20"
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
echo -e "${BLUE}  iBetPro — Full Auto Deployment${NC}"
echo -e "${BLUE}  Domain: ${DOMAIN}  Port: ${PORT}${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ============================================================================
# STEP 1: Clone or pull source code
# ============================================================================
log "Step 1: Fetching latest source code..."

if [ -d "${SRC_DIR}/.git" ]; then
    # Existing repo — pull latest
    cd "${SRC_DIR}"
    git fetch origin main
    git reset --hard origin/main
    ok "Source code updated (git pull)"
else
    # First time — clone
    mkdir -p "$(dirname "${SRC_DIR}")"
    git clone "${REPO_URL}" "${SRC_DIR}"
    cd "${SRC_DIR}"
    ok "Source code cloned from GitHub"
fi

# Show current commit
CURRENT_COMMIT=$(git log --oneline -1)
log "Current commit: ${CURRENT_COMMIT}"

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

# Load DATABASE_URL from .env.production if it exists
if [ -f "${SRC_DIR}/.env.production" ]; then
    export $(grep -v '^#' "${SRC_DIR}/.env.production" | grep DATABASE_URL | xargs)
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
# STEP 5: Deploy to webapps directory
# ============================================================================
log "Step 5: Deploying to ${APP_DIR}..."

# Create directories
mkdir -p "${APP_DIR}"
mkdir -p "${LOG_DIR}"
mkdir -p "${APP_DIR}/prisma/migrations"

# Copy the standalone build output
if [ -d "${SRC_DIR}/.next/standalone" ]; then
    rsync -av --delete "${SRC_DIR}/.next/standalone/" "${APP_DIR}/.next/standalone/"
    rsync -av "${SRC_DIR}/.next/static/" "${APP_DIR}/.next/standalone/.next/static/"
    rsync -av "${SRC_DIR}/public/" "${APP_DIR}/.next/standalone/public/"
    ok "Standalone build copied"
else
    err "No standalone build found! Build may have failed."
fi

# Copy Prisma schema and migrations
cp "${SRC_DIR}/prisma/schema.prisma" "${APP_DIR}/prisma/"
cp "${SRC_DIR}/prisma.config.ts" "${APP_DIR}/" 2>/dev/null || true
if [ -d "${SRC_DIR}/prisma/migrations" ]; then
    rsync -av "${SRC_DIR}/prisma/migrations/" "${APP_DIR}/prisma/migrations/"
fi

# Copy Prisma generated client
if [ -d "${SRC_DIR}/src/generated" ]; then
    mkdir -p "${APP_DIR}/.next/standalone/src/generated"
    rsync -av "${SRC_DIR}/src/generated/" "${APP_DIR}/.next/standalone/src/generated/"
fi

# Copy ecosystem config
cp "${SRC_DIR}/ecosystem.config.js" "${APP_DIR}/"

# Copy .env.production → .env for standalone server
if [ -f "${SRC_DIR}/.env.production" ]; then
    cp "${SRC_DIR}/.env.production" "${APP_DIR}/.env.production"
    cp "${SRC_DIR}/.env.production" "${APP_DIR}/.next/standalone/.env"
    ok "Environment files copied"
else
    warn "No .env.production found! You'll need to create it manually."
fi

# Ensure .env has correct domain and port
if [ -f "${APP_DIR}/.next/standalone/.env" ]; then
    sed -i "s|NEXTAUTH_URL=.*|NEXTAUTH_URL=https://${DOMAIN}|g" "${APP_DIR}/.next/standalone/.env"
    sed -i "s|PORT=.*|PORT=${PORT}|g" "${APP_DIR}/.next/standalone/.env"
    ok "Environment updated for ${DOMAIN}:${PORT}"
fi

ok "All files deployed to ${APP_DIR}"

# ============================================================================
# STEP 6: Run database migration
# ============================================================================
log "Step 6: Running database migration..."

# Load DATABASE_URL from .env
export $(grep -v '^#' "${APP_DIR}/.next/standalone/.env" | grep DATABASE_URL | xargs)

cd "${APP_DIR}"
if npx prisma db push --accept-data-loss 2>&1; then
    ok "Database schema synced to MySQL"
else
    warn "Prisma db push failed. Check MySQL connection and credentials."
    echo "  Manual fallback: mysql -u lightworld_db_user -p lightworld_ibetpro_db < prisma/migrations/0001_mysql_init/migration.sql"
fi

# ============================================================================
# STEP 7: Configure Nginx
# ============================================================================
log "Step 7: Configuring Nginx..."

NGINX_CONF="${SRC_DIR}/deploy/nginx/ibetpro-http.conf"
if [ -f "${NGINX_CONF}" ]; then
    # If --ssl flag passed and SSL cert exists, use SSL config instead
    if [ "${SETUP_SSL}" = "--ssl" ] && [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
        NGINX_CONF="${SRC_DIR}/deploy/nginx/ibetpro-ssl.conf"
        log "Using SSL nginx config"
    fi

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
    warn "Nginx config template not found at ${NGINX_CONF}"
fi

# ============================================================================
# STEP 8: Start with PM2
# ============================================================================
log "Step 8: Starting application with PM2 on port ${PORT}..."

cd "${APP_DIR}"

# Stop existing process if running
pm2 delete ibetpro 2>/dev/null || true

# Start the app
pm2 start ecosystem.config.js --env production

# Save PM2 process list (auto-restart on reboot)
pm2 save 2>/dev/null || true

ok "Application started with PM2"

# ============================================================================
# STEP 9: Health check
# ============================================================================
log "Step 9: Running health check..."

sleep 5
if curl -s -o /dev/null -w "%{http_code}" http://localhost:${PORT} | grep -q "200\|302"; then
    ok "Application is healthy!"
else
    warn "Application may not be responding yet. Check: pm2 logs ibetpro"
fi

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  DEPLOYMENT COMPLETE!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Source code:   ${SRC_DIR}"
echo "  App runtime:   ${APP_DIR}"
echo "  Port:          ${PORT}"
echo "  Database:      MySQL (lightworld_ibetpro_db)"
echo "  Logs:          ${LOG_DIR}/"
echo "  URL:           https://${DOMAIN}"
echo "  Commit:        ${CURRENT_COMMIT}"
echo ""
echo "  Next steps:"
echo "    1. Set up SSL (first time only):"
echo "       sudo certbot --nginx -d ${DOMAIN}"
echo "       Then re-run: bash deploy/deploy.sh --ssl"
echo ""
echo "    2. Register Telegram webhook:"
echo "       curl -X POST https://${DOMAIN}/api/telegram/setup"
echo ""
echo "    3. For future updates, just run:"
echo "       bash ${SRC_DIR}/deploy/deploy.sh"
echo ""
echo "  Useful commands:"
echo "    pm2 logs ibetpro          # View logs"
echo "    pm2 restart ibetpro       # Restart app"
echo "    pm2 monit                 # Monitor resources"
echo "    pm2 status                # Check status"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
