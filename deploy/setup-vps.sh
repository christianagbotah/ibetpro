#!/bin/bash
# ============================================================================
# iBetPro — VPS First-Time Setup (run as root on a fresh Webuzo VPS)
# This installs Node.js, PM2, Nginx, and prepares the server
# Usage: sudo bash deploy/setup-vps.sh
# ============================================================================

set -euo pipefail

APP_USER="ibetpro"
APP_DIR="/home/ibetpro/app"
DB_DIR="/home/ibetpro/db"
LOG_DIR="/home/ibetpro/logs"
NODE_MAJOR=20

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

# ---- 4. Install Nginx ----
if ! command -v nginx &> /dev/null; then
    log "Step 4: Installing Nginx..."
    apt-get install -y nginx
    systemctl enable nginx
    systemctl start nginx
fi
ok "Nginx installed"

# ---- 5. Install Certbot (Let's Encrypt) ----
if ! command -v certbot &> /dev/null; then
    log "Step 5: Installing Certbot..."
    apt-get install -y certbot python3-certbot-nginx
fi
ok "Certbot installed"

# ---- 6. Create application user ----
if ! id "${APP_USER}" &> /dev/null; then
    log "Step 6: Creating application user '${APP_USER}'..."
    useradd -m -s /bin/bash "${APP_USER}"
    ok "User '${APP_USER}' created"
else
    warn "User '${APP_USER}' already exists"
fi

# ---- 7. Create directories ----
log "Step 7: Creating application directories..."
mkdir -p "${APP_DIR}"
mkdir -p "${DB_DIR}"
mkdir -p "${LOG_DIR}"
chown -R "${APP_USER}:${APP_USER}" "/home/${APP_USER}"
ok "Directories created"

# ---- 8. Configure firewall ----
log "Step 8: Configuring firewall (UFW)..."
if command -v ufw &> /dev/null; then
    ufw allow OpenSSH
    ufw allow 'Nginx Full'
    ufw --force enable
    ok "Firewall configured (SSH + HTTP/HTTPS)"
else
    warn "UFW not available. Configure firewall manually."
fi

# ---- 9. Configure PM2 startup ----
log "Step 9: Configuring PM2 startup..."
su - "${APP_USER}" -c "pm2 startup systemd -u ${APP_USER} --hp /home/${APP_USER}" 2>/dev/null || true
# The command above outputs a sudo command — run it
eval "$(su - ${APP_USER} -c 'pm2 startup systemd -u ibetpro --hp /home/ibetpro 2>/dev/null')" 2>/dev/null || true
ok "PM2 startup configured"

# ---- 10. Optimize system for Node.js ----
log "Step 10: Optimizing system for Node.js..."

# Increase file watch limit
if ! grep -q "fs.inotify" /etc/sysctl.conf; then
    echo "fs.inotify.max_user_watches=524288" >> /etc/sysctl.conf
    sysctl -p
fi

# Increase default file descriptors
if ! grep -q "ibetpro soft nofile" /etc/security/limits.conf; then
    echo "ibetpro soft nofile 65536" >> /etc/security/limits.conf
    echo "ibetpro hard nofile 65536" >> /etc/security/limits.conf
fi

ok "System optimized"

# ---- Summary ----
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  VPS SETUP COMPLETE!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  App user:      ${APP_USER}"
echo "  App directory:  ${APP_DIR}"
echo "  Database:       ${DB_DIR}"
echo "  Logs:           ${LOG_DIR}"
echo ""
echo "  Node.js:  $(node -v)"
echo "  PM2:      $(pm2 -v)"
echo "  Nginx:    $(nginx -v 2>&1)"
echo ""
echo "  Next steps:"
echo "    1. From your LOCAL machine, run:"
echo "       bash deploy/deploy.sh yourdomain.com"
echo ""
echo "    2. Or manually upload and build:"
echo "       scp -r .next/standalone/ ${APP_USER}@YOUR_VPS:${APP_DIR}/"
echo "       scp -r .next/static/ ${APP_USER}@YOUR_VPS:${APP_DIR}/.next/standalone/.next/"
echo "       scp -r public/ ${APP_USER}@YOUR_VPS:${APP_DIR}/.next/standalone/"
echo ""
echo "    3. Set up SSL:"
echo "       sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
