#!/bin/bash

# Test script to verify MinIO backup connectivity
# This script tests the connection to both local and remote MinIO servers

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "========================================="
echo "   MinIO Backup Connection Test"
echo "========================================="
echo ""

# Check for required environment variables
if [ -z "$REMOTE_MINIO_USER" ] || [ -z "$REMOTE_MINIO_PASSWORD" ]; then
    echo -e "${YELLOW}Remote MinIO credentials not set in environment.${NC}"
    echo "Checking for .env.backup file..."
    
    if [ -f ".env.backup" ]; then
        source .env.backup
        echo -e "${GREEN}Loaded credentials from .env.backup${NC}"
    else
        echo -e "${RED}No .env.backup file found!${NC}"
        echo ""
        echo "Please set the following environment variables:"
        echo "  export REMOTE_MINIO_USER=your-access-key"
        echo "  export REMOTE_MINIO_PASSWORD=your-secret-key"
        echo ""
        echo "Or create a .env.backup file from the template:"
        echo "  cp .env.backup.example .env.backup"
        exit 1
    fi
fi

# Configuration
LOCAL_MINIO_ENDPOINT=${LOCAL_MINIO_ENDPOINT:-http://localhost:9000}
LOCAL_MINIO_USER=${LOCAL_MINIO_USER:-minioadmin}
LOCAL_MINIO_PASSWORD=${LOCAL_MINIO_PASSWORD:-minioadmin}

REMOTE_MINIO_ENDPOINT=${REMOTE_MINIO_ENDPOINT:-https://minio.etdofresh.com}

echo "Testing MinIO connections..."
echo ""

# Test with Docker if available
if command -v docker &> /dev/null; then
    echo "Using Docker to test connections..."
    
    # Test local MinIO
    echo -n "Testing local MinIO at $LOCAL_MINIO_ENDPOINT... "
    if docker run --rm --network host minio/mc:latest \
        alias set test-local "$LOCAL_MINIO_ENDPOINT" "$LOCAL_MINIO_USER" "$LOCAL_MINIO_PASSWORD" &>/dev/null && \
       docker run --rm --network host minio/mc:latest ls test-local &>/dev/null; then
        echo -e "${GREEN}SUCCESS${NC}"
        
        # List buckets
        echo "  Local buckets:"
        docker run --rm --network host minio/mc:latest \
            alias set test-local "$LOCAL_MINIO_ENDPOINT" "$LOCAL_MINIO_USER" "$LOCAL_MINIO_PASSWORD" &>/dev/null
        docker run --rm --network host minio/mc:latest ls test-local | sed 's/^/    /'
    else
        echo -e "${RED}FAILED${NC}"
        echo "  Could not connect to local MinIO"
        echo "  Ensure MinIO is running: docker-compose -f docker-compose.s3-direct.yml up -d"
    fi
    
    echo ""
    
    # Test remote MinIO
    echo -n "Testing remote MinIO at $REMOTE_MINIO_ENDPOINT... "
    if docker run --rm minio/mc:latest \
        alias set test-remote "$REMOTE_MINIO_ENDPOINT" "$REMOTE_MINIO_USER" "$REMOTE_MINIO_PASSWORD" &>/dev/null && \
       docker run --rm minio/mc:latest ls test-remote &>/dev/null; then
        echo -e "${GREEN}SUCCESS${NC}"
        
        # List buckets
        echo "  Remote buckets:"
        docker run --rm minio/mc:latest \
            alias set test-remote "$REMOTE_MINIO_ENDPOINT" "$REMOTE_MINIO_USER" "$REMOTE_MINIO_PASSWORD" &>/dev/null
        docker run --rm minio/mc:latest ls test-remote 2>/dev/null | sed 's/^/    /' || echo "    (No buckets or no list permission)"
    else
        echo -e "${RED}FAILED${NC}"
        echo "  Could not connect to remote MinIO"
        echo "  Please check:"
        echo "    1. Remote MinIO endpoint is accessible"
        echo "    2. Credentials are correct"
        echo "    3. Network connectivity to $REMOTE_MINIO_ENDPOINT"
    fi
    
else
    echo -e "${YELLOW}Docker not available, using curl for basic connectivity test${NC}"
    
    # Basic connectivity test with curl
    echo -n "Testing local MinIO health... "
    if curl -s -f "$LOCAL_MINIO_ENDPOINT/minio/health/live" &>/dev/null; then
        echo -e "${GREEN}SUCCESS${NC}"
    else
        echo -e "${RED}FAILED${NC}"
    fi
    
    echo -n "Testing remote MinIO connectivity... "
    if curl -s -f -I "$REMOTE_MINIO_ENDPOINT" &>/dev/null; then
        echo -e "${GREEN}SUCCESS${NC}"
    else
        echo -e "${RED}FAILED${NC}"
    fi
fi

echo ""
echo "========================================="
echo "         Test Summary"
echo "========================================="
echo -e "Local MinIO:  $LOCAL_MINIO_ENDPOINT"
echo -e "Remote MinIO: $REMOTE_MINIO_ENDPOINT"
echo ""

if [ -n "$REMOTE_MINIO_USER" ]; then
    echo -e "${GREEN}✓ Credentials configured${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run a test backup (dry run):"
    echo "   ./scripts/backup-minio.sh --dry-run"
    echo ""
    echo "2. Start automated backups:"
    echo "   docker-compose -f docker-compose.s3-direct.yml -f docker-compose.backup.yml --env-file .env.backup up -d"
else
    echo -e "${RED}✗ Credentials not configured${NC}"
    echo "Please configure credentials before proceeding."
fi