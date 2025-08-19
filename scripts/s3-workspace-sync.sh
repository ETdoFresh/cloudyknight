#!/bin/bash

# S3 Workspace Sync Script
# Syncs local workspaces to S3 with .gitignore filtering

set -e

# Configuration
S3_ENDPOINT="${S3_ENDPOINT:-http://localhost:9000}"
S3_BUCKET="${S3_BUCKET:-workspaces}"
S3_ACCESS_KEY="${S3_ACCESS_KEY:-minioadmin}"
S3_SECRET_KEY="${S3_SECRET_KEY:-minioadmin}"
LOCAL_WORKSPACES="${LOCAL_WORKSPACES:-./workspaces}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configure AWS CLI for MinIO
configure_aws() {
    aws configure set aws_access_key_id "$S3_ACCESS_KEY"
    aws configure set aws_secret_access_key "$S3_SECRET_KEY"
    aws configure set default.region us-east-1
}

# Create exclude patterns from .gitignore
create_exclude_file() {
    local workspace_path=$1
    local exclude_file=$2
    
    # Default excludes (always apply these)
    cat > "$exclude_file" << 'EOF'
node_modules/
.git/
*.log
.env
.env.local
.DS_Store
Thumbs.db
dist/
build/
.vscode/
.idea/
*.swp
*.swo
*~
npm-debug.log*
yarn-debug.log*
yarn-error.log*
__pycache__/
*.pyc
vendor/
composer.lock
Gemfile.lock
go.sum
EOF
    
    # Add patterns from .gitignore if it exists
    if [ -f "$workspace_path/.gitignore" ]; then
        log_info "Found .gitignore, adding patterns..."
        # Convert .gitignore patterns to rsync exclude format
        grep -v '^#' "$workspace_path/.gitignore" | grep -v '^$' >> "$exclude_file"
    fi
    
    # Add patterns from .dockerignore if it exists
    if [ -f "$workspace_path/.dockerignore" ]; then
        log_info "Found .dockerignore, adding patterns..."
        grep -v '^#' "$workspace_path/.dockerignore" | grep -v '^$' >> "$exclude_file"
    fi
}

# Sync a single workspace to S3
sync_workspace() {
    local workspace_name=$1
    local workspace_path="$LOCAL_WORKSPACES/$workspace_name"
    
    if [ ! -d "$workspace_path" ]; then
        log_error "Workspace not found: $workspace_path"
        return 1
    fi
    
    log_info "Syncing workspace: $workspace_name"
    
    # Create temporary exclude file
    local exclude_file="/tmp/s3-exclude-$workspace_name.txt"
    create_exclude_file "$workspace_path" "$exclude_file"
    
    # Count files to be synced (for information)
    local file_count=$(find "$workspace_path" -type f | grep -v -f "$exclude_file" | wc -l)
    log_info "Files to sync: $file_count"
    
    # Sync to S3 using aws s3 sync with exclude patterns
    log_info "Uploading to S3..."
    
    # Build exclude arguments for aws s3 sync
    local exclude_args=""
    while IFS= read -r pattern; do
        # Skip empty lines
        [ -z "$pattern" ] && continue
        # Add --exclude for each pattern
        exclude_args="$exclude_args --exclude \"$pattern\""
    done < "$exclude_file"
    
    # Execute sync with excludes
    eval aws s3 sync "$workspace_path" "s3://$S3_BUCKET/$workspace_name/" \
        --endpoint-url "$S3_ENDPOINT" \
        --delete \
        $exclude_args
    
    # Clean up
    rm -f "$exclude_file"
    
    log_info "✅ Workspace $workspace_name synced successfully"
}

# Sync all workspaces
sync_all() {
    log_info "Syncing all workspaces from $LOCAL_WORKSPACES"
    
    if [ ! -d "$LOCAL_WORKSPACES" ]; then
        log_error "Workspaces directory not found: $LOCAL_WORKSPACES"
        exit 1
    fi
    
    # Loop through all directories in workspaces
    for workspace_dir in "$LOCAL_WORKSPACES"/*; do
        if [ -d "$workspace_dir" ]; then
            workspace_name=$(basename "$workspace_dir")
            
            # Skip the monitor directory itself (it's managing, not managed)
            if [ "$workspace_name" = "monitor" ]; then
                log_warn "Skipping monitor workspace"
                continue
            fi
            
            sync_workspace "$workspace_name"
        fi
    done
}

# Watch mode - continuously sync changes
watch_mode() {
    log_info "Starting watch mode (press Ctrl+C to stop)"
    
    # Initial sync
    sync_all
    
    # Watch for changes using inotifywait or fswatch
    if command -v inotifywait &> /dev/null; then
        log_info "Using inotifywait for file watching"
        
        while true; do
            inotifywait -r -e modify,create,delete,move \
                --exclude '(node_modules|\.git|\.log|\.env|dist|build)' \
                "$LOCAL_WORKSPACES" 2>/dev/null | while read path event file; do
                
                # Get workspace name from path
                workspace_name=$(echo "$path" | sed "s|$LOCAL_WORKSPACES/||" | cut -d'/' -f1)
                
                if [ -n "$workspace_name" ] && [ "$workspace_name" != "monitor" ]; then
                    log_info "Change detected in $workspace_name: $event $file"
                    sync_workspace "$workspace_name"
                fi
            done
        done
    elif command -v fswatch &> /dev/null; then
        log_info "Using fswatch for file watching"
        
        fswatch -r --exclude='node_modules' --exclude='.git' "$LOCAL_WORKSPACES" | while read path; do
            # Get workspace name from path
            workspace_name=$(echo "$path" | sed "s|$LOCAL_WORKSPACES/||" | cut -d'/' -f1)
            
            if [ -n "$workspace_name" ] && [ "$workspace_name" != "monitor" ]; then
                log_info "Change detected in $workspace_name"
                sync_workspace "$workspace_name"
            fi
        done
    else
        log_warn "No file watcher available (install inotify-tools or fswatch)"
        log_info "Falling back to periodic sync every 30 seconds"
        
        while true; do
            sleep 30
            sync_all
        done
    fi
}

# Main script logic
main() {
    case "${1:-}" in
        "")
            # No arguments - sync all once
            configure_aws
            sync_all
            ;;
        "watch")
            # Watch mode
            configure_aws
            watch_mode
            ;;
        "workspace")
            # Sync specific workspace
            if [ -z "$2" ]; then
                log_error "Usage: $0 workspace <workspace-name>"
                exit 1
            fi
            configure_aws
            sync_workspace "$2"
            ;;
        "help"|"-h"|"--help")
            cat << EOF
S3 Workspace Sync Script

Usage:
  $0                    # Sync all workspaces once
  $0 watch             # Watch and sync continuously
  $0 workspace <name>  # Sync specific workspace
  $0 help             # Show this help

Environment Variables:
  S3_ENDPOINT          # S3 endpoint URL (default: http://localhost:9000)
  S3_BUCKET           # S3 bucket name (default: workspaces)
  S3_ACCESS_KEY       # S3 access key
  S3_SECRET_KEY       # S3 secret key
  LOCAL_WORKSPACES    # Local workspaces path (default: ./workspaces)

Examples:
  # Sync all workspaces to MinIO
  S3_ENDPOINT=http://localhost:9000 $0

  # Watch for changes and auto-sync
  $0 watch

  # Sync specific workspace
  $0 workspace myapp
EOF
            ;;
        *)
            log_error "Unknown command: $1"
            log_info "Run '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Check for required tools
check_requirements() {
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is required but not installed"
        log_info "Install with: pip install awscli"
        exit 1
    fi
}

# Run checks and main function
check_requirements
main "$@"