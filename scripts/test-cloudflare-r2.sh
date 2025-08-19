#!/bin/bash

# Cloudflare R2 Connection Test Script
# Tests connectivity and permissions for Cloudflare R2 backup destination

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo "========================================="
echo "    Cloudflare R2 Connection Test"
echo "========================================="
echo ""

# R2 Configuration
R2_ENDPOINT=${R2_ENDPOINT:-https://a6a59f0988d2ad706f9231e25636c95c.r2.cloudflarestorage.com}
R2_ACCESS_KEY=${R2_ACCESS_KEY}
R2_SECRET_KEY=${R2_SECRET_KEY}
BUCKET_NAME=${BUCKET_NAME:-workspaces}

# Check for credentials
if [ -z "$R2_ACCESS_KEY" ] || [ -z "$R2_SECRET_KEY" ]; then
    echo -e "${YELLOW}Cloudflare R2 credentials not set in environment.${NC}"
    echo ""
    echo -e "${BLUE}How to get Cloudflare R2 credentials:${NC}"
    echo ""
    echo "1. Go to https://dash.cloudflare.com"
    echo "2. Log in to your Cloudflare account"
    echo "3. Click 'R2' in the left sidebar (under Storage)"
    echo "4. Click 'Manage R2 API Tokens' on the right"
    echo "5. Click 'Create API Token'"
    echo "6. Configure your token:"
    echo "   - Token Name: minio-backup (or any name)"
    echo "   - Permissions: Object Read & Write"
    echo "   - Specify bucket: All buckets or select specific"
    echo "   - TTL: Forever (or set expiration)"
    echo "7. Click 'Create API Token'"
    echo "8. Copy the credentials shown (Secret only shown once!)"
    echo ""
    echo -e "${YELLOW}Your R2 endpoint URL indicates:${NC}"
    echo "Account ID: a6a59f0988d2ad706f9231e25636c95c"
    echo "Endpoint: $R2_ENDPOINT"
    echo ""
    echo "Once you have the credentials, run this script with:"
    echo "  export R2_ACCESS_KEY='your-access-key-id'"
    echo "  export R2_SECRET_KEY='your-secret-access-key'"
    echo "  ./scripts/test-cloudflare-r2.sh"
    exit 1
fi

echo "Testing Cloudflare R2 connectivity..."
echo "Endpoint: $R2_ENDPOINT"
echo ""

# Test with Docker and mc
if command -v docker &> /dev/null; then
    echo "Using Docker to test R2 connection..."
    
    # Test R2 connection
    echo -n "Connecting to Cloudflare R2... "
    if docker run --rm minio/mc:latest \
        alias set test-r2 "$R2_ENDPOINT" "$R2_ACCESS_KEY" "$R2_SECRET_KEY" &>/dev/null; then
        echo -e "${GREEN}SUCCESS${NC}"
        
        # Try to list buckets
        echo ""
        echo "Attempting to list buckets..."
        if docker run --rm --entrypoint sh minio/mc:latest -c \
            "mc alias set test-r2 '$R2_ENDPOINT' '$R2_ACCESS_KEY' '$R2_SECRET_KEY' && mc ls test-r2" 2>/dev/null; then
            echo -e "${GREEN}✓ Successfully listed buckets${NC}"
        else
            echo -e "${YELLOW}⚠ Connected but couldn't list buckets (may need permissions)${NC}"
        fi
        
        # Try to create/check the workspaces bucket
        echo ""
        echo "Checking bucket '$BUCKET_NAME'..."
        if docker run --rm --entrypoint sh minio/mc:latest -c \
            "mc alias set test-r2 '$R2_ENDPOINT' '$R2_ACCESS_KEY' '$R2_SECRET_KEY' && mc ls test-r2/$BUCKET_NAME" &>/dev/null; then
            echo -e "${GREEN}✓ Bucket '$BUCKET_NAME' exists${NC}"
        else
            echo -e "${YELLOW}Bucket '$BUCKET_NAME' doesn't exist. Attempting to create...${NC}"
            if docker run --rm --entrypoint sh minio/mc:latest -c \
                "mc alias set test-r2 '$R2_ENDPOINT' '$R2_ACCESS_KEY' '$R2_SECRET_KEY' && mc mb test-r2/$BUCKET_NAME" 2>/dev/null; then
                echo -e "${GREEN}✓ Successfully created bucket '$BUCKET_NAME'${NC}"
            else
                echo -e "${RED}✗ Could not create bucket (check permissions)${NC}"
            fi
        fi
        
        # Test write permissions
        echo ""
        echo "Testing write permissions..."
        TEST_FILE="/tmp/r2-test-$(date +%s).txt"
        echo "R2 backup test at $(date)" > "$TEST_FILE"
        
        if docker run --rm -v "$TEST_FILE:$TEST_FILE:ro" --entrypoint sh minio/mc:latest -c \
            "mc alias set test-r2 '$R2_ENDPOINT' '$R2_ACCESS_KEY' '$R2_SECRET_KEY' && \
             mc cp '$TEST_FILE' test-r2/$BUCKET_NAME/test-write.txt" &>/dev/null; then
            echo -e "${GREEN}✓ Write test successful${NC}"
            
            # Clean up test file
            docker run --rm --entrypoint sh minio/mc:latest -c \
                "mc alias set test-r2 '$R2_ENDPOINT' '$R2_ACCESS_KEY' '$R2_SECRET_KEY' && \
                 mc rm test-r2/$BUCKET_NAME/test-write.txt" &>/dev/null
        else
            echo -e "${RED}✗ Write test failed (check permissions)${NC}"
        fi
        
        rm -f "$TEST_FILE"
        
    else
        echo -e "${RED}FAILED${NC}"
        echo "Could not connect to Cloudflare R2"
        echo ""
        echo "Please check:"
        echo "1. Access Key ID is correct"
        echo "2. Secret Access Key is correct"
        echo "3. R2 endpoint URL is correct"
        echo "4. API token has appropriate permissions"
    fi
else
    echo -e "${RED}Docker is not available${NC}"
    echo "Please install Docker to run this test"
fi

echo ""
echo "========================================="
echo "           Test Summary"
echo "========================================="
echo "R2 Endpoint: $R2_ENDPOINT"
echo "Bucket Name: $BUCKET_NAME"

if [ -n "$R2_ACCESS_KEY" ]; then
    echo -e "${GREEN}✓ Credentials configured${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Add R2 credentials to .env.multi-backup file"
    echo "2. Run multi-destination backup test:"
    echo "   source .env.multi-backup && ./scripts/backup-multi-destination.sh --dry-run"
    echo "3. Start automated multi-destination backups:"
    echo "   docker-compose -f docker-compose.multi-backup.yml --env-file .env.multi-backup up -d"
fi