#!/bin/bash
set -e

echo "🚀 Initializing workspace: $WORKSPACE_NAME"

# Configure AWS CLI for S3 (works with MinIO too)
aws configure set aws_access_key_id $S3_ACCESS_KEY
aws configure set aws_secret_access_key $S3_SECRET_KEY

# Set endpoint for MinIO/S3
S3_CMD="aws s3 --endpoint-url $S3_ENDPOINT"

# Download source code from S3
echo "📥 Downloading source code from S3..."
$S3_CMD sync s3://$S3_BUCKET/$WORKSPACE_NAME/ /app/ \
    --exclude "node_modules/*" \
    --exclude ".git/*" \
    --exclude "*.log" \
    --exclude ".env" \
    --delete

# Check if package.json exists and install dependencies
if [ -f "/app/package.json" ]; then
    echo "📦 Installing dependencies..."
    
    # Check for package-lock.json for faster, deterministic installs
    if [ -f "/app/package-lock.json" ]; then
        npm ci --production
    else
        npm install --production
    fi
    
    echo "✅ Dependencies installed"
else
    echo "ℹ️ No package.json found, skipping dependency installation"
fi

# Create a simple health check file
echo "ready" > /app/.container-ready

# Execute the main command
echo "🏃 Starting application with: $@"
exec "$@"