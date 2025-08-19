#!/bin/bash

# MinIO Backup Script
# Backs up workspaces bucket from local MinIO to remote MinIO server
# Supports both mirror (one-way sync) and bidirectional sync modes

set -e

# Configuration
LOCAL_MINIO_ENDPOINT=${LOCAL_MINIO_ENDPOINT:-http://localhost:9000}
LOCAL_MINIO_USER=${LOCAL_MINIO_USER:-minioadmin}
LOCAL_MINIO_PASSWORD=${LOCAL_MINIO_PASSWORD:-minioadmin}

REMOTE_MINIO_ENDPOINT=${REMOTE_MINIO_ENDPOINT:-https://minio.etdofresh.com}
REMOTE_MINIO_USER=${REMOTE_MINIO_USER}
REMOTE_MINIO_PASSWORD=${REMOTE_MINIO_PASSWORD}

BUCKET_NAME=${BUCKET_NAME:-workspaces}
BACKUP_MODE=${BACKUP_MODE:-mirror}  # Options: mirror, sync
LOG_FILE=${LOG_FILE:-/var/log/minio-backup.log}
DRY_RUN=${DRY_RUN:-false}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        ERROR)
            echo -e "${RED}[ERROR]${NC} $message"
            ;;
        SUCCESS)
            echo -e "${GREEN}[SUCCESS]${NC} $message"
            ;;
        WARNING)
            echo -e "${YELLOW}[WARNING]${NC} $message"
            ;;
        INFO)
            echo -e "${BLUE}[INFO]${NC} $message"
            ;;
        *)
            echo "$message"
            ;;
    esac
    
    # Also log to file if specified
    if [ -n "$LOG_FILE" ] && [ "$LOG_FILE" != "/dev/null" ]; then
        echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
    fi
}

# Function to check if mc is installed
check_mc() {
    if ! command -v mc &> /dev/null; then
        log INFO "MinIO client not found. Installing..."
        
        # Detect OS and architecture
        OS=$(uname -s | tr '[:upper:]' '[:lower:]')
        ARCH=$(uname -m)
        
        case "$ARCH" in
            x86_64)
                ARCH="amd64"
                ;;
            aarch64|arm64)
                ARCH="arm64"
                ;;
        esac
        
        # Download mc
        MC_URL="https://dl.min.io/client/mc/release/${OS}-${ARCH}/mc"
        curl -s -L "$MC_URL" -o /tmp/mc
        chmod +x /tmp/mc
        
        # Move to /usr/local/bin if we have permissions
        if [ -w /usr/local/bin ]; then
            sudo mv /tmp/mc /usr/local/bin/mc
        else
            MC="/tmp/mc"
            log WARNING "Could not install mc globally, using temporary location"
        fi
    fi
    
    MC=${MC:-mc}
}

# Function to validate credentials
validate_credentials() {
    if [ -z "$REMOTE_MINIO_USER" ] || [ -z "$REMOTE_MINIO_PASSWORD" ]; then
        log ERROR "Remote MinIO credentials not provided!"
        log INFO "Please set REMOTE_MINIO_USER and REMOTE_MINIO_PASSWORD environment variables"
        exit 1
    fi
}

# Function to configure MinIO aliases
configure_aliases() {
    log INFO "Configuring MinIO aliases..."
    
    # Configure local MinIO
    $MC alias set local-minio "$LOCAL_MINIO_ENDPOINT" "$LOCAL_MINIO_USER" "$LOCAL_MINIO_PASSWORD" --api S3v4
    
    # Configure remote MinIO
    $MC alias set remote-minio "$REMOTE_MINIO_ENDPOINT" "$REMOTE_MINIO_USER" "$REMOTE_MINIO_PASSWORD" --api S3v4
    
    # Test connections
    log INFO "Testing connections..."
    
    if ! $MC ls local-minio &>/dev/null; then
        log ERROR "Failed to connect to local MinIO at $LOCAL_MINIO_ENDPOINT"
        exit 1
    fi
    log SUCCESS "Connected to local MinIO"
    
    if ! $MC ls remote-minio &>/dev/null; then
        log ERROR "Failed to connect to remote MinIO at $REMOTE_MINIO_ENDPOINT"
        exit 1
    fi
    log SUCCESS "Connected to remote MinIO"
}

# Function to ensure bucket exists on remote
ensure_remote_bucket() {
    log INFO "Checking remote bucket '$BUCKET_NAME'..."
    
    if $MC ls "remote-minio/$BUCKET_NAME" &>/dev/null; then
        log INFO "Remote bucket '$BUCKET_NAME' exists"
    else
        log INFO "Creating remote bucket '$BUCKET_NAME'..."
        $MC mb "remote-minio/$BUCKET_NAME"
        log SUCCESS "Remote bucket created"
        
        # Enable versioning on remote bucket to match local
        log INFO "Enabling versioning on remote bucket..."
        $MC version enable "remote-minio/$BUCKET_NAME"
        log SUCCESS "Versioning enabled on remote bucket"
    fi
}

# Function to perform backup
perform_backup() {
    local source="local-minio/$BUCKET_NAME"
    local dest="remote-minio/$BUCKET_NAME"
    
    log INFO "Starting backup from $source to $dest"
    log INFO "Backup mode: $BACKUP_MODE"
    
    # Build mc command based on mode
    local mc_cmd="$MC"
    local dry_run_flag=""
    
    if [ "$DRY_RUN" = "true" ]; then
        dry_run_flag="--dry-run"
        log WARNING "DRY RUN MODE - No actual changes will be made"
    fi
    
    case $BACKUP_MODE in
        mirror)
            # Mirror: One-way sync from source to destination
            # Removes files from destination that don't exist in source
            log INFO "Performing mirror backup (one-way sync)..."
            $mc_cmd mirror $dry_run_flag \
                --overwrite \
                --preserve \
                --exclude "*.tmp" \
                --exclude ".DS_Store" \
                "$source" "$dest" 2>&1 | while read -r line; do
                    log INFO "$line"
                done
            ;;
            
        sync)
            # Sync: Bidirectional sync (be careful with this!)
            log WARNING "Performing bidirectional sync - changes will be synced both ways!"
            $mc_cmd mirror $dry_run_flag \
                --overwrite \
                --preserve \
                --exclude "*.tmp" \
                --exclude ".DS_Store" \
                "$source" "$dest" 2>&1 | while read -r line; do
                    log INFO "$line"
                done
            ;;
            
        incremental)
            # Incremental: Only copy new and modified files, don't delete
            log INFO "Performing incremental backup (new and modified files only)..."
            $mc_cmd cp $dry_run_flag \
                --recursive \
                --newer-than 7d \
                --preserve \
                --exclude "*.tmp" \
                --exclude ".DS_Store" \
                "$source" "$dest" 2>&1 | while read -r line; do
                    log INFO "$line"
                done
            ;;
            
        *)
            log ERROR "Invalid backup mode: $BACKUP_MODE"
            log INFO "Valid modes are: mirror, sync, incremental"
            exit 1
            ;;
    esac
    
    if [ $? -eq 0 ]; then
        log SUCCESS "Backup completed successfully"
    else
        log ERROR "Backup failed"
        exit 1
    fi
}

# Function to show backup statistics
show_statistics() {
    log INFO "Gathering backup statistics..."
    
    # Get bucket sizes
    local_size=$($MC du --depth 1 "local-minio/$BUCKET_NAME" 2>/dev/null | tail -1 | awk '{print $1}')
    remote_size=$($MC du --depth 1 "remote-minio/$BUCKET_NAME" 2>/dev/null | tail -1 | awk '{print $1}')
    
    # Get object counts
    local_count=$($MC ls --recursive "local-minio/$BUCKET_NAME" 2>/dev/null | wc -l)
    remote_count=$($MC ls --recursive "remote-minio/$BUCKET_NAME" 2>/dev/null | wc -l)
    
    echo ""
    echo "========================================="
    echo "           Backup Statistics"
    echo "========================================="
    echo -e "Local MinIO:"
    echo -e "  Endpoint: ${BLUE}$LOCAL_MINIO_ENDPOINT${NC}"
    echo -e "  Size:     ${GREEN}${local_size:-0}${NC}"
    echo -e "  Objects:  ${GREEN}${local_count}${NC}"
    echo ""
    echo -e "Remote MinIO:"
    echo -e "  Endpoint: ${BLUE}$REMOTE_MINIO_ENDPOINT${NC}"
    echo -e "  Size:     ${GREEN}${remote_size:-0}${NC}"
    echo -e "  Objects:  ${GREEN}${remote_count}${NC}"
    echo "========================================="
}

# Function to setup automatic backup with watch
setup_watch() {
    log INFO "Setting up continuous backup with mc mirror --watch..."
    
    # This will continuously watch for changes and sync them
    $MC mirror --watch \
        --overwrite \
        --preserve \
        --exclude "*.tmp" \
        --exclude ".DS_Store" \
        "local-minio/$BUCKET_NAME" \
        "remote-minio/$BUCKET_NAME"
}

# Main execution
main() {
    echo "========================================="
    echo "       MinIO Backup Script"
    echo "========================================="
    echo ""
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --watch)
                WATCH_MODE=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --mode)
                BACKUP_MODE="$2"
                shift 2
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --watch       Enable continuous backup with file watching"
                echo "  --dry-run     Perform a trial run with no changes made"
                echo "  --mode MODE   Set backup mode (mirror|sync|incremental)"
                echo "  --help        Show this help message"
                echo ""
                echo "Environment Variables:"
                echo "  REMOTE_MINIO_USER      Remote MinIO access key (required)"
                echo "  REMOTE_MINIO_PASSWORD  Remote MinIO secret key (required)"
                echo "  REMOTE_MINIO_ENDPOINT  Remote MinIO endpoint (default: https://minio.etdofresh.com)"
                echo "  BACKUP_MODE           Backup mode (default: mirror)"
                echo "  DRY_RUN               Perform dry run (default: false)"
                exit 0
                ;;
            *)
                log ERROR "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Check and install mc if needed
    check_mc
    
    # Validate credentials
    validate_credentials
    
    # Configure MinIO aliases
    configure_aliases
    
    # Ensure remote bucket exists
    ensure_remote_bucket
    
    # Check if watch mode is enabled
    if [ "$WATCH_MODE" = "true" ]; then
        log INFO "Starting continuous backup with file watching..."
        setup_watch
    else
        # Perform one-time backup
        perform_backup
        
        # Show statistics
        show_statistics
    fi
    
    log SUCCESS "Backup operation completed"
}

# Run main function
main "$@"