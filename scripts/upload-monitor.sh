#!/bin/bash

# Script to upload the monitor workspace to S3
# This is only needed for initial setup

set -e

# Configuration
MINIO_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_PASS="${MINIO_ROOT_PASSWORD:-minioadmin}"
MONITOR_PATH="${1:-./workspaces/monitor}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Uploading monitor workspace to S3...${NC}"

if [ ! -d "$MONITOR_PATH" ]; then
    echo "Error: Monitor path not found: $MONITOR_PATH"
    echo "Usage: $0 [path-to-monitor]"
    exit 1
fi

# Check if MinIO is running
if ! docker ps | grep -q workspace-minio; then
    echo "Error: MinIO is not running. Run bootstrap.sh first."
    exit 1
fi

# Upload monitor workspace (excluding node_modules and logs)
echo "Uploading from $MONITOR_PATH..."

docker run --rm \
    -v "$(realpath $MONITOR_PATH)":/data:ro \
    --network traefik-network \
    -e AWS_ACCESS_KEY_ID=$MINIO_USER \
    -e AWS_SECRET_ACCESS_KEY=$MINIO_PASS \
    amazon/aws-cli s3 sync /data/ s3://workspaces/monitor/ \
    --endpoint-url http://minio:9000 \
    --exclude "node_modules/*" \
    --exclude ".git/*" \
    --exclude "*.log" \
    --exclude "logs/*" \
    --exclude ".env"

echo -e "${GREEN}✅ Monitor uploaded to S3${NC}"
echo ""
echo "Monitor workspace contents:"
docker run --rm --network traefik-network \
    -e MC_HOST_minio=http://$MINIO_USER:$MINIO_PASS@minio:9000 \
    minio/mc ls -r minio/workspaces/monitor/ | head -20

echo ""
echo -e "${GREEN}Next step:${NC} Run bootstrap.sh to start the monitor"