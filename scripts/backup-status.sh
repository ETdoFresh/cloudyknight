#!/bin/bash

# MinIO Backup Status Check Script
# Shows the current status of backups and recent activity

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "========================================="
echo "       MinIO Backup Status"
echo "========================================="
echo ""

# Check if backup container is running
if docker ps | grep -q workspace-minio-backup; then
    echo -e "${GREEN}✓ Backup service is running${NC}"
    echo ""
    
    # Show container info
    echo "Container Details:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.RunningFor}}" | grep -E "NAME|backup"
    echo ""
    
    # Show recent logs
    echo "Recent Activity (last 10 lines):"
    docker logs workspace-minio-backup --tail 10 2>&1 | sed 's/^/  /'
else
    echo -e "${RED}✗ Backup service is not running${NC}"
    echo ""
    echo "To start the backup service, run:"
    echo "  docker-compose -f docker-compose.backup.yml --env-file .env.backup up -d minio-backup"
fi

echo ""
echo "----------------------------------------"
echo "Quick Commands:"
echo "----------------------------------------"
echo "View live logs:        docker logs -f workspace-minio-backup"
echo "Run manual backup:     ./scripts/backup-minio.sh"
echo "Check remote content:  docker run --rm --entrypoint sh minio/mc:latest -c \\"
echo "                       \"mc alias set r https://api.minio.etdofresh.com minioadmin 'PASSWORD' && mc ls r/workspaces\""
echo "Stop backup service:   docker stop workspace-minio-backup"
echo "Restart service:       docker restart workspace-minio-backup"