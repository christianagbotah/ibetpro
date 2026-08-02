#!/bin/bash
# ============================================================================
# iBetPro — Quick Update Script (run ON the VPS)
# 
# Pulls latest code, rebuilds, and restarts — fast version of deploy.sh
# Skips Nginx config (assumes already set up)
#
# Usage: bash /home/lightworld/ibetpro-src/deploy/update.sh
# ============================================================================

set -euo pipefail

# ---- Configuration ----
SRC_DIR="/home/lightworld/ibetpro-src"
APP_DIR="/home/lightworld/webapps/ibetpro"
LOG_DIR="/home/lightworld/webapps/ibetpro/logs"
DOMAIN="ibetpro.lightworldtech.com"
PORT=3007

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[UPDATE]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo ""
echo -e "${BLUE}  iBetPro — Quick Update${NC}"
echo ""

# ---- 1. Pull latest code ----
log "Pulling latest code..."
cd "${SRC_DIR}"
git fetch origin main
BEFORE=$(git rev-parse HEAD)
git reset --hard origin/main
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
    warn "No new commits. Already up to date."
else
    ok "Updated to: $(git log --oneline -1)"
fi

# ---- 2. Install dependencies ----
log "Installing dependencies..."
npm install --production=false 2>&1 | tail -3
ok "Dependencies installed"

# ---- 3. Generate Prisma client ----
log "Generating Prisma client..."
if [ -f "${SRC_DIR}/.env.production" ]; then
    export $(grep -v '^#' "${SRC_DIR}/.env.production" | grep DATABASE_URL | xargs)
fi
npx prisma generate 2>&1
ok "Prisma client generated"

# ---- 4. Build ----
log "Building production bundle..."
npm run build 2>&1 | tail -5
ok "Build complete"

# ---- 5. Deploy files ----
log "Deploying to ${APP_DIR}..."

mkdir -p "${LOG_DIR}"
mkdir -p "${APP_DIR}/prisma/migrations"

# Standalone build
rsync -av --delete "${SRC_DIR}/.next/standalone/" "${APP_DIR}/.next/standalone/"
rsync -av "${SRC_DIR}/.next/static/" "${APP_DIR}/.next/standalone/.next/static/"
rsync -av "${SRC_DIR}/public/" "${APP_DIR}/.next/standalone/public/"

# Prisma generated client
if [ -d "${SRC_DIR}/src/generated" ]; then
    mkdir -p "${APP_DIR}/.next/standalone/src/generated"
    rsync -av "${SRC_DIR}/src/generated/" "${APP_DIR}/.next/standalone/src/generated/"
fi

# Prisma schema and migrations
cp "${SRC_DIR}/prisma/schema.prisma" "${APP_DIR}/prisma/"
if [ -d "${SRC_DIR}/prisma/migrations" ]; then
    rsync -av "${SRC_DIR}/prisma/migrations/" "${APP_DIR}/prisma/migrations/"
fi

# Environment file
if [ -f "${SRC_DIR}/.env.production" ]; then
    cp "${SRC_DIR}/.env.production" "${APP_DIR}/.next/standalone/.env"
fi

# Ecosystem config
cp "${SRC_DIR}/ecosystem.config.js" "${APP_DIR}/"

ok "Files deployed"

# ---- 6. Run database migration ----
log "Running database migration..."
export $(grep -v '^#' "${APP_DIR}/.next/standalone/.env" | grep DATABASE_URL | xargs)
cd "${APP_DIR}"
npx prisma db push --accept-data-loss 2>&1 && ok "DB schema synced" || warn "DB migration failed"

# ---- 7. Restart PM2 ----
log "Restarting application..."
pm2 restart ibetpro 2>/dev/null || pm2 start ecosystem.config.js --env production
pm2 save 2>/dev/null || true
ok "Application restarted"

# ---- 8. Health check ----
log "Running health check..."
sleep 3
if curl -s -o /dev/null -w "%{http_code}" http://localhost:${PORT} | grep -q "200\|302"; then
    ok "Application is healthy!"
else
    warn "App not responding yet. Check: pm2 logs ibetpro"
fi

echo ""
ok "Update complete! https://${DOMAIN}"
