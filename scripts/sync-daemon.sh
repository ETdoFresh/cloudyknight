#!/bin/bash

# Sync Daemon - Continuously syncs workspaces to S3 with .gitignore filtering
# Runs inside Docker container

set -e

# Configuration from environment
S3_ENDPOINT="${S3_ENDPOINT:-http://minio:9000}"
S3_BUCKET="${S3_BUCKET:-workspaces}"
SYNC_INTERVAL="${SYNC_INTERVAL:-60}"
LOCAL_PATH="/local/workspaces"
STATE_FILE="/var/lib/sync/last-sync"

# Configure AWS CLI
aws configure set aws_access_key_id "$S3_ACCESS_KEY"
aws configure set aws_secret_access_key "$S3_SECRET_KEY"
aws configure set default.region us-east-1

echo "Starting workspace sync daemon"
echo "S3 Endpoint: $S3_ENDPOINT"
echo "S3 Bucket: $S3_BUCKET"
echo "Sync Interval: ${SYNC_INTERVAL}s"

# Create bucket if it doesn't exist
aws s3 mb "s3://$S3_BUCKET" --endpoint-url "$S3_ENDPOINT" 2>/dev/null || true

# Function to sync a workspace
sync_workspace() {
    local workspace=$1
    local workspace_path="$LOCAL_PATH/$workspace"
    
    echo "[$(date)] Syncing workspace: $workspace"
    
    # Build exclude list from .gitignore and defaults
    local excludes=(
        "--exclude=node_modules/*"
        "--exclude=.git/*"
        "--exclude=*.log"
        "--exclude=.env*"
        "--exclude=dist/*"
        "--exclude=build/*"
        "--exclude=__pycache__/*"
        "--exclude=*.pyc"
        "--exclude=vendor/*"
        "--exclude=.DS_Store"
        "--exclude=Thumbs.db"
    )
    
    # Add .gitignore patterns if file exists
    if [ -f "$workspace_path/.gitignore" ]; then
        while IFS= read -r pattern; do
            # Skip comments and empty lines
            [[ "$pattern" =~ ^#.*$ ]] && continue
            [ -z "$pattern" ] && continue
            
            # Convert gitignore pattern to aws s3 exclude
            excludes+=("--exclude=$pattern")
        done < "$workspace_path/.gitignore"
    fi
    
    # Sync to S3 with excludes
    aws s3 sync "$workspace_path" "s3://$S3_BUCKET/$workspace/" \
        --endpoint-url "$S3_ENDPOINT" \
        --delete \
        "${excludes[@]}" \
        --size-only \
        --quiet
    
    echo "[$(date)] Completed sync for: $workspace"
}

# Function to sync all workspaces
sync_all() {
    echo "[$(date)] Starting sync cycle"
    
    # Find all directories in workspaces (excluding monitor)
    for workspace_dir in "$LOCAL_PATH"/*; do
        if [ -d "$workspace_dir" ]; then
            workspace=$(basename "$workspace_dir")
            
            # Skip monitor directory
            [ "$workspace" = "monitor" ] && continue
            
            sync_workspace "$workspace"
        fi
    done
    
    # Update state file
    date > "$STATE_FILE"
    echo "[$(date)] Sync cycle complete"
}

# Initial sync
sync_all

# Main loop - sync periodically
echo "Entering main sync loop (interval: ${SYNC_INTERVAL}s)"
while true; do
    sleep "$SYNC_INTERVAL"
    sync_all
done