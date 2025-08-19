#!/bin/bash

# Setup script for S3-mounted workspaces with ephemeral node_modules

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== S3 Direct Mount Setup ===${NC}"
echo "This will set up S3-mounted workspaces with ephemeral node_modules"
echo ""

# Step 1: Check if /workspaces exists locally
if [ -d "/workspaces" ]; then
    echo -e "${YELLOW}Warning: /workspaces already exists${NC}"
    echo "Contents:"
    ls -la /workspaces/ | head -10
    echo ""
    read -p "Move existing workspaces to S3? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        MIGRATE_EXISTING=true
    else
        MIGRATE_EXISTING=false
    fi
else
    echo "Creating /workspaces mount point..."
    sudo mkdir -p /workspaces
    sudo chmod 777 /workspaces
fi

# Step 2: Start MinIO
echo -e "\n${GREEN}Starting MinIO...${NC}"
docker-compose -f docker-compose.s3-direct.yml up -d minio

# Wait for MinIO to be ready
echo "Waiting for MinIO to be ready..."
sleep 5

# Step 3: Create workspaces bucket
echo -e "\n${GREEN}Creating workspaces bucket...${NC}"
docker run --rm --network traefik-network \
    -e MC_HOST_minio=http://minioadmin:minioadmin@minio:9000 \
    minio/mc mb minio/workspaces --ignore-existing

# Step 4: Migrate existing workspaces if needed
if [ "$MIGRATE_EXISTING" = true ]; then
    echo -e "\n${GREEN}Migrating existing workspaces to S3...${NC}"
    
    for workspace in /workspaces/*/; do
        if [ -d "$workspace" ]; then
            workspace_name=$(basename "$workspace")
            echo "Uploading $workspace_name (excluding node_modules)..."
            
            # Upload to MinIO, excluding node_modules and other artifacts
            docker run --rm -v "$workspace:/data:ro" --network traefik-network \
                -e MC_HOST_minio=http://minioadmin:minioadmin@minio:9000 \
                minio/mc cp -r \
                --exclude "node_modules/*" \
                --exclude ".git/*" \
                --exclude "*.log" \
                --exclude ".env*" \
                --exclude "dist/*" \
                --exclude "build/*" \
                --exclude "__pycache__/*" \
                --exclude "vendor/*" \
                /data/ minio/workspaces/$workspace_name/
        fi
    done
    
    # Backup old workspaces
    echo -e "\n${YELLOW}Backing up old workspaces to /workspaces.backup...${NC}"
    sudo mv /workspaces /workspaces.backup
    sudo mkdir -p /workspaces
    sudo chmod 777 /workspaces
fi

# Step 5: Start RClone mount
echo -e "\n${GREEN}Starting RClone S3 mount...${NC}"
docker-compose -f docker-compose.s3-direct.yml up -d rclone-workspaces

# Wait for mount
echo "Waiting for S3 mount to be ready..."
sleep 5

# Step 6: Verify mount
echo -e "\n${GREEN}Verifying S3 mount...${NC}"
if mountpoint -q /workspaces; then
    echo "✅ /workspaces is mounted"
    echo "Contents:"
    ls -la /workspaces/ | head -10
else
    echo -e "${RED}❌ Mount failed!${NC}"
    echo "Check logs with: docker logs workspace-rclone-direct"
    exit 1
fi

# Step 7: Build ephemeral runtime images
echo -e "\n${GREEN}Building ephemeral runtime images...${NC}"

# Node.js runtime
if [ -d "workspaces/monitor/docker/node-ephemeral" ]; then
    echo "Building Node.js ephemeral runtime..."
    docker build -t workspace-node-ephemeral:latest workspaces/monitor/docker/node-ephemeral/
fi

# Add other runtimes as needed...

# Step 8: Start monitor
echo -e "\n${GREEN}Starting monitor service...${NC}"
docker-compose -f docker-compose.s3-direct.yml up -d monitor

echo -e "\n${GREEN}=== Setup Complete! ===${NC}"
echo ""
echo "✅ MinIO is running at http://localhost:9001"
echo "   Username: minioadmin"
echo "   Password: minioadmin"
echo ""
echo "✅ S3 is mounted at /workspaces"
echo ""
echo "✅ Monitor is running at https://${DOMAIN:-localhost}/monitor"
echo ""
echo -e "${YELLOW}Important Notes:${NC}"
echo "• Edit files directly in /workspaces/"
echo "• DO NOT run 'npm install' locally - containers handle this"
echo "• node_modules only exist inside containers"
echo "• All changes are automatically saved to S3"
echo ""
echo "To add a new workspace:"
echo "  mkdir /workspaces/myapp"
echo "  cd /workspaces/myapp"
echo "  # Create your files (package.json, index.js, etc.)"
echo "  # Monitor will detect and containerize automatically"
echo ""

if [ "$MIGRATE_EXISTING" = true ]; then
    echo -e "${YELLOW}Old workspaces backed up to: /workspaces.backup${NC}"
    echo "After verifying everything works, you can remove with:"
    echo "  sudo rm -rf /workspaces.backup"
fi