#!/bin/bash
# Deploy iBetPro Mobile Responsiveness Fixes
# Run this script on the VPS: ibetpro.lightworldtech.com
# SSH into the VPS and run: bash deploy-mobile-fixes.sh

set -e

APP_DIR="/home/lightworld/webapps/ibetpro"
BACKUP_DIR="/home/lightworld/webapps/ibetpro-backup-$(date +%Y%m%d_%H%M%S)"

echo "=== iBetPro Mobile Responsiveness Fix Deployment ==="
echo ""

# Step 1: Backup current deployment
echo "[1/5] Backing up current deployment..."
cp -r "$APP_DIR" "$BACKUP_DIR"
echo "  Backup saved to: $BACKUP_DIR"

# Step 2: Pull latest code
echo "[2/5] Pulling latest code from repository..."
cd "$APP_DIR"
git pull origin main 2>/dev/null || echo "  No git repo, skipping pull"

# Step 3: Install dependencies
echo "[3/5] Installing dependencies..."
npm install --production=false 2>&1 | tail -3

# Step 4: Build the project
echo "[4/5] Building project..."
npm run build 2>&1 | tail -10

# Step 5: Restart the application
echo "[5/5] Restarting application..."
pm2 restart ibetpro || pm2 start server.js --name ibetpro

echo ""
echo "=== Deployment Complete! ==="
echo "Changes deployed:"
echo "  - Broker Connect: Fixed Connected Brokers header layout (Connect Broker + Live/Sandbox badge stacking)"
echo "  - Broker Connect: Fixed account card layout (broker info + status badge stacking on mobile)"
echo "  - Accounts: Fixed page header and tabs for mobile"
echo "  - Betting: Fixed header with bot controls (flex-wrap, icon-only buttons on mobile)"
echo "  - Settings: Fixed page header and Telegram section layout"
echo "  - Settings: Fixed commission rate display for mobile"
echo "  - Profits: Fixed page header and Transaction History filter layout"
echo "  - Commission: Fixed page header and tabs for mobile"
echo "  - History: Fixed page header layout"
echo "  - Admin: Fixed page header and commission rate management layout"
echo "  - Analysis: Fixed page header layout"
echo "  - Dashboard: Fixed active bets card layout (match name + status stacking)"
echo "  - Allocation Manager: Fixed allocation history card layout"
echo ""
echo "Visit: https://ibetpro.lightworldtech.com:3007"
