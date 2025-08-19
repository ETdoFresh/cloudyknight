#!/bin/sh

# Entrypoint script for scheduled multi-destination MinIO backups
# Runs backups to multiple S3-compatible destinations at regular intervals

set -e

# Configuration
BACKUP_INTERVAL=${BACKUP_INTERVAL:-3600}  # Default: 1 hour (in seconds)
INITIAL_DELAY=${INITIAL_DELAY:-60}  # Wait before first backup (in seconds)

echo "========================================="
echo "  Multi-Destination Backup Service"
echo "========================================="
echo "Backup interval: ${BACKUP_INTERVAL} seconds"
echo "Initial delay: ${INITIAL_DELAY} seconds"
echo ""
echo "Configured destinations:"
[ "$REMOTE1_ENABLED" = "true" ] && echo "  ✓ ${REMOTE1_NAME:-Destination 1}: ${REMOTE1_ENDPOINT}"
[ "$REMOTE2_ENABLED" = "true" ] && echo "  ✓ ${REMOTE2_NAME:-Destination 2}: ${REMOTE2_ENDPOINT}"
echo ""

# Initial delay
echo "Waiting ${INITIAL_DELAY} seconds before first backup..."
sleep ${INITIAL_DELAY}

# Run backups in a loop
while true; do
    echo ""
    echo "========================================="
    echo "Starting multi-destination backup at $(date)"
    echo "========================================="
    
    # Run the multi-destination backup script
    if sh /backup-multi.sh; then
        echo "✓ All backups completed successfully at $(date)"
    else
        echo "⚠ Some backups may have failed at $(date)"
        # Continue running even if some backups fail
    fi
    
    echo ""
    echo "Next backup cycle in ${BACKUP_INTERVAL} seconds..."
    sleep ${BACKUP_INTERVAL}
done