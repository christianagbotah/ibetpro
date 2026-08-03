#!/bin/bash
# ============================================================================
# iBetPro — Setup Cron Job for Auto Data Sync
# Adds a cron job to sync match data every 10 minutes
# ============================================================================

set -euo pipefail

DOMAIN="ibetpro.lightworldtech.com"
PORT="3007"
CRON_SECRET="ibp_cron_2024_s3cur3"
CRON_ENTRY="*/10 * * * * curl -s -H \"Authorization: Bearer ${CRON_SECRET}\" https://${DOMAIN}:${PORT}/api/sync/cron > /dev/null 2>&1"

# Check if cron entry already exists
if crontab -l 2>/dev/null | grep -q "api/sync/cron"; then
    echo "✅ Cron job already exists. Current entry:"
    crontab -l 2>/dev/null | grep "api/sync/cron"
    echo ""
    read -p "Replace it? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Keeping existing cron job."
        exit 0
    fi
    # Remove old entry
    crontab -l 2>/dev/null | grep -v "api/sync/cron" | crontab -
    echo "Removed old cron entry."
fi

# Add the new cron entry
(crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -

echo ""
echo "✅ Cron job added successfully!"
echo ""
echo "   Schedule: Every 10 minutes"
echo "   URL: https://${DOMAIN}:${PORT}/api/sync/cron"
echo ""
echo "   To verify: crontab -l"
echo "   To remove: crontab -l | grep -v 'api/sync/cron' | crontab -"
echo ""
