#!/bin/bash

# Read JSON input from stdin
input=$(cat)

# Extract values from JSON
MODEL_DISPLAY=$(echo "$input" | jq -r '.model.display_name')
MODEL_ID=$(echo "$input" | jq -r '.model.id')
CURRENT_DIR=$(echo "$input" | jq -r '.workspace.current_dir')
PROJECT_DIR=$(echo "$input" | jq -r '.workspace.project_dir')
VERSION=$(echo "$input" | jq -r '.version')
OUTPUT_STYLE=$(echo "$input" | jq -r '.output_style.name // "default"')
SESSION_ID=$(echo "$input" | jq -r '.session_id' | cut -c1-8)

# Get directory name
DIR_NAME="${CURRENT_DIR##*/}"

# Git information
GIT_INFO=""
if git rev-parse --git-dir > /dev/null 2>&1; then
    # Get branch name
    BRANCH=$(git branch --show-current 2>/dev/null)
    
    # Get status indicators
    STATUS=""
    git_status=$(git status --porcelain 2>/dev/null)
    if [ -n "$git_status" ]; then
        # Check for different types of changes
        if echo "$git_status" | grep -q "^M"; then
            STATUS="${STATUS}*"  # Modified files
        fi
        if echo "$git_status" | grep -q "^A"; then
            STATUS="${STATUS}+"  # Added files
        fi
        if echo "$git_status" | grep -q "^D"; then
            STATUS="${STATUS}-"  # Deleted files
        fi
        if echo "$git_status" | grep -q "^??"; then
            STATUS="${STATUS}?"  # Untracked files
        fi
    fi
    
    # Get ahead/behind info
    UPSTREAM=""
    upstream=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null)
    if [ -n "$upstream" ]; then
        ahead=$(git rev-list --count @{u}..HEAD 2>/dev/null)
        behind=$(git rev-list --count HEAD..@{u} 2>/dev/null)
        if [ "$ahead" -gt 0 ] && [ "$behind" -gt 0 ]; then
            UPSTREAM=" ↕${ahead}/${behind}"
        elif [ "$ahead" -gt 0 ]; then
            UPSTREAM=" ↑${ahead}"
        elif [ "$behind" -gt 0 ]; then
            UPSTREAM=" ↓${behind}"
        fi
    fi
    
    if [ -n "$BRANCH" ]; then
        GIT_INFO=" | \033[32m🌿 ${BRANCH}${STATUS}${UPSTREAM}\033[0m"
    else
        # Detached HEAD
        COMMIT=$(git rev-parse --short HEAD 2>/dev/null)
        GIT_INFO=" | \033[33m📍 ${COMMIT}${STATUS}\033[0m"
    fi
fi

# Check if in a virtual environment
VENV_INFO=""
if [ -n "$VIRTUAL_ENV" ]; then
    VENV_NAME=$(basename "$VIRTUAL_ENV")
    VENV_INFO=" | \033[36m🐍 ${VENV_NAME}\033[0m"
elif [ -n "$CONDA_DEFAULT_ENV" ]; then
    VENV_INFO=" | \033[36m🐍 ${CONDA_DEFAULT_ENV}\033[0m"
fi

# Check Node.js project
NODE_INFO=""
if [ -f "package.json" ]; then
    NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//')
    if [ -n "$NODE_VERSION" ]; then
        NODE_INFO=" | \033[92m⬢ ${NODE_VERSION}\033[0m"
    fi
fi

# Check for Docker
DOCKER_INFO=""
if [ -f "docker-compose.yml" ] || [ -f "docker-compose.yaml" ] || [ -f "Dockerfile" ]; then
    DOCKER_INFO=" | \033[34m🐳\033[0m"
fi

# Memory usage (if available on Linux/Mac)
MEM_INFO=""
if command -v free >/dev/null 2>&1; then
    # Linux
    MEM_PERCENT=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100}')
    MEM_INFO=" | \033[93m📊 ${MEM_PERCENT}%\033[0m"
elif command -v vm_stat >/dev/null 2>&1; then
    # macOS (simplified)
    MEM_INFO=" | \033[93m📊\033[0m"
fi

# Time in Chicago/CDT timezone
TIME=$(TZ='America/Chicago' date +"%H:%M")

# Model color based on type
case "$MODEL_ID" in
    *opus*)
        MODEL_COLOR="\033[35m"  # Magenta for Opus
        ;;
    *sonnet*)
        MODEL_COLOR="\033[34m"  # Blue for Sonnet
        ;;
    *haiku*)
        MODEL_COLOR="\033[32m"  # Green for Haiku
        ;;
    *)
        MODEL_COLOR="\033[37m"  # White for others
        ;;
esac

# Output style indicator
if [ "$OUTPUT_STYLE" != "null" ] && [ -n "$OUTPUT_STYLE" ]; then
    STYLE_INFO=" | \033[95m✏️ ${OUTPUT_STYLE}\033[0m"
else
    STYLE_INFO=""
fi

# Build the status line
echo -e "📁 \033[36m${DIR_NAME}\033[0m${GIT_INFO}${VENV_INFO}${NODE_INFO}${DOCKER_INFO}${MEM_INFO}${STYLE_INFO} | \033[90m🕐 ${TIME}\033[0m | ${MODEL_COLOR}🧠 ${MODEL_DISPLAY}\033[0m"