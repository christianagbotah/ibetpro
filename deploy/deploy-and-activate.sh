#!/bin/bash
# ============================================================================
# iBetPro — Full Deployment + Telegram Bot Activation
#
# Run this ON the VPS as root or with sudo:
#   cd /home/lightworld/webapps/ibetpro
#   bash deploy/deploy-and-activate.sh
#
# What it does:
#   1. Pulls latest code
#   2. Installs deps
#   3. Updates .env.production with secure credentials
#   4. Builds production bundle
#   5. Runs DB migrations
#   6. Starts with PM2
#   7. Sets up SSL (if not already done)
#   8. Registers Telegram bot webhook
#   9. Verifies everything works
# ============================================================================

set -euo pipefail

# ---- Configuration ----
APP_NAME="ibetpro"
APP_DIR="/home/lightworld/webapps/ibetpro"
DOMAIN="ibetpro.lightworldtech.com"
PORT=3007
BOT_TOKEN="8667289261:AAFry07KkbkHEvIgVOP5D2OXgQ0zxdm3i8c"
DB_URL="mysql://lightworld_db_user:myjesus4mE2018@localhost:3306/lightworld_ibetpro_db"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${BLUE}[DEPLOY]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
step() { echo -e "\n${CYAN}━━━ Step $1: $2 ━━━${NC}"; }

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  iBetPro — Full Deployment + Telegram Activation${NC}"
echo -e "${BLUE}  ${DOMAIN}:${PORT}${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

cd "${APP_DIR}"

# ============================================================================
# STEP 1: Pull latest code
# ============================================================================
step 1 "Pulling latest code"
git fetch origin main
git reset --hard origin/main
CURRENT_COMMIT=$(git log --oneline -1)
ok "Code updated: ${CURRENT_COMMIT}"

# ============================================================================
# STEP 2: Install dependencies
# ============================================================================
step 2 "Installing dependencies"
npm install --production=false 2>&1 | tail -5
ok "Dependencies installed"

# ============================================================================
# STEP 3: Generate secure NEXTAUTH_SECRET & update .env.production
# ============================================================================
step 3 "Configuring environment"

# Generate a strong NEXTAUTH_SECRET
NEXTAUTH_SECRET=$(openssl rand -base64 48)

# Generate a strong admin password
ADMIN_PASSWORD="iBP$(openssl rand -base64 16 | tr -d '=/+' | head -c 20)!"

cat > .env.production << ENVEOF
DATABASE_URL=${DB_URL}
NEXTAUTH_URL=https://${DOMAIN}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
ADMIN_EMAIL=admin@ibetpro.com
ADMIN_PASSWORD=${ADMIN_PASSWORD}
TELEGRAM_BOT_TOKEN=${BOT_TOKEN}
ODDS_API_KEY=87da024b9f311a386a05b9aa6ca40dbe
CRON_SECRET=ibp_cron_2024_s3cur3
NODE_ENV=production
PORT=${PORT}
HOSTNAME=0.0.0.0
ENVEOF

ok "Environment configured with secure credentials"
echo ""
echo -e "  ${YELLOW}Admin Credentials (SAVE THESE!):${NC}"
echo -e "  ${GREEN}Email:    admin@ibetpro.com${NC}"
echo -e "  ${GREEN}Password: ${ADMIN_PASSWORD}${NC}"
echo ""

# ============================================================================
# STEP 4: Generate Prisma client
# ============================================================================
step 4 "Generating Prisma client"
export DATABASE_URL="${DB_URL}"
npx prisma generate 2>&1
ok "Prisma client generated"

# ============================================================================
# STEP 5: Build production bundle
# ============================================================================
step 5 "Building production bundle"
npm run build 2>&1 | tail -15
ok "Build complete"

# ============================================================================
# STEP 6: Copy .env.production → standalone .env
# ============================================================================
step 6 "Setting up standalone environment"

mkdir -p logs
cp .env.production .next/standalone/.env

ok "Environment configured for ${DOMAIN}:${PORT}"

# ============================================================================
# STEP 7: Run database migration
# ============================================================================
step 7 "Running database migration"
export DATABASE_URL="${DB_URL}"

# Verify MySQL connection first
log "Checking MySQL connection..."
if mysql -u lightworld_db_user -pmyjesus4mE2018 -h localhost lightworld_ibetpro_db -e "SELECT 1;" &>/dev/null; then
    ok "MySQL connection verified"
else
    warn "Direct MySQL test failed, continuing with Prisma anyway..."
fi

# Use prisma db push as primary — it's idempotent and handles schema drift
# (migrate deploy fails on existing DBs that were set up with db push)
if npx prisma db push --accept-data-loss 2>&1; then
    ok "Database schema synced via db push"
else
    err "Database migration FAILED — check MySQL connection and schema"
fi

# Post-migration: Verify critical columns exist
log "Verifying critical database columns..."
if mysql -u lightworld_db_user -pmyjesus4mE2018 -h localhost lightworld_ibetpro_db -e "SELECT timezone FROM UserSettings LIMIT 1;" &>/dev/null; then
    ok "UserSettings.timezone column exists"
else
    warn "UserSettings.timezone column missing — adding it now..."
    mysql -u lightworld_db_user -pmyjesus4mE2018 -h localhost lightworld_ibetpro_db \
        -e "ALTER TABLE UserSettings ADD COLUMN timezone VARCHAR(191) NOT NULL DEFAULT 'Africa/Accra';" 2>&1
    if [ $? -eq 0 ]; then
        ok "UserSettings.timezone column added successfully"
    else
        warn "Could not add timezone column (may already exist). Check manually."
    fi
fi

# ============================================================================
# STEP 8: Start with PM2
# ============================================================================
step 8 "Starting application with PM2"
pm2 delete ibetpro 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save 2>/dev/null || true
ok "Application started"

# ============================================================================
# STEP 9: Health check
# ============================================================================
step 9 "Running health check"
sleep 5
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:${PORT} 2>/dev/null || echo "000")
if echo "${HTTP_CODE}" | grep -q "200\|302"; then
    ok "Application is healthy! (HTTP ${HTTP_CODE})"
else
    warn "App not responding yet (HTTP ${HTTP_CODE}). Check: pm2 logs ibetpro"
    sleep 5
    HTTP_CODE2=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:${PORT} 2>/dev/null || echo "000")
    if echo "${HTTP_CODE2}" | grep -q "200\|302"; then
        ok "Application is now healthy! (HTTP ${HTTP_CODE2})"
    else
        warn "Still not responding. Check logs: pm2 logs ibetpro"
    fi
fi

# ============================================================================
# STEP 10: SSL check (skip — already configured on VPS)
# ============================================================================
step 10 "Checking SSL"
SSL_CONFIGURED=false
if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    SSL_CONFIGURED=true
    ok "SSL certificate already exists"
else
    warn "SSL cert not found at /etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
    echo "  SSL is assumed to be pre-configured on this VPS. No action taken."
fi

# ============================================================================
# STEP 11: Register Telegram Bot Webhook
# ============================================================================
step 11 "Activating Telegram Bot"

WEBHOOK_URL="https://${DOMAIN}/api/telegram/webhook"

log "Registering webhook: ${WEBHOOK_URL}"

# Register the webhook with Telegram
WEBHOOK_RESULT=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"${WEBHOOK_URL}\", \"allowed_updates\": [\"message\", \"callback_query\"], \"drop_pending_updates\": true}")

WEBHOOK_OK=$(echo "${WEBHOOK_RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok', False))" 2>/dev/null || echo "false")

if [ "${WEBHOOK_OK}" = "True" ]; then
    ok "Telegram webhook registered successfully!"
else
    warn "Webhook registration may have failed. Response: ${WEBHOOK_RESULT}"
    echo "  Note: SSL must be working for webhook to succeed."
fi

# Set bot commands
log "Setting bot commands..."
COMMANDS_RESULT=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands" \
    -H "Content-Type: application/json" \
    -d '{"commands": [{"command": "start", "description": "Connect your iBetPro account"}, {"command": "help", "description": "Show available commands"}, {"command": "status", "description": "View your bot status & stats"}, {"command": "stop", "description": "Pause tip notifications"}, {"command": "resume", "description": "Resume tip notifications"}, {"command": "settings", "description": "View your AI tip preferences"}]}')

COMMANDS_OK=$(echo "${COMMANDS_RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok', False))" 2>/dev/null || echo "false")

if [ "${COMMANDS_OK}" = "True" ]; then
    ok "Bot commands set!"
else
    warn "Setting commands may have failed. Response: ${COMMANDS_RESULT}"
fi

# Get bot info
BOT_INFO=$(curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getMe")
BOT_USERNAME=$(echo "${BOT_INFO}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('result',{}).get('username','unknown'))" 2>/dev/null || echo "unknown")

# Verify webhook info
WEBHOOK_INFO=$(curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo")

echo ""
ok "Telegram Bot: @${BOT_USERNAME}"
echo "  Webhook URL: ${WEBHOOK_URL}"

# SSL/Nginx config is pre-configured on the VPS — skip rewriting it every deploy
# If you need to update Nginx config, do it manually on the VPS.

# ============================================================================
# FINAL SUMMARY
# ============================================================================
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  DEPLOYMENT COMPLETE!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  App URL:     https://${DOMAIN}"
echo "  Port:        ${PORT}"
echo "  Commit:      ${CURRENT_COMMIT}"
echo "  Bot:         @${BOT_USERNAME}"
echo "  Webhook:     ${WEBHOOK_URL}"
echo ""
echo -e "  ${YELLOW}Admin Credentials (SAVE THESE!):${NC}"
echo -e "  ${GREEN}Email:    admin@ibetpro.com${NC}"
echo -e "  ${GREEN}Password: ${ADMIN_PASSWORD}${NC}"
echo ""
echo "  Next steps:"
echo "    1. Open https://${DOMAIN} and log in with admin credentials"
echo "    2. Open Telegram, search @${BOT_USERNAME}"
echo "    3. Send /start to the bot"
echo "    4. In iBetPro Settings, click 'Connect Telegram'"
echo ""
echo "  Useful commands:"
echo "    pm2 logs ibetpro          — View app logs"
echo "    pm2 restart ibetpro       — Restart app"
echo "    pm2 status                — Check PM2 status"
echo "    curl https://${DOMAIN}/api/telegram/webhook  — Check webhook info"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
