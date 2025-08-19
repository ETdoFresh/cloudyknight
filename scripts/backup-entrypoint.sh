#!/bin/sh

# Entrypoint script for scheduled MinIO backups
# This script runs the backup script at regular intervals

set -e

# Configuration
BACKUP_INTERVAL=${BACKUP_INTERVAL:-3600}  # Default: 1 hour (in seconds)
INITIAL_DELAY=${INITIAL_DELAY:-60}  # Wait before first backup (in seconds)

echo "========================================="
echo "   MinIO Scheduled Backup Service"
echo "========================================="
echo "Backup interval: ${BACKUP_INTERVAL} seconds"
echo "Initial delay: ${INITIAL_DELAY} seconds"
echo ""

# Backup script is already executable (mounted read-only)
# chmod +x /backup-minio.sh

# Initial delay
echo "Waiting ${INITIAL_DELAY} seconds before first backup..."
sleep ${INITIAL_DELAY}

# Run backups in a loop
while true; do
    echo ""
    echo "----------------------------------------"
    echo "Starting backup at $(date)"
    echo "----------------------------------------"
    
    # Run the backup script (use sh since it's mounted read-only)
    if sh /backup-minio.sh; then
        echo "Backup completed successfully at $(date)"
    else
        echo "Backup failed at $(date)"
        # Continue running even if backup fails
    fi
    
    echo "Next backup in ${BACKUP_INTERVAL} seconds..."
    sleep ${BACKUP_INTERVAL}
done