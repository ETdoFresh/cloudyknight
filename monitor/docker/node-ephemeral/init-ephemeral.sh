#!/bin/sh
set -e

echo "🚀 Initializing ephemeral Node.js environment"

# Copy source files from mounted volume (excluding what we don't need)
echo "📁 Copying source files..."
cp -r /workspace/* /app/ 2>/dev/null || true
cp -r /workspace/.[^.]* /app/ 2>/dev/null || true

# Check if package.json exists
if [ -f "/app/package.json" ]; then
    echo "📦 Installing dependencies (ephemeral)..."
    
    # Install dependencies - using npm install for better compatibility
    # npm ci can fail with lock file mismatches in ephemeral environments
    npm install --production
    
    echo "✅ Dependencies installed (exist only in this container)"
else
    echo "⚠️  No package.json found"
fi

# Create health check file
echo "ready" > /app/.container-ready

# Execute the main command
echo "🏃 Starting application: $@"
exec "$@"