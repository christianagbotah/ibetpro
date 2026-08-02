#!/bin/bash
# ============================================================================
# iBetPro — Quick Update Script
# VPS: ibetpro.lightworldtech.com
# Run this after making code changes to rebuild and redeploy
# Usage: bash deploy/update.sh
# ============================================================================

set -euo pipefail

APP_DIR="/home/lightworld/webapps/ibetpro"
DOMAIN="ibetpro.lightworldtech.com"
PORT=3007

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[UPDATE]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ---- 1. Build ----
log "Building production bundle..."
npm run build
ok "Build complete"

# ---- 2. Copy files ----
log "Copying files to ${APP_DIR}..."

# Standalone server
rsync -av --delete .next/standalone/ "${APP_DIR}/.next/standalone/"

# Static files
rsync -av .next/static/ "${APP_DIR}/.next/standalone/.next/static/"

# Public folder
rsync -av public/ "${APP_DIR}/.next/standalone/public/"

# Prisma generated client
if [ -d "src/generated" ]; then
    mkdir -p "${APP_DIR}/.next/standalone/src/generated"
    rsync -av src/generated/ "${APP_DIR}/.next/standalone/src/generated/"
fi

# Prisma schema and migrations
mkdir -p "${APP_DIR}/prisma/migrations"
cp prisma/schema.prisma "${APP_DIR}/prisma/"
if [ -d "prisma/migrations" ]; then
    rsync -av prisma/migrations/ "${APP_DIR}/prisma/migrations/"
fi

# Environment file
if [ -f ".env.production" ]; then
    cp .env.production "${APP_DIR}/.next/standalone/.env"
fi

# Ecosystem config
cp ecosystem.config.js "${APP_DIR}/"

ok "Files copied"

# ---- 3. Restart PM2 ----
log "Restarting application..."
cd "${APP_DIR}"
pm2 restart ibetpro
ok "Application restarted"

# ---- 4. Health check ----
log "Running health check..."
sleep 3
if curl -s -o /dev/null -w "%{http_code}" http://localhost:${PORT} | grep -q "200\|302"; then
    ok "Application is healthy!"
else
    err "Application not responding! Check: pm2 logs ibetpro"
fi

echo ""
ok "Update complete! App is running at http://localhost:${PORT}"
echo "  Public URL: https://${DOMAIN}"
