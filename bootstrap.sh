#!/bin/bash

# CloudyKnight Bootstrap Script
# This script sets up the complete S3-based workspace environment

set -e

# Configuration
DOMAIN="${DOMAIN:-workspaces.etdofresh.com}"
MINIO_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_PASS="${MINIO_ROOT_PASSWORD:-minioadmin}"
S3_ENDPOINT="${S3_ENDPOINT:-http://localhost:9000}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        CloudyKnight S3 Workspace Bootstrap          ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Check prerequisites
echo -e "${GREEN}[1/6] Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed${NC}"
    exit 1
fi

# Check if Traefik network exists
if ! docker network ls | grep -q traefik-network; then
    echo -e "${YELLOW}Creating traefik-network...${NC}"
    docker network create traefik-network
fi

echo -e "${GREEN}✅ Prerequisites checked${NC}"

# Step 2: Create mount point
echo -e "\n${GREEN}[2/6] Setting up mount point...${NC}"

WORKSPACE_DIR="$(pwd)/workspaces"

if [ -d "$WORKSPACE_DIR" ]; then
    echo -e "${YELLOW}⚠️  ./workspaces already exists${NC}"
    read -p "Clear and recreate? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$WORKSPACE_DIR"
        mkdir -p "$WORKSPACE_DIR"
        chmod 777 "$WORKSPACE_DIR"
    fi
else
    mkdir -p "$WORKSPACE_DIR"
    chmod 777 "$WORKSPACE_DIR"
fi

echo -e "${GREEN}✅ Mount point ready${NC}"

# Step 3: Start MinIO
echo -e "\n${GREEN}[3/6] Starting MinIO S3 storage...${NC}"

docker-compose -f docker-compose.production.yml up -d minio

# Wait for MinIO to be ready
echo "Waiting for MinIO to start..."
sleep 5

# Verify MinIO is healthy
if docker exec workspace-minio curl -s http://localhost:9000/minio/health/live > /dev/null 2>&1; then
    echo -e "${GREEN}✅ MinIO is running${NC}"
    echo -e "   Web Console: ${BLUE}http://localhost:9001${NC}"
    echo -e "   Credentials: ${YELLOW}$MINIO_USER / $MINIO_PASS${NC}"
else
    echo -e "${RED}❌ MinIO failed to start${NC}"
    exit 1
fi

# Create workspaces bucket
docker run --rm --network traefik-network \
    -e MC_HOST_minio=http://$MINIO_USER:$MINIO_PASS@minio:9000 \
    minio/mc mb minio/workspaces --ignore-existing > /dev/null 2>&1

echo -e "${GREEN}✅ S3 bucket 'workspaces' ready${NC}"

# Step 4: Start RClone mount
echo -e "\n${GREEN}[4/6] Mounting S3 as filesystem...${NC}"

docker-compose -f docker-compose.rclone-mount.yml up -d

# Wait for mount to be ready
echo "Waiting for S3 mount..."
sleep 5

# Verify mount is working
if [ -d "$WORKSPACE_DIR" ] && docker ps | grep -q rclone; then
    echo -e "${GREEN}✅ S3 mounted at ./workspaces${NC}"
    # Quick test write
    if touch "$WORKSPACE_DIR/.mount-test" 2>/dev/null; then
        rm "$WORKSPACE_DIR/.mount-test"
        echo -e "${GREEN}✅ Mount is writable${NC}"
    else
        echo -e "${YELLOW}⚠️  Mount may be read-only${NC}"
    fi
else
    echo -e "${RED}❌ S3 mount failed${NC}"
    exit 1
fi

# Step 5: Build ephemeral runtime
echo -e "\n${GREEN}[5/6] Building ephemeral container runtime...${NC}"

if [ -d "workspaces/monitor/docker/node-ephemeral" ]; then
    docker build -t workspace-node-ephemeral:latest workspaces/monitor/docker/node-ephemeral/
    echo -e "${GREEN}✅ Ephemeral runtime built${NC}"
else
    echo -e "${YELLOW}⚠️  Monitor workspace not found locally${NC}"
    echo "You'll need to upload the monitor workspace to S3 first"
fi

# Step 6: Check for monitor in S3
echo -e "\n${GREEN}[6/6] Checking for monitor workspace...${NC}"

# Check if monitor exists in S3
if docker run --rm --network traefik-network \
    -e MC_HOST_minio=http://$MINIO_USER:$MINIO_PASS@minio:9000 \
    minio/mc ls minio/workspaces/ 2>/dev/null | grep -q "monitor/"; then
    
    echo -e "${GREEN}✅ Monitor workspace found in S3${NC}"
    
    # Check if monitor has docker-compose.yml
    if [ -f "$WORKSPACE_DIR/monitor/docker-compose.yml" ]; then
        echo -e "${GREEN}Starting monitor from S3...${NC}"
        cd "$WORKSPACE_DIR/monitor"
        docker-compose up -d
        cd - > /dev/null
        
        echo -e "${GREEN}✅ Monitor started${NC}"
        echo -e "   Dashboard: ${BLUE}https://$DOMAIN/monitor${NC}"
    else
        echo -e "${YELLOW}⚠️  Monitor needs docker-compose.yml${NC}"
        echo "Upload a docker-compose.yml to ./workspaces/monitor/"
    fi
else
    echo -e "${YELLOW}⚠️  Monitor workspace not found in S3${NC}"
    echo ""
    echo "To set up the monitor workspace:"
    echo "1. Create monitor workspace in S3:"
    echo "   mkdir ./workspaces/monitor"
    echo ""
    echo "2. Upload monitor code:"
    echo "   - package.json"
    echo "   - src/*.js"
    echo "   - public/*"
    echo "   - docker-compose.yml"
    echo ""
    echo "3. Re-run this bootstrap script"
fi

# Summary
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                  Setup Complete!                     ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}System Status:${NC}"
echo -e "  ✅ MinIO S3 Storage: ${BLUE}http://localhost:9001${NC}"
echo -e "  ✅ S3 Mounted at: ${BLUE}./workspaces${NC}"
echo -e "  ✅ Domain: ${BLUE}$DOMAIN${NC}"

if docker ps | grep -q workspace-monitor; then
    echo -e "  ✅ Monitor: ${BLUE}https://$DOMAIN/monitor${NC}"
    echo ""
    echo -e "${GREEN}The monitor will now:${NC}"
    echo "  • Scan ./workspaces for projects"
    echo "  • Start containers for any workspace with docker-compose.yml"
    echo "  • Manage container lifecycles"
else
    echo -e "  ⚠️  Monitor: Not running (needs setup)"
fi

echo ""
echo -e "${GREEN}Next Steps:${NC}"
echo "  1. Upload workspaces to S3 (they'll appear in /workspaces)"
echo "  2. Each workspace needs:"
echo "     • Source code (package.json, index.js, etc.)"
echo "     • docker-compose.yml"
echo "  3. Monitor will automatically detect and start them"
echo ""
echo -e "${YELLOW}Remember:${NC}"
echo "  • Never run 'npm install' locally"
echo "  • Edit files directly in ./workspaces/"
echo "  • Dependencies only exist in containers"
echo ""