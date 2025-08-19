#!/bin/bash

# Multi-Destination MinIO/S3 Backup Script
# Backs up workspaces to multiple S3-compatible destinations
# Supports MinIO, Cloudflare R2, AWS S3, and other S3-compatible services

set -e

# Configuration
LOCAL_MINIO_ENDPOINT=${LOCAL_MINIO_ENDPOINT:-http://localhost:9000}
LOCAL_MINIO_USER=${LOCAL_MINIO_USER:-minioadmin}
LOCAL_MINIO_PASSWORD=${LOCAL_MINIO_PASSWORD:-minioadmin}

# Destination 1: Remote MinIO
REMOTE1_ENDPOINT=${REMOTE1_ENDPOINT:-https://api.minio.etdofresh.com}
REMOTE1_ACCESS_KEY=${REMOTE1_ACCESS_KEY}
REMOTE1_SECRET_KEY=${REMOTE1_SECRET_KEY}
REMOTE1_NAME=${REMOTE1_NAME:-"MinIO Remote"}
REMOTE1_ENABLED=${REMOTE1_ENABLED:-true}

# Destination 2: Cloudflare R2
REMOTE2_ENDPOINT=${REMOTE2_ENDPOINT:-https://a6a59f0988d2ad706f9231e25636c95c.r2.cloudflarestorage.com}
REMOTE2_ACCESS_KEY=${REMOTE2_ACCESS_KEY}
REMOTE2_SECRET_KEY=${REMOTE2_SECRET_KEY}
REMOTE2_NAME=${REMOTE2_NAME:-"Cloudflare R2"}
REMOTE2_ENABLED=${REMOTE2_ENABLED:-true}

BUCKET_NAME=${BUCKET_NAME:-workspaces}
BACKUP_MODE=${BACKUP_MODE:-mirror}
LOG_FILE=${LOG_FILE:-/tmp/multi-backup.log}
DRY_RUN=${DRY_RUN:-false}
PARALLEL_BACKUP=${PARALLEL_BACKUP:-true}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
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
        DEST)
            echo -e "${CYAN}[DESTINATION]${NC} $message"
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
        MC="/tmp/mc"
    else
        MC="mc"
    fi
}

# Function to configure and test a destination
configure_destination() {
    local alias=$1
    local endpoint=$2
    local access_key=$3
    local secret_key=$4
    local name=$5
    
    log DEST "Configuring $name..."
    
    # Configure alias
    if $MC alias set "$alias" "$endpoint" "$access_key" "$secret_key" --api S3v4 2>/dev/null; then
        # Test connection
        if $MC ls "$alias" &>/dev/null; then
            log SUCCESS "Connected to $name"
            
            # Ensure bucket exists
            if $MC ls "$alias/$BUCKET_NAME" &>/dev/null; then
                log INFO "Bucket '$BUCKET_NAME' exists on $name"
            else
                log INFO "Creating bucket '$BUCKET_NAME' on $name..."
                if $MC mb "$alias/$BUCKET_NAME" 2>/dev/null; then
                    log SUCCESS "Bucket created on $name"
                    
                    # Try to enable versioning (may not be supported on all S3 providers)
                    if $MC version enable "$alias/$BUCKET_NAME" 2>/dev/null; then
                        log SUCCESS "Versioning enabled on $name"
                    else
                        log WARNING "Versioning not supported or could not be enabled on $name"
                    fi
                else
                    log ERROR "Failed to create bucket on $name"
                    return 1
                fi
            fi
            return 0
        else
            log ERROR "Failed to connect to $name"
            return 1
        fi
    else
        log ERROR "Failed to configure $name"
        return 1
    fi
}

# Function to perform backup to a single destination
backup_to_destination() {
    local source=$1
    local dest_alias=$2
    local dest_name=$3
    
    log DEST "Starting backup to $dest_name..."
    
    local dest="$dest_alias/$BUCKET_NAME"
    local dry_run_flag=""
    
    if [ "$DRY_RUN" = "true" ]; then
        dry_run_flag="--dry-run"
        log WARNING "DRY RUN MODE for $dest_name"
    fi
    
    # Perform backup based on mode
    case $BACKUP_MODE in
        mirror)
            $MC mirror $dry_run_flag \
                --overwrite \
                --preserve \
                --exclude "*.tmp" \
                --exclude ".DS_Store" \
                "$source" "$dest" 2>&1 | while read -r line; do
                    if echo "$line" | grep -q "Total\|Transferred"; then
                        log INFO "[$dest_name] $line"
                    fi
                done
            ;;
        incremental)
            $MC cp $dry_run_flag \
                --recursive \
                --newer-than 7d \
                --preserve \
                --exclude "*.tmp" \
                --exclude ".DS_Store" \
                "$source" "$dest" 2>&1 | while read -r line; do
                    log INFO "[$dest_name] $line"
                done
            ;;
    esac
    
    if [ $? -eq 0 ]; then
        log SUCCESS "Backup to $dest_name completed"
        return 0
    else
        log ERROR "Backup to $dest_name failed"
        return 1
    fi
}

# Function to show statistics for all destinations
show_statistics() {
    log INFO "Gathering backup statistics..."
    
    echo ""
    echo "========================================="
    echo "       Multi-Destination Backup Stats"
    echo "========================================="
    
    # Local source
    local_size=$($MC du --depth 1 "local-minio/$BUCKET_NAME" 2>/dev/null | tail -1 | awk '{print $1}')
    local_count=$($MC ls --recursive "local-minio/$BUCKET_NAME" 2>/dev/null | wc -l)
    
    echo -e "${BLUE}Source (Local MinIO):${NC}"
    echo -e "  Endpoint: $LOCAL_MINIO_ENDPOINT"
    echo -e "  Size:     ${GREEN}${local_size:-0}${NC}"
    echo -e "  Objects:  ${GREEN}${local_count}${NC}"
    echo ""
    
    # Destination 1
    if [ "$REMOTE1_ENABLED" = "true" ] && [ -n "$REMOTE1_ACCESS_KEY" ]; then
        remote1_size=$($MC du --depth 1 "remote1/$BUCKET_NAME" 2>/dev/null | tail -1 | awk '{print $1}')
        remote1_count=$($MC ls --recursive "remote1/$BUCKET_NAME" 2>/dev/null | wc -l)
        
        echo -e "${CYAN}Destination 1 ($REMOTE1_NAME):${NC}"
        echo -e "  Endpoint: $REMOTE1_ENDPOINT"
        echo -e "  Size:     ${GREEN}${remote1_size:-0}${NC}"
        echo -e "  Objects:  ${GREEN}${remote1_count}${NC}"
        echo ""
    fi
    
    # Destination 2
    if [ "$REMOTE2_ENABLED" = "true" ] && [ -n "$REMOTE2_ACCESS_KEY" ]; then
        remote2_size=$($MC du --depth 1 "remote2/$BUCKET_NAME" 2>/dev/null | tail -1 | awk '{print $1}')
        remote2_count=$($MC ls --recursive "remote2/$BUCKET_NAME" 2>/dev/null | wc -l)
        
        echo -e "${CYAN}Destination 2 ($REMOTE2_NAME):${NC}"
        echo -e "  Endpoint: $REMOTE2_ENDPOINT"
        echo -e "  Size:     ${GREEN}${remote2_size:-0}${NC}"
        echo -e "  Objects:  ${GREEN}${remote2_count}${NC}"
    fi
    
    echo "========================================="
}

# Main execution
main() {
    echo "========================================="
    echo "    Multi-Destination Backup Script"
    echo "========================================="
    echo ""
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --mode)
                BACKUP_MODE="$2"
                shift 2
                ;;
            --parallel)
                PARALLEL_BACKUP=true
                shift
                ;;
            --sequential)
                PARALLEL_BACKUP=false
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --dry-run      Perform a trial run with no changes"
                echo "  --mode MODE    Backup mode (mirror|incremental)"
                echo "  --parallel     Run backups in parallel (default)"
                echo "  --sequential   Run backups sequentially"
                echo "  --help         Show this help message"
                echo ""
                echo "Environment Variables:"
                echo "  REMOTE1_ACCESS_KEY  First destination access key"
                echo "  REMOTE1_SECRET_KEY  First destination secret key"
                echo "  REMOTE2_ACCESS_KEY  Second destination access key"
                echo "  REMOTE2_SECRET_KEY  Second destination secret key"
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
    
    # Configure local MinIO
    log INFO "Configuring local MinIO..."
    $MC alias set local-minio "$LOCAL_MINIO_ENDPOINT" "$LOCAL_MINIO_USER" "$LOCAL_MINIO_PASSWORD" --api S3v4
    
    if ! $MC ls local-minio &>/dev/null; then
        log ERROR "Failed to connect to local MinIO"
        exit 1
    fi
    log SUCCESS "Connected to local MinIO"
    
    # Track successful destinations
    DESTINATIONS=()
    
    # Configure Destination 1 (Remote MinIO)
    if [ "$REMOTE1_ENABLED" = "true" ]; then
        if [ -n "$REMOTE1_ACCESS_KEY" ] && [ -n "$REMOTE1_SECRET_KEY" ]; then
            if configure_destination "remote1" "$REMOTE1_ENDPOINT" "$REMOTE1_ACCESS_KEY" "$REMOTE1_SECRET_KEY" "$REMOTE1_NAME"; then
                DESTINATIONS+=("remote1:$REMOTE1_NAME")
            fi
        else
            log WARNING "Destination 1 ($REMOTE1_NAME) credentials not configured, skipping..."
        fi
    fi
    
    # Configure Destination 2 (Cloudflare R2)
    if [ "$REMOTE2_ENABLED" = "true" ]; then
        if [ -n "$REMOTE2_ACCESS_KEY" ] && [ -n "$REMOTE2_SECRET_KEY" ]; then
            if configure_destination "remote2" "$REMOTE2_ENDPOINT" "$REMOTE2_ACCESS_KEY" "$REMOTE2_SECRET_KEY" "$REMOTE2_NAME"; then
                DESTINATIONS+=("remote2:$REMOTE2_NAME")
            fi
        else
            log WARNING "Destination 2 ($REMOTE2_NAME) credentials not configured, skipping..."
        fi
    fi
    
    # Check if we have any destinations
    if [ ${#DESTINATIONS[@]} -eq 0 ]; then
        log ERROR "No backup destinations configured!"
        log INFO "Please set credentials for at least one destination"
        exit 1
    fi
    
    log INFO "Configured ${#DESTINATIONS[@]} backup destination(s)"
    
    # Perform backups
    echo ""
    log INFO "Starting backups to ${#DESTINATIONS[@]} destination(s)..."
    log INFO "Backup mode: $BACKUP_MODE"
    
    local source="local-minio/$BUCKET_NAME"
    
    if [ "$PARALLEL_BACKUP" = "true" ] && [ ${#DESTINATIONS[@]} -gt 1 ]; then
        log INFO "Running backups in parallel..."
        
        # Run backups in background
        PIDS=()
        for dest in "${DESTINATIONS[@]}"; do
            IFS=':' read -r alias name <<< "$dest"
            backup_to_destination "$source" "$alias" "$name" &
            PIDS+=($!)
        done
        
        # Wait for all backups to complete
        FAILED=0
        for pid in "${PIDS[@]}"; do
            if ! wait $pid; then
                FAILED=$((FAILED + 1))
            fi
        done
        
        if [ $FAILED -eq 0 ]; then
            log SUCCESS "All backups completed successfully"
        else
            log WARNING "$FAILED backup(s) failed"
        fi
    else
        log INFO "Running backups sequentially..."
        
        for dest in "${DESTINATIONS[@]}"; do
            IFS=':' read -r alias name <<< "$dest"
            backup_to_destination "$source" "$alias" "$name"
        done
    fi
    
    # Show statistics
    show_statistics
    
    log SUCCESS "Multi-destination backup operation completed"
}

# Run main function
main "$@"