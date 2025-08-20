#!/bin/bash

# MinIO S3 Mount Script for CloudyKnight Workspaces
# This script mounts MinIO bucket to /workspaces directory

# Configuration
MINIO_URL="https://workspaces.etdofresh.com:9000"
BUCKET_NAME="workspaces"
MOUNT_POINT="/workspaces"
BACKUP_DIR="/workspaces-root-backup"
PASSWD_FILE="/home/claude/.passwd-s3fs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}CloudyKnight S3 Workspaces Mount Script${NC}"
echo "========================================"

# Check if credentials file exists
if [ ! -f "$PASSWD_FILE" ]; then
    echo -e "${RED}Error: Credentials file not found at $PASSWD_FILE${NC}"
    echo "Please create the file with format: ACCESS_KEY:SECRET_KEY"
    exit 1
fi

# Check if mount point is already mounted
if mountpoint -q "$MOUNT_POINT"; then
    echo -e "${YELLOW}Warning: $MOUNT_POINT is already mounted${NC}"
    read -p "Do you want to unmount and remount? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Unmounting existing mount..."
        sudo umount "$MOUNT_POINT"
    else
        echo "Exiting without changes."
        exit 0
    fi
fi

# Create backup if not exists and directory has content
if [ -d "$MOUNT_POINT" ] && [ "$(ls -A $MOUNT_POINT)" ]; then
    if [ ! -d "$BACKUP_DIR" ]; then
        echo -e "${YELLOW}Creating backup of existing workspaces...${NC}"
        cp -r "$MOUNT_POINT" "$BACKUP_DIR"
        echo -e "${GREEN}Backup created at: $BACKUP_DIR${NC}"
    else
        echo -e "${YELLOW}Backup already exists at: $BACKUP_DIR${NC}"
    fi
fi

# Mount MinIO bucket
echo "Mounting MinIO bucket..."
s3fs "$BUCKET_NAME" "$MOUNT_POINT" \
    -o passwd_file="$PASSWD_FILE" \
    -o url="$MINIO_URL" \
    -o use_path_request_style \
    -o allow_other \
    -o umask=0022 \
    -o uid=$(id -u) \
    -o gid=$(id -g) \
    -o no_check_certificate \
    -o dbglevel=info \
    -o curldbg

# Check if mount was successful
if mountpoint -q "$MOUNT_POINT"; then
    echo -e "${GREEN}Successfully mounted MinIO bucket to $MOUNT_POINT${NC}"
    echo
    echo "Mount details:"
    df -h "$MOUNT_POINT"
    echo
    echo "Contents:"
    ls -la "$MOUNT_POINT"
else
    echo -e "${RED}Failed to mount MinIO bucket${NC}"
    echo "Please check:"
    echo "1. MinIO credentials in $PASSWD_FILE"
    echo "2. MinIO is accessible at $MINIO_URL"
    echo "3. Bucket '$BUCKET_NAME' exists in MinIO"
    exit 1
fi

echo
echo -e "${GREEN}Done!${NC}"
echo "To unmount later, run: sudo umount $MOUNT_POINT"
echo "To restore from backup, run: cp -r $BACKUP_DIR/* $MOUNT_POINT/"