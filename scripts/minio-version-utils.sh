#!/bin/bash

# MinIO Version Management Utilities
# This script provides utilities for managing object versions in MinIO

set -e

# Configuration
MINIO_ENDPOINT=${MINIO_ENDPOINT:-http://localhost:9000}
MINIO_ROOT_USER=${MINIO_ROOT_USER:-minioadmin}
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD:-minioadmin}
BUCKET_NAME=${BUCKET_NAME:-workspaces}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Download MinIO client if not present
setup_mc() {
    if ! command -v mc &> /dev/null; then
        echo "Downloading MinIO client..."
        curl -s -L https://dl.min.io/client/mc/release/linux-amd64/mc -o /tmp/mc
        chmod +x /tmp/mc
        MC="/tmp/mc"
    else
        MC="mc"
    fi
    
    # Configure MinIO client
    $MC alias set myminio "${MINIO_ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" --api S3v4 2>/dev/null
}

# Function to list all versions of an object
list_versions() {
    local object_path="$1"
    
    echo -e "${BLUE}Listing versions for: ${object_path}${NC}"
    echo "================================"
    
    $MC ls --versions "myminio/${BUCKET_NAME}/${object_path}" 2>/dev/null | \
        awk '{print NR".", $1, $2, $3, $4, $5}' | \
        column -t
}

# Function to restore a specific version
restore_version() {
    local object_path="$1"
    local version_id="$2"
    
    echo -e "${YELLOW}Restoring version ${version_id} of ${object_path}...${NC}"
    
    # Copy the specific version to restore it as the current version
    $MC cp --version-id="${version_id}" \
        "myminio/${BUCKET_NAME}/${object_path}" \
        "myminio/${BUCKET_NAME}/${object_path}"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Successfully restored version ${version_id}${NC}"
    else
        echo -e "${RED}Failed to restore version${NC}"
        return 1
    fi
}

# Function to delete a specific version
delete_version() {
    local object_path="$1"
    local version_id="$2"
    
    echo -e "${YELLOW}Deleting version ${version_id} of ${object_path}...${NC}"
    
    $MC rm --version-id="${version_id}" "myminio/${BUCKET_NAME}/${object_path}"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Successfully deleted version ${version_id}${NC}"
    else
        echo -e "${RED}Failed to delete version${NC}"
        return 1
    fi
}

# Function to show version history with diffs
show_history() {
    local object_path="$1"
    local temp_dir="/tmp/minio_versions_$$"
    
    mkdir -p "$temp_dir"
    
    echo -e "${BLUE}Version history for: ${object_path}${NC}"
    echo "================================"
    
    # Get all versions
    versions=$($MC ls --versions --json "myminio/${BUCKET_NAME}/${object_path}" 2>/dev/null | \
        jq -r '.versionId' | head -10)
    
    if [ -z "$versions" ]; then
        echo "No versions found for ${object_path}"
        return 1
    fi
    
    # Download versions for comparison
    counter=1
    for version in $versions; do
        echo -e "\n${YELLOW}Version $counter: ${version}${NC}"
        
        # Get version metadata
        $MC stat --version-id="${version}" "myminio/${BUCKET_NAME}/${object_path}" 2>/dev/null | \
            grep -E "Last Modified|Size" | sed 's/^/  /'
        
        # Download version for diff
        $MC cat --version-id="${version}" "myminio/${BUCKET_NAME}/${object_path}" > \
            "$temp_dir/version_${counter}.txt" 2>/dev/null
        
        # Show diff with previous version if not the first
        if [ $counter -gt 1 ]; then
            prev=$((counter - 1))
            echo -e "  ${BLUE}Changes from previous version:${NC}"
            diff -u "$temp_dir/version_${prev}.txt" "$temp_dir/version_${counter}.txt" 2>/dev/null | \
                head -20 | sed 's/^/    /' || echo "    (No differences or binary file)"
        fi
        
        counter=$((counter + 1))
        
        # Limit to 5 versions for readability
        if [ $counter -gt 5 ]; then
            echo -e "\n  ${YELLOW}(Showing first 5 versions only)${NC}"
            break
        fi
    done
    
    # Clean up
    rm -rf "$temp_dir"
}

# Function to check versioning status
check_status() {
    echo -e "${BLUE}Versioning Status for bucket '${BUCKET_NAME}'${NC}"
    echo "================================"
    
    VERSION_STATUS=$($MC version info "myminio/${BUCKET_NAME}" | grep -oE "Enabled|Suspended" | head -1)
    
    if [ "$VERSION_STATUS" = "Enabled" ]; then
        echo -e "Status: ${GREEN}ENABLED${NC}"
    elif [ "$VERSION_STATUS" = "Suspended" ]; then
        echo -e "Status: ${YELLOW}SUSPENDED${NC}"
    else
        echo -e "Status: ${RED}UNKNOWN${NC}"
    fi
    
    # Show lifecycle policies if any
    echo -e "\n${BLUE}Lifecycle Policies:${NC}"
    $MC ilm ls "myminio/${BUCKET_NAME}" 2>/dev/null || echo "  No lifecycle policies configured"
}

# Main script logic
main() {
    setup_mc
    
    case "${1:-}" in
        list)
            if [ -z "${2:-}" ]; then
                echo "Usage: $0 list <object-path>"
                exit 1
            fi
            list_versions "$2"
            ;;
        restore)
            if [ -z "${2:-}" ] || [ -z "${3:-}" ]; then
                echo "Usage: $0 restore <object-path> <version-id>"
                exit 1
            fi
            restore_version "$2" "$3"
            ;;
        delete)
            if [ -z "${2:-}" ] || [ -z "${3:-}" ]; then
                echo "Usage: $0 delete <object-path> <version-id>"
                exit 1
            fi
            delete_version "$2" "$3"
            ;;
        history)
            if [ -z "${2:-}" ]; then
                echo "Usage: $0 history <object-path>"
                exit 1
            fi
            show_history "$2"
            ;;
        status)
            check_status
            ;;
        *)
            echo "MinIO Version Management Utilities"
            echo "=================================="
            echo ""
            echo "Usage: $0 <command> [arguments]"
            echo ""
            echo "Commands:"
            echo "  status                      - Check versioning status"
            echo "  list <path>                 - List all versions of an object"
            echo "  restore <path> <version-id> - Restore a specific version"
            echo "  delete <path> <version-id>  - Delete a specific version"
            echo "  history <path>              - Show version history with diffs"
            echo ""
            echo "Examples:"
            echo "  $0 status"
            echo "  $0 list myapp/config.json"
            echo "  $0 restore myapp/config.json abc123"
            echo "  $0 history myapp/config.json"
            echo ""
            echo "Environment Variables:"
            echo "  MINIO_ENDPOINT              - MinIO endpoint (default: http://localhost:9000)"
            echo "  MINIO_ROOT_USER             - MinIO access key (default: minioadmin)"
            echo "  MINIO_ROOT_PASSWORD         - MinIO secret key (default: minioadmin)"
            echo "  BUCKET_NAME                 - Bucket name (default: workspaces)"
            ;;
    esac
}

main "$@"