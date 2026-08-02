#!/bin/bash
# ============================================================================
# iBetPro — VPS First-Time Setup (run as root on a Webuzo VPS)
# VPS: ibetpro.lightworldtech.com
# This installs Node.js, PM2, Nginx, and prepares the server
# Usage: sudo bash deploy/setup-vps.sh
# ============================================================================

set -euo pipefail

APP_USER="lightworld"
APP_DIR="/home/lightworld/webapps/ibetpro"
LOG_DIR="/home/lightworld/webapps/ibetpro/logs"
NODE_MAJOR=20
PORT=3007

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[SETUP]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ---- Check root ----
if [ "$(id -u)" -ne 0 ]; then
    err "This script must be run as root. Use: sudo bash deploy/setup-vps.sh"
fi

log "Starting VPS setup for iBetPro..."

# ---- 1. Update system ----
log "Step 1: Updating system packages..."
apt-get update -y
apt-get upgrade -y
ok "System updated"

# ---- 2. Install Node.js ----
if ! command -v node &> /dev/null; then
    log "Step 2: Installing Node.js ${NODE_MAJOR}..."
    apt-get install -y ca-certificates curl gnupg
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
    apt-get update -y
    apt-get install -y nodejs
fi
ok "Node.js $(node -v) installed"

# ---- 3. Install PM2 ----
if ! command -v pm2 &> /dev/null; then
    log "Step 3: Installing PM2..."
    npm install -g pm2
fi
ok "PM2 $(pm2 -v) installed"

# ---- 4. Install Nginx (Webuzo may already have it) ----
if ! command -v nginx &> /dev/null; then
    log "Step 4: Installing Nginx..."
    apt-get install -y nginx
    systemctl enable nginx
    systemctl start nginx
else
    log "Step 4: Nginx already installed (Webuzo managed)"
fi
ok "Nginx ready"

# ---- 5. Install Certbot (Let's Encrypt) ----
if ! command -v certbot &> /dev/null; then
    log "Step 5: Installing Certbot..."
    apt-get install -y certbot python3-certbot-nginx
fi
ok "Certbot installed"

# ---- 6. Create directories ----
log "Step 6: Creating application directories..."
mkdir -p "${APP_DIR}"
mkdir -p "${LOG_DIR}"
mkdir -p "${APP_DIR}/prisma/migrations"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}" 2>/dev/null || true
ok "Directories created"

# ---- 7. Configure PM2 startup ----
log "Step 7: Configuring PM2 startup..."
su - "${APP_USER}" -c "pm2 startup systemd -u ${APP_USER} --hp /home/${APP_USER}" 2>/dev/null || true
ok "PM2 startup configured"

# ---- 8. Optimize system for Node.js ----
log "Step 8: Optimizing system for Node.js..."

# Increase file watch limit
if ! grep -q "fs.inotify" /etc/sysctl.conf; then
    echo "fs.inotify.max_user_watches=524288" >> /etc/sysctl.conf
    sysctl -p
fi

ok "System optimized"

# ---- 9. Open port in firewall ----
log "Step 9: Configuring firewall..."
if command -v ufw &> /dev/null; then
    ufw allow OpenSSH
    ufw allow 'Nginx Full'
    ufw --force enable
    ok "Firewall configured (SSH + HTTP/HTTPS)"
else
    warn "UFW not available. If using Webuzo firewall, ensure ports 80/443 are open."
fi

# ---- Summary ----
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  VPS SETUP COMPLETE!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  App user:       ${APP_USER}"
echo "  App directory:  ${APP_DIR}"
echo "  App port:       ${PORT}"
echo "  Logs:           ${LOG_DIR}"
echo ""
echo "  Node.js:  $(node -v)"
echo "  PM2:      $(pm2 -v)"
echo "  Nginx:    $(nginx -v 2>&1)"
echo ""
echo "  Next steps:"
echo "    1. From your LOCAL machine, run:"
echo "       bash deploy/deploy.sh"
echo ""
echo "    2. Set up SSL:"
echo "       sudo certbot --nginx -d ibetpro.lightworldtech.com"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
