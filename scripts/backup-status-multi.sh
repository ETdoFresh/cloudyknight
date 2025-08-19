#!/bin/bash

# Multi-Destination Backup Status Check
# Shows status of backups across all configured destinations

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo "========================================="
echo "   Multi-Destination Backup Status"
echo "========================================="
echo ""

# Load environment if available
if [ -f ".env.multi-backup" ]; then
    source .env.multi-backup
fi

# Configuration
LOCAL_ENDPOINT=${LOCAL_MINIO_ENDPOINT:-http://localhost:9000}
REMOTE1_ENDPOINT=${REMOTE1_ENDPOINT:-https://api.minio.etdofresh.com}
REMOTE1_NAME=${REMOTE1_NAME:-"MinIO Remote"}
REMOTE2_ENDPOINT=${REMOTE2_ENDPOINT:-https://a6a59f0988d2ad706f9231e25636c95c.r2.cloudflarestorage.com}
REMOTE2_NAME=${REMOTE2_NAME:-"Cloudflare R2"}

# Check if backup container is running
echo -e "${BLUE}Service Status:${NC}"
if docker ps | grep -q workspace-minio-multi-backup; then
    echo -e "  ${GREEN}✓ Multi-destination backup service is running${NC}"
    UPTIME=$(docker ps --format "table {{.RunningFor}}" | grep -v CREATED | head -1)
    echo -e "  Uptime: $UPTIME"
elif docker ps | grep -q workspace-minio-backup; then
    echo -e "  ${YELLOW}⚠ Single-destination backup service is running${NC}"
    echo -e "  Consider switching to multi-destination backup"
else
    echo -e "  ${RED}✗ No backup service is running${NC}"
fi
echo ""

# Check backup destinations using Docker
if command -v docker &> /dev/null; then
    echo -e "${BLUE}Backup Destinations:${NC}"
    
    # Local MinIO
    echo -e "\n${CYAN}Local MinIO:${NC}"
    echo "  Endpoint: $LOCAL_ENDPOINT"
    if docker run --rm --network host minio/mc:latest \
        alias set local $LOCAL_ENDPOINT minioadmin minioadmin &>/dev/null && \
       docker run --rm --network host minio/mc:latest ls local/workspaces &>/dev/null; then
        COUNT=$(docker run --rm --network host minio/mc:latest \
            alias set local $LOCAL_ENDPOINT minioadmin minioadmin &>/dev/null && \
            docker run --rm --network host minio/mc:latest ls --recursive local/workspaces 2>/dev/null | wc -l)
        echo -e "  Status: ${GREEN}✓ Connected${NC}"
        echo -e "  Objects: $COUNT"
    else
        echo -e "  Status: ${RED}✗ Not accessible${NC}"
    fi
    
    # Remote MinIO
    if [ -n "$REMOTE1_ACCESS_KEY" ] && [ -n "$REMOTE1_SECRET_KEY" ]; then
        echo -e "\n${CYAN}$REMOTE1_NAME:${NC}"
        echo "  Endpoint: $REMOTE1_ENDPOINT"
        if docker run --rm minio/mc:latest \
            alias set remote1 "$REMOTE1_ENDPOINT" "$REMOTE1_ACCESS_KEY" "$REMOTE1_SECRET_KEY" &>/dev/null && \
           docker run --rm minio/mc:latest ls remote1/workspaces &>/dev/null; then
            COUNT=$(docker run --rm --entrypoint sh minio/mc:latest -c \
                "mc alias set remote1 '$REMOTE1_ENDPOINT' '$REMOTE1_ACCESS_KEY' '$REMOTE1_SECRET_KEY' &>/dev/null && \
                 mc ls --recursive remote1/workspaces 2>/dev/null | wc -l")
            echo -e "  Status: ${GREEN}✓ Connected${NC}"
            echo -e "  Objects: $COUNT"
        else
            echo -e "  Status: ${RED}✗ Connection failed${NC}"
        fi
    else
        echo -e "\n${CYAN}$REMOTE1_NAME:${NC}"
        echo -e "  Status: ${YELLOW}⚠ Not configured${NC}"
    fi
    
    # Cloudflare R2
    if [ -n "$REMOTE2_ACCESS_KEY" ] && [ -n "$REMOTE2_SECRET_KEY" ]; then
        echo -e "\n${CYAN}$REMOTE2_NAME:${NC}"
        echo "  Endpoint: $REMOTE2_ENDPOINT"
        if docker run --rm minio/mc:latest \
            alias set remote2 "$REMOTE2_ENDPOINT" "$REMOTE2_ACCESS_KEY" "$REMOTE2_SECRET_KEY" &>/dev/null && \
           docker run --rm minio/mc:latest ls remote2/workspaces &>/dev/null; then
            COUNT=$(docker run --rm --entrypoint sh minio/mc:latest -c \
                "mc alias set remote2 '$REMOTE2_ENDPOINT' '$REMOTE2_ACCESS_KEY' '$REMOTE2_SECRET_KEY' &>/dev/null && \
                 mc ls --recursive remote2/workspaces 2>/dev/null | wc -l")
            echo -e "  Status: ${GREEN}✓ Connected${NC}"
            echo -e "  Objects: $COUNT"
        else
            echo -e "  Status: ${RED}✗ Connection failed${NC}"
        fi
    else
        echo -e "\n${CYAN}$REMOTE2_NAME:${NC}"
        echo -e "  Status: ${YELLOW}⚠ Not configured${NC}"
    fi
fi

# Show recent backup activity if container is running
if docker ps | grep -q "minio.*backup"; then
    echo ""
    echo -e "${BLUE}Recent Activity:${NC}"
    docker logs $(docker ps --format "{{.Names}}" | grep "minio.*backup" | head -1) --tail 5 2>&1 | \
        grep -E "SUCCESS|completed|Starting" | tail -3 | sed 's/^/  /'
fi

echo ""
echo "----------------------------------------"
echo -e "${MAGENTA}Quick Commands:${NC}"
echo "----------------------------------------"
echo "Run manual multi-backup:  ./scripts/backup-multi-destination.sh"
echo "View live logs:          docker logs -f workspace-minio-multi-backup"
echo "Test R2 connection:      ./scripts/test-cloudflare-r2.sh"
echo "Start multi-backup:      docker-compose -f docker-compose.multi-backup.yml --env-file .env.multi-backup up -d"
echo "Stop all backups:        docker stop \$(docker ps -q --filter name=minio.*backup)"