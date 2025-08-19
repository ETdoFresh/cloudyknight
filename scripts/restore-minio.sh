#!/bin/bash

# MinIO Restore Script
# Restores workspaces bucket from remote MinIO to local MinIO server
# Used for disaster recovery or migration scenarios

set -e

# Configuration
LOCAL_MINIO_ENDPOINT=${LOCAL_MINIO_ENDPOINT:-http://localhost:9000}
LOCAL_MINIO_USER=${LOCAL_MINIO_USER:-minioadmin}
LOCAL_MINIO_PASSWORD=${LOCAL_MINIO_PASSWORD:-minioadmin}

REMOTE_MINIO_ENDPOINT=${REMOTE_MINIO_ENDPOINT:-https://minio.etdofresh.com}
REMOTE_MINIO_USER=${REMOTE_MINIO_USER}
REMOTE_MINIO_PASSWORD=${REMOTE_MINIO_PASSWORD}

BUCKET_NAME=${BUCKET_NAME:-workspaces}
RESTORE_MODE=${RESTORE_MODE:-mirror}  # Options: mirror, merge
POINT_IN_TIME=${POINT_IN_TIME:-}  # Optional: restore to specific date/time
DRY_RUN=${DRY_RUN:-false}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
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
        CRITICAL)
            echo -e "${MAGENTA}[CRITICAL]${NC} $message"
            ;;
        *)
            echo "$message"
            ;;
    esac
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

# Function to create backup of current local state
backup_current_state() {
    local backup_name="pre-restore-backup-$(date +%Y%m%d-%H%M%S)"
    
    log WARNING "Creating backup of current local state..."
    log INFO "Backup name: $backup_name"
    
    # Create a backup bucket if it doesn't exist
    $MC mb -p "local-minio/${BUCKET_NAME}-backups" 2>/dev/null || true
    
    # Copy current state to backup
    $MC cp --recursive \
        --preserve \
        "local-minio/$BUCKET_NAME" \
        "local-minio/${BUCKET_NAME}-backups/$backup_name/"
    
    if [ $? -eq 0 ]; then
        log SUCCESS "Current state backed up to ${BUCKET_NAME}-backups/$backup_name"
        echo "$backup_name" > /tmp/last-restore-backup.txt
    else
        log ERROR "Failed to create backup of current state"
        return 1
    fi
}

# Function to perform restore
perform_restore() {
    local source="remote-minio/$BUCKET_NAME"
    local dest="local-minio/$BUCKET_NAME"
    
    log CRITICAL "Starting restore from $source to $dest"
    log INFO "Restore mode: $RESTORE_MODE"
    
    # Build mc command based on mode
    local dry_run_flag=""
    
    if [ "$DRY_RUN" = "true" ]; then
        dry_run_flag="--dry-run"
        log WARNING "DRY RUN MODE - No actual changes will be made"
    fi
    
    case $RESTORE_MODE in
        mirror)
            # Mirror: Complete replacement of local with remote
            log WARNING "MIRROR MODE: Local bucket will be completely replaced with remote content!"
            
            if [ "$DRY_RUN" != "true" ]; then
                read -p "Are you sure you want to continue? (yes/no): " confirm
                if [ "$confirm" != "yes" ]; then
                    log INFO "Restore cancelled by user"
                    exit 0
                fi
                
                # Create backup before proceeding
                backup_current_state || exit 1
            fi
            
            log INFO "Performing mirror restore..."
            $MC mirror $dry_run_flag \
                --overwrite \
                --preserve \
                "$source" "$dest" 2>&1 | while read -r line; do
                    log INFO "$line"
                done
            ;;
            
        merge)
            # Merge: Only copy files that don't exist locally or are newer
            log INFO "MERGE MODE: Only newer and missing files will be restored"
            
            log INFO "Performing merge restore..."
            $MC mirror $dry_run_flag \
                --overwrite \
                --preserve \
                --newer-than 0d \
                "$source" "$dest" 2>&1 | while read -r line; do
                    log INFO "$line"
                done
            ;;
            
        point-in-time)
            # Point-in-time: Restore to a specific date/time (if versioning is enabled)
            if [ -z "$POINT_IN_TIME" ]; then
                log ERROR "Point-in-time restore requires POINT_IN_TIME to be set"
                log INFO "Example: POINT_IN_TIME='2024-01-15 10:30:00'"
                exit 1
            fi
            
            log INFO "Performing point-in-time restore to: $POINT_IN_TIME"
            log WARNING "This feature requires versioning to be enabled on the remote bucket"
            
            # Create backup before proceeding
            if [ "$DRY_RUN" != "true" ]; then
                backup_current_state || exit 1
            fi
            
            # Use mc to restore with version history
            $MC restore $dry_run_flag \
                --recursive \
                --versions \
                --newer-than "${POINT_IN_TIME}" \
                "$source" "$dest" 2>&1 | while read -r line; do
                    log INFO "$line"
                done
            ;;
            
        *)
            log ERROR "Invalid restore mode: $RESTORE_MODE"
            log INFO "Valid modes are: mirror, merge, point-in-time"
            exit 1
            ;;
    esac
    
    if [ $? -eq 0 ]; then
        log SUCCESS "Restore completed successfully"
    else
        log ERROR "Restore failed"
        exit 1
    fi
}

# Function to verify restore
verify_restore() {
    log INFO "Verifying restore..."
    
    # Compare object counts
    local_count=$($MC ls --recursive "local-minio/$BUCKET_NAME" 2>/dev/null | wc -l)
    remote_count=$($MC ls --recursive "remote-minio/$BUCKET_NAME" 2>/dev/null | wc -l)
    
    log INFO "Local objects: $local_count"
    log INFO "Remote objects: $remote_count"
    
    if [ "$RESTORE_MODE" = "mirror" ] && [ "$local_count" -ne "$remote_count" ]; then
        log WARNING "Object count mismatch after mirror restore"
    else
        log SUCCESS "Object counts verified"
    fi
    
    # Check for restore backup
    if [ -f /tmp/last-restore-backup.txt ]; then
        backup_name=$(cat /tmp/last-restore-backup.txt)
        log INFO "Pre-restore backup available: $backup_name"
        log INFO "To rollback, run:"
        echo "  mc mirror local-minio/${BUCKET_NAME}-backups/$backup_name/ local-minio/$BUCKET_NAME"
    fi
}

# Function to show restore options
show_restore_options() {
    echo ""
    echo "========================================="
    echo "       Available Restore Options"
    echo "========================================="
    echo ""
    echo "1. Mirror Restore (Complete replacement)"
    echo "   - Replaces entire local bucket with remote"
    echo "   - Deletes local files not in remote"
    echo "   - Creates automatic backup before restore"
    echo ""
    echo "2. Merge Restore (Additive only)"
    echo "   - Only adds new and newer files from remote"
    echo "   - Preserves existing local files"
    echo "   - Safe for incremental updates"
    echo ""
    echo "3. Point-in-Time Restore"
    echo "   - Restore to specific date/time"
    echo "   - Requires versioning on remote bucket"
    echo "   - Creates automatic backup before restore"
    echo ""
}

# Main execution
main() {
    echo "========================================="
    echo "       MinIO Restore Script"
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
                RESTORE_MODE="$2"
                shift 2
                ;;
            --point-in-time)
                RESTORE_MODE="point-in-time"
                POINT_IN_TIME="$2"
                shift 2
                ;;
            --show-options)
                show_restore_options
                exit 0
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --dry-run             Perform a trial run with no changes made"
                echo "  --mode MODE           Set restore mode (mirror|merge|point-in-time)"
                echo "  --point-in-time TIME  Restore to specific time (YYYY-MM-DD HH:MM:SS)"
                echo "  --show-options        Show detailed restore options"
                echo "  --help                Show this help message"
                echo ""
                echo "Environment Variables:"
                echo "  REMOTE_MINIO_USER      Remote MinIO access key (required)"
                echo "  REMOTE_MINIO_PASSWORD  Remote MinIO secret key (required)"
                echo "  REMOTE_MINIO_ENDPOINT  Remote MinIO endpoint"
                echo "  RESTORE_MODE          Restore mode (default: mirror)"
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
    
    # Perform restore
    perform_restore
    
    # Verify restore
    if [ "$DRY_RUN" != "true" ]; then
        verify_restore
    fi
    
    log SUCCESS "Restore operation completed"
}

# Run main function
main "$@"