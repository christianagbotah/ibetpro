#!/bin/bash
# ============================================================================
# iBetPro — VPS First-Time Setup (run as root ONCE)
# Installs Node.js, PM2, Nginx, Certbot, clones the repo
# Usage: sudo bash deploy/setup-vps.sh
# ============================================================================

set -euo pipefail

APP_USER="lightworld"
APP_DIR="/home/lightworld/webapps/ibetpro"
REPO_URL="https://github.com/christianagbotah/ibetpro.git"
NODE_MAJOR=20
PORT=3007
DOMAIN="ibetpro.lightworldtech.com"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[SETUP]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

[ "$(id -u)" -ne 0 ] && err "Run as root: sudo bash deploy/setup-vps.sh"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  iBetPro — VPS First-Time Setup${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ---- 1. System ----
log "Step 1: Updating system..."
apt-get update -y && apt-get upgrade -y
ok "System updated"

# ---- 2. Node.js ----
if ! command -v node &> /dev/null; then
    log "Step 2: Installing Node.js ${NODE_MAJOR}..."
    apt-get install -y ca-certificates curl gnupg
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
    apt-get update -y && apt-get install -y nodejs
fi
ok "Node.js $(node -v)"

# ---- 3. PM2 ----
if ! command -v pm2 &> /dev/null; then
    log "Step 3: Installing PM2..."
    npm install -g pm2
fi
ok "PM2 $(pm2 -v)"

# ---- 4. Nginx ----
if ! command -v nginx &> /dev/null; then
    log "Step 4: Installing Nginx..."
    apt-get install -y nginx && systemctl enable nginx && systemctl start nginx
else
    log "Step 4: Nginx already installed"
fi
ok "Nginx ready"

# ---- 5. Certbot ----
if ! command -v certbot &> /dev/null; then
    log "Step 5: Installing Certbot..."
    apt-get install -y certbot python3-certbot-nginx
fi
ok "Certbot ready"

# ---- 6. Clone repo ----
log "Step 6: Cloning repository to ${APP_DIR}..."
if [ -d "${APP_DIR}/.git" ]; then
    warn "Directory already exists. Pulling latest..."
    cd "${APP_DIR}" && git pull origin main
else
    mkdir -p "$(dirname "${APP_DIR}")"
    git clone "${REPO_URL}" "${APP_DIR}"
fi
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}" 2>/dev/null || true
ok "Source code ready at ${APP_DIR}"

# ---- 7. PM2 startup ----
log "Step 7: Configuring PM2 startup..."
su - "${APP_USER}" -c "pm2 startup systemd -u ${APP_USER} --hp /home/${APP_USER}" 2>/dev/null || true
ok "PM2 startup configured"

# ---- 8. System tuning ----
log "Step 8: Optimizing system..."
if ! grep -q "fs.inotify" /etc/sysctl.conf; then
    echo "fs.inotify.max_user_watches=524288" >> /etc/sysctl.conf
    sysctl -p
fi
ok "System optimized"

# ---- 9. Firewall ----
log "Step 9: Firewall..."
if command -v ufw &> /dev/null; then
    ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
    ok "Firewall configured"
else
    warn "UFW not available. Ensure ports 80/443 are open in Webuzo firewall."
fi

# ---- Summary ----
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  VPS SETUP COMPLETE!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Repo:     ${APP_DIR}"
echo "  Node:     $(node -v)"
echo "  PM2:      $(pm2 -v)"
echo ""
echo "  Now run the deployment (as lightworld user):"
echo "    su - lightworld"
echo "    cd ${APP_DIR}"
echo "    bash deploy/deploy.sh"
echo ""
echo "  Then set up SSL:"
echo "    sudo certbot --nginx -d ${DOMAIN}"
echo "    bash deploy/deploy.sh --ssl"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
