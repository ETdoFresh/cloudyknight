#!/bin/bash

# MinIO initialization script
# This script configures MinIO with versioning and other settings

set -e

# Configuration
MINIO_ENDPOINT=${MINIO_ENDPOINT:-http://localhost:9000}
MINIO_ROOT_USER=${MINIO_ROOT_USER:-minioadmin}
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD:-minioadmin}
BUCKET_NAME=${BUCKET_NAME:-workspaces}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}MinIO Initialization Script${NC}"
echo "================================"

# Wait for MinIO to be ready
echo -n "Waiting for MinIO to be ready..."
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -s -f "${MINIO_ENDPOINT}/minio/health/live" > /dev/null 2>&1; then
        echo -e " ${GREEN}Ready!${NC}"
        break
    fi
    echo -n "."
    sleep 2
    ATTEMPT=$((ATTEMPT + 1))
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo -e " ${RED}Failed!${NC}"
    echo "MinIO did not become ready in time"
    exit 1
fi

# Download MinIO client if not present
if ! command -v mc &> /dev/null; then
    echo "Downloading MinIO client..."
    curl -s -L https://dl.min.io/client/mc/release/linux-amd64/mc -o /tmp/mc
    chmod +x /tmp/mc
    MC="/tmp/mc"
else
    MC="mc"
fi

# Configure MinIO client
echo "Configuring MinIO client..."
$MC alias set myminio "${MINIO_ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" --api S3v4

# Create bucket if it doesn't exist
echo "Checking bucket '${BUCKET_NAME}'..."
if $MC ls myminio/${BUCKET_NAME} > /dev/null 2>&1; then
    echo -e "Bucket '${BUCKET_NAME}' already exists"
else
    echo "Creating bucket '${BUCKET_NAME}'..."
    $MC mb myminio/${BUCKET_NAME}
    echo -e "${GREEN}Bucket created successfully${NC}"
fi

# Enable versioning on the bucket
echo "Enabling versioning on bucket '${BUCKET_NAME}'..."
$MC version enable myminio/${BUCKET_NAME}

# Check versioning status
VERSION_INFO=$($MC version info myminio/${BUCKET_NAME} 2>&1)
if echo "$VERSION_INFO" | grep -q "versioning is enabled"; then
    echo -e "${GREEN}Versioning is enabled on '${BUCKET_NAME}'${NC}"
    VERSION_STATUS="Enabled"
elif echo "$VERSION_INFO" | grep -q "versioning is suspended"; then
    echo -e "${YELLOW}Versioning is suspended on '${BUCKET_NAME}'${NC}"
    VERSION_STATUS="Suspended"  
else
    echo -e "${RED}Could not determine versioning status${NC}"
    echo "Status output: $VERSION_INFO"
    VERSION_STATUS="Unknown"
fi

# Optional: Set lifecycle policy to manage old versions
# This example keeps versions for 30 days
echo "Setting up lifecycle policy for version management..."
cat > /tmp/lifecycle.json <<EOF
{
    "Rules": [
        {
            "ID": "expire-old-versions",
            "Status": "Enabled",
            "NoncurrentVersionExpiration": {
                "NoncurrentDays": 30
            }
        },
        {
            "ID": "limit-versions",
            "Status": "Enabled",
            "NoncurrentVersionExpiration": {
                "NewerNoncurrentVersions": 10
            }
        }
    ]
}
EOF

# Apply lifecycle policy
if $MC ilm import myminio/${BUCKET_NAME} < /tmp/lifecycle.json 2>/dev/null; then
    echo -e "${GREEN}Lifecycle policy applied successfully${NC}"
    echo "  - Old versions will be deleted after 30 days"
    echo "  - Maximum 10 non-current versions will be kept"
else
    echo -e "${YELLOW}Note: Lifecycle policy could not be applied (optional feature)${NC}"
fi

# Clean up temp files
rm -f /tmp/lifecycle.json

echo ""
echo -e "${GREEN}MinIO initialization complete!${NC}"
echo "================================"
echo "Versioning status: ${VERSION_STATUS}"
echo "Bucket: ${BUCKET_NAME}"
echo "Endpoint: ${MINIO_ENDPOINT}"