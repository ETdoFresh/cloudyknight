#!/bin/bash

# Setup Namecheap DDNS auto-update via cron
# This script adds a cron job to update DNS every 10 minutes

SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/namecheap-ddns-update.sh"
CRON_ENTRY="*/10 * * * * $SCRIPT_PATH > /dev/null 2>&1"

echo "Setting up Namecheap DDNS auto-update..."

# Check if cron entry already exists
if crontab -l 2>/dev/null | grep -q "$SCRIPT_PATH"; then
    echo "✓ DDNS update cron job already exists"
else
    # Add the cron entry
    (crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -
    echo "✓ Added cron job to update DNS every 10 minutes"
fi

# Run initial update
echo "Running initial DNS update..."
"$SCRIPT_PATH"

echo ""
echo "Setup complete! Your DNS will be updated:"
echo "  - Every 10 minutes automatically"
echo "  - Log file: ~/cloudyknight/logs/namecheap-ddns.log"
echo ""
echo "To check cron status: crontab -l"
echo "To remove cron job: crontab -l | grep -v namecheap-ddns | crontab -"