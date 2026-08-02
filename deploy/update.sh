#!/bin/bash
# ============================================================================
# iBetPro — Quick Update (pull, build, restart)
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

cd "${APP_DIR}"

# ---- 1. Pull ----
log "Pulling latest code..."
BEFORE=$(git rev-parse HEAD)
git pull origin main
AFTER=$(git rev-parse HEAD)
[ "$BEFORE" = "$AFTER" ] && echo "  Already up to date." || ok "Updated: $(git log --oneline -1)"

# ---- 2. Install & generate ----
log "Installing dependencies..."
npm install --production=false 2>&1 | tail -3

if [ -f ".env.production" ]; then
    export $(grep -v '^#' ".env.production" | grep DATABASE_URL | xargs)
fi
npx prisma generate 2>&1

# ---- 3. Build ----
log "Building..."
npm run build 2>&1 | tail -5
ok "Build complete"

# ---- 4. Copy env ----
if [ -f ".env.production" ]; then
    cp .env.production .next/standalone/.env
    sed -i "s|NEXTAUTH_URL=.*|NEXTAUTH_URL=https://${DOMAIN}|g" .next/standalone/.env
    sed -i "s|PORT=.*|PORT=${PORT}|g" .next/standalone/.env
fi

# ---- 5. DB migration ----
log "Running DB migration..."
if [ -f ".next/standalone/.env" ]; then
    export $(grep -v '^#' ".next/standalone/.env" | grep DATABASE_URL | xargs)
fi
npx prisma db push --accept-data-loss 2>&1 && ok "DB synced" || echo "  DB migration skipped"

# ---- 6. Restart ----
log "Restarting PM2..."
pm2 restart ibetpro 2>/dev/null || pm2 start ecosystem.config.js --env production
pm2 save 2>/dev/null || true

sleep 3
if curl -s -o /dev/null -w "%{http_code}" http://localhost:${PORT} | grep -q "200\|302"; then
    ok "Healthy! https://${DOMAIN}"
else
    echo "  Not responding yet — check: pm2 logs ibetpro"
fi
