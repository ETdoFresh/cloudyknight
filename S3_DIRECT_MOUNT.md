# S3 Direct Mount Architecture (No Local node_modules)

## Overview

This architecture mounts S3 directly as `/workspaces`, eliminating local filesystem storage entirely. Node_modules and other dependencies exist ONLY inside Docker containers, never on the host or in S3.

## Architecture Diagram

```
     S3/MinIO                  Local Server              Docker Containers
         │                          │                           │
         │                          │                           │
    [workspaces]  <──[mount]──  /workspaces  ──[read]──>  /workspace → /app
    (source only)             (S3 mounted)                     │
         │                          │                          │
    package.json                Edit here                 npm install
    index.js                   directly                  (ephemeral)
    NO node_modules!          NO node_modules!          node_modules HERE ONLY!
```

## Key Benefits

1. **Zero node_modules on host**: Never deal with node_modules locally
2. **Single source of truth**: S3 stores all source code
3. **Clean containers**: Each container has fresh dependencies
4. **Direct editing**: Edit files directly on S3 mount
5. **Automatic saves**: All changes instantly in S3

## Quick Start

### 1. Run Setup Script

```bash
chmod +x scripts/setup-s3-mount.sh
./scripts/setup-s3-mount.sh
```

This will:
- Start MinIO (S3 storage)
- Mount S3 at `/workspaces`
- Build ephemeral containers
- Start monitor service

### 2. Create a Workspace

```bash
# Create new app directly on S3
mkdir /workspaces/myapp
cd /workspaces/myapp

# Create package.json
cat > package.json << 'EOF'
{
  "name": "myapp",
  "version": "1.0.0",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  }
}
EOF

# Create app
cat > index.js << 'EOF'
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Hello from S3!'));
app.listen(3000, () => console.log('Running on port 3000'));
EOF
```

### 3. Monitor Auto-Creates Container

The monitor detects the new workspace and:
1. Creates a Docker container
2. Mounts `/workspaces/myapp` as `/workspace` (read-only)
3. Copies source to `/app` inside container
4. Runs `npm install` inside container
5. Starts the application

### 4. Access Your App

```
https://yourdomain.com/myapp
```

## How It Works

### File Storage Layers

| Location | Contents | Persistence |
|----------|----------|-------------|
| **S3/MinIO** | Source code only | Permanent |
| **`/workspaces`** | S3 mount point | Mounted view |
| **Container `/workspace`** | Read-only mount | Container lifetime |
| **Container `/app`** | Working copy + node_modules | Ephemeral |

### Container Startup Process

```bash
# 1. Container starts with source mounted at /workspace (read-only)
/workspace/
├── package.json
├── index.js
└── (NO node_modules)

# 2. Init script copies to /app
cp -r /workspace/* /app/

# 3. Install dependencies in container
cd /app && npm install

# 4. Now container has everything
/app/
├── package.json
├── index.js
└── node_modules/   # Exists ONLY here!

# 5. Start application
npm start
```

## Development Workflow

### Creating Projects

```bash
# Node.js app
mkdir /workspaces/api
cd /workspaces/api
vim package.json  # Dependencies defined here
vim index.js      # Your code
# DO NOT run npm install!

# Python app
mkdir /workspaces/ml-service
cd /workspaces/ml-service
vim requirements.txt  # Dependencies defined here
vim app.py           # Your code
# DO NOT run pip install!

# Static site
mkdir /workspaces/website
cd /workspaces/website
mkdir public
vim public/index.html
# No dependencies needed
```

### Editing Files

```bash
# Edit directly on S3 mount
cd /workspaces/myapp
vim index.js

# Changes are:
# 1. Saved to S3 immediately
# 2. Detected by monitor
# 3. Container restarted with new code
```

### Viewing Files

```bash
# List workspaces
ls /workspaces/

# View project structure
tree /workspaces/myapp/

# Important: You'll never see node_modules here!
```

## Configuration

### Exclude Patterns (Built into RClone)

These are never stored in S3:
```
node_modules/**
.git/**
*.log
.env*
dist/**
build/**
__pycache__/**
vendor/**
```

### Environment Variables

```bash
# .env file for docker-compose
DOMAIN=yourdomain.com
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=yourpassword
```

### Custom Container Commands

Create `workspace.json` in your project:
```json
{
  "type": "node",
  "port": 3000,
  "command": "npm run dev",
  "env": {
    "NODE_ENV": "development"
  }
}
```

## Container Types

### Node.js Projects
- Detected by: `package.json`
- Runtime: `workspace-node-ephemeral`
- Process: Copy source → npm install → npm start

### Python Projects
- Detected by: `requirements.txt` or `app.py`
- Runtime: `workspace-python-ephemeral`
- Process: Copy source → pip install → python app.py

### Static Sites
- Detected by: `index.html`
- Runtime: `nginx:alpine`
- Process: Serve directly from mount

### Go Projects
- Detected by: `go.mod` or `main.go`
- Runtime: `workspace-go-ephemeral`
- Process: Copy source → go mod download → go run

## Troubleshooting

### Mount Issues

```bash
# Check if mounted
mountpoint /workspaces

# Check mount logs
docker logs workspace-rclone-direct

# Remount if needed
docker-compose -f docker-compose.s3-direct.yml restart rclone-workspaces
```

### Container Won't Start

```bash
# Check container logs
docker logs workspace-myapp

# Usually it's:
# - Syntax error in code
# - Missing package.json
# - Wrong start command

# Manual test
docker run --rm -it \
  -v /workspaces/myapp:/workspace:ro \
  workspace-node-ephemeral:latest \
  /bin/sh
```

### Can't Edit Files

```bash
# Check permissions
ls -la /workspaces/

# Fix permissions if needed
docker exec workspace-rclone-direct chmod -R 777 /workspaces
```

### MinIO Access

```bash
# Web console
http://localhost:9001
Username: minioadmin
Password: minioadmin

# View buckets
docker run --rm minio/mc ls minio/workspaces/
```

## Performance Tips

### RClone Cache Settings

```yaml
# In docker-compose.s3-direct.yml
--vfs-cache-mode writes     # Only cache writes
--vfs-cache-max-size 500M   # Limit cache size
--dir-cache-time 1m         # Faster directory updates
--poll-interval 15s         # Quick change detection
```

### Container Optimization

```dockerfile
# Use npm ci for faster installs
if [ -f "package-lock.json" ]; then
    npm ci --production
else
    npm install --production
fi
```

## Migration Guide

### From Local Workspaces

```bash
# 1. Run setup script - it will offer to migrate
./scripts/setup-s3-mount.sh

# 2. Or manually upload each workspace
docker run --rm -v /old/workspaces/myapp:/data:ro minio/mc cp -r \
  --exclude "node_modules/*" \
  /data/ minio/workspaces/myapp/

# 3. Remove old node_modules
rm -rf /old/workspaces/*/node_modules
```

### Rollback

```bash
# 1. Stop mount
docker-compose -f docker-compose.s3-direct.yml down

# 2. Download from S3 if needed
mkdir /local-workspaces
mc cp -r minio/workspaces/ /local-workspaces/

# 3. Install dependencies locally
cd /local-workspaces/myapp && npm install
```

## Best Practices

### DO ✅

- Edit files directly in `/workspaces/`
- Define all dependencies in package.json/requirements.txt
- Use `.gitignore` for local development files
- Commit package-lock.json for reproducible builds
- Test locally by checking container logs

### DON'T ❌

- Run `npm install` on the host
- Try to access node_modules locally
- Store secrets in S3
- Edit files in containers
- Mount node_modules volumes

## Storage Comparison

| Approach | Local Disk | S3 Storage | Container |
|----------|------------|------------|-----------|
| **Traditional** | 500MB/project | - | Shared node_modules |
| **S3 Sync** | 500MB/project | 5MB/project | Mounted volumes |
| **S3 Direct Mount** | 0MB | 5MB/project | 500MB ephemeral |

**Result**: 100% local disk savings, 99% S3 storage efficiency!

## Example Project Structure

```
/workspaces/              # S3 mounted here
├── www/                  # Static site
│   └── public/
│       └── index.html
├── api/                  # Node.js API
│   ├── package.json
│   ├── package-lock.json
│   └── src/
│       └── index.js
├── admin/                # React app
│   ├── package.json
│   ├── public/
│   └── src/
└── ml-service/          # Python service
    ├── requirements.txt
    └── app.py

# Note: NO node_modules, __pycache__, dist, or build folders!
```

## Summary

This architecture provides:
- ✅ **Zero local storage** - Everything in S3
- ✅ **No node_modules locally** - Only in containers
- ✅ **Direct editing** - Work on S3 mount
- ✅ **Clean builds** - Fresh dependencies every time
- ✅ **Simple workflow** - Just edit and save
- ✅ **Cost effective** - 99% storage reduction

Perfect for cloud-native development with complete separation of source and dependencies!