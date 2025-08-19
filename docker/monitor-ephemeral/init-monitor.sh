#!/bin/sh
set -e

echo "🚀 Initializing Monitor (ephemeral environment)"

# Copy source files from mounted volume
echo "📁 Copying monitor source files..."
cp -r /workspace/* /app/ 2>/dev/null || true
cp -r /workspace/.[^.]* /app/ 2>/dev/null || true

# Check if package.json exists
if [ -f "/app/package.json" ]; then
    echo "📦 Installing monitor dependencies..."
    npm install --production
    echo "✅ Dependencies installed"
else
    echo "⚠️  No package.json found"
fi

# Verify Docker access
if docker version > /dev/null 2>&1; then
    echo "✅ Docker access confirmed"
else
    echo "❌ Docker not accessible!"
fi

# Create health check file
echo "ready" > /app/.container-ready

# Execute the main command
echo "🏃 Starting monitor: $@"
exec "$@"