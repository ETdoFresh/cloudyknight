#!/bin/bash

# Script to remount MinIO workspaces to /workspaces
# This mounts your S3-stored workspaces to /workspaces using RClone

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Remounting MinIO workspaces to /workspaces${NC}"

# Check if MinIO is running
if ! docker ps | grep -q workspace-minio; then
    echo -e "${RED}Error: MinIO container is not running${NC}"
    echo "Start it with: docker run -d --name workspace-minio --network traefik-network -p 9000:9000 -p 9001:9001 minio/minio:latest server /data --console-address ':9001'"
    exit 1
fi

# Check if /workspaces exists
if [ ! -d "/workspaces" ]; then
    echo "Creating /workspaces directory..."
    sudo mkdir -p /workspaces
    sudo chmod 777 /workspaces
fi

# Check if already mounted
if mount | grep -q "/workspaces"; then
    echo -e "${YELLOW}Warning: /workspaces is already mounted${NC}"
    read -p "Unmount and remount? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo umount /workspaces
    else
        exit 0
    fi
fi

# Start RClone mount container
echo "Starting RClone mount container..."
docker run -d \
    --name workspace-rclone-mount \
    --restart unless-stopped \
    --privileged \
    --cap-add SYS_ADMIN \
    --device /dev/fuse \
    --network traefik-network \
    -v /workspaces:/workspaces:rshared \
    -v rclone_cache:/root/.cache/rclone \
    -e RCLONE_CONFIG_MINIO_TYPE=s3 \
    -e RCLONE_CONFIG_MINIO_PROVIDER=Minio \
    -e RCLONE_CONFIG_MINIO_ACCESS_KEY_ID=minioadmin \
    -e RCLONE_CONFIG_MINIO_SECRET_ACCESS_KEY=minioadmin \
    -e RCLONE_CONFIG_MINIO_ENDPOINT=http://workspace-minio:9000 \
    -e RCLONE_CONFIG_MINIO_ENV_AUTH=false \
    rclone/rclone:latest \
    mount minio:workspaces /workspaces \
    --vfs-cache-mode writes \
    --allow-other \
    --allow-non-empty \
    --log-level INFO

# Wait for mount to be ready
echo "Waiting for mount to be ready..."
sleep 3

# Verify mount
if mount | grep -q "/workspaces"; then
    echo -e "${GREEN}✓ Successfully mounted to /workspaces${NC}"
    echo ""
    echo "Your workspaces are now available at: /workspaces"
    echo "Contents:"
    ls -la /workspaces | head -10
else
    echo -e "${RED}✗ Mount failed${NC}"
    echo "Check logs with: docker logs workspace-rclone-mount"
    exit 1
fi

echo ""
echo -e "${GREEN}Done! Your workspaces are mounted at /workspaces${NC}"
echo ""
echo "Useful commands:"
echo "  View logs:     docker logs -f workspace-rclone-mount"
echo "  Stop mount:    docker stop workspace-rclone-mount"
echo "  Remove mount:  docker rm workspace-rclone-mount && sudo umount /workspaces"