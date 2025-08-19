# S3-Based Workspace Architecture

## Overview

This document describes the S3-based architecture for workspace storage, which replaces filesystem-based storage with object storage (S3 or MinIO). This approach provides better scalability, separation of concerns, and enables truly ephemeral containers.

## Key Benefits

### 1. **Separation of Code and Runtime**
- Source code stored in S3/MinIO
- Containers fetch code at startup
- No persistent volumes needed

### 2. **Ephemeral Dependencies**
- `node_modules` installed fresh in each container
- No storage of build artifacts in S3
- Clean, reproducible builds every time

### 3. **Selective Sync**
- `.gitignore` rules applied to S3 uploads
- Only source code stored, not dependencies
- Reduced storage costs and faster uploads

### 4. **Scalability**
- Multiple containers can fetch same code
- Easy horizontal scaling
- No filesystem bottlenecks

## Architecture Diagram

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Developer     │────>│   S3/MinIO       │<────│   Container     │
│   Machine       │     │   Storage        │     │   Runtime       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                        │                         │
        │                        │                         │
    workspace upload         stores only:              pulls code &
    (filtered by            - source code              installs deps
    .gitignore)            - package.json              at startup
                           - config files
                           NO node_modules!
```

## Implementation Components

### 1. S3 Manager (`s3-manager.js`)

Handles all S3 operations:
- Upload workspaces with `.gitignore` filtering
- List available workspaces
- Download code for containers
- Metadata management

**Key Features:**
```javascript
// Upload only source code, not dependencies
await s3Manager.uploadWorkspace('myapp', './myapp');

// Automatic .gitignore filtering
const ignoredFiles = [
    'node_modules/',
    '.git/',
    '*.log',
    '.env',
    'dist/',
    'build/'
];
```

### 2. Runtime Containers

Each language has an S3-enabled runtime:

#### Node.js Runtime (`docker/node-s3-runtime/`)
```dockerfile
# Fetches code from S3 at startup
# Runs npm install in container
# Truly ephemeral - no persistent state
```

**Startup Process:**
1. Download source from S3
2. Run `npm ci` or `npm install`
3. Start application
4. Mark container as ready

### 3. Workspace CLI (`workspace-cli.js`)

Command-line tool for developers:

```bash
# Upload a workspace
workspace upload myapp ./my-local-app

# Upload with file watching
workspace upload myapp ./my-local-app --watch

# List all workspaces
workspace list

# Download for local development
workspace download myapp ./local-copy

# Delete a workspace
workspace delete myapp
```

### 4. Compose Generator (`compose-generator-s3.js`)

Generates Docker Compose files with S3 configuration:
- No volume mounts needed
- Environment variables for S3 access
- Health checks for readiness

## Setup Instructions

### 1. Install MinIO (Local S3)

```bash
# Start MinIO
docker-compose -f docker-compose.minio.yml up -d

# Access MinIO Console
# http://localhost:9001
# Default: minioadmin/minioadmin
```

### 2. Configure Environment

```bash
# Copy example environment
cp .env.example .env

# Edit with your S3/MinIO credentials
vim .env
```

### 3. Build Runtime Images

```bash
# Build Node.js S3 runtime
docker build -t workspace-node-s3:latest docker/node-s3-runtime/

# Build other runtimes as needed
docker build -t workspace-python-s3:latest docker/python-s3-runtime/
```

### 4. Upload a Workspace

```bash
# Install CLI dependencies
npm install

# Make CLI executable
chmod +x src/workspace-cli.js

# Upload your first workspace
./src/workspace-cli.js upload myapp /path/to/your/app
```

### 5. Start Monitor

```bash
# Start the monitor service
docker-compose up -d

# Monitor will now:
# - Poll S3 for workspaces
# - Generate compose files
# - Start containers that fetch from S3
```

## Workflow Examples

### Development Workflow

```bash
# 1. Develop locally
cd ~/projects/myapp
npm install
npm run dev

# 2. Upload to S3 when ready
workspace upload myapp .

# 3. Container automatically:
#    - Fetches latest code
#    - Installs dependencies
#    - Starts application

# 4. Watch mode for rapid iteration
workspace upload myapp . --watch
```

### CI/CD Workflow

```yaml
# GitHub Actions Example
- name: Upload to S3
  run: |
    workspace sync ${{ github.event.repository.name }} .
  env:
    S3_ENDPOINT: ${{ secrets.S3_ENDPOINT }}
    S3_ACCESS_KEY: ${{ secrets.S3_ACCESS_KEY }}
    S3_SECRET_KEY: ${{ secrets.S3_SECRET_KEY }}
```

## Storage Optimization

### What Gets Stored in S3

✅ **Stored:**
- Source code files (.js, .py, .php, etc.)
- Configuration files (package.json, requirements.txt)
- Static assets (images, CSS, HTML)
- Documentation

❌ **Not Stored:**
- node_modules/
- __pycache__/
- vendor/ (PHP)
- .git/
- Build outputs (dist/, build/)
- Log files
- Environment files (.env)
- IDE configs (.vscode/, .idea/)

### Storage Calculation Example

**Traditional Approach:**
```
Project Size: 500MB
- Source code: 5MB
- node_modules: 495MB
Storage needed: 500MB per deployment
```

**S3 Approach:**
```
S3 Storage: 5MB (source only)
Container: 495MB (ephemeral, not stored)
Storage needed: 5MB permanently
```

**Savings: 99% storage reduction!**

## Security Considerations

### 1. Credentials Management
- S3 credentials passed as environment variables
- Never committed to source control
- Use IAM roles in production

### 2. Network Security
- Containers only access S3 during startup
- No persistent connections
- Can use VPC endpoints for AWS S3

### 3. Code Integrity
- S3 versioning for rollback capability
- Object locks for production workspaces
- Signed URLs for secure downloads

## Performance Optimization

### 1. Container Startup Time

**Optimizations:**
- Use `npm ci` with package-lock.json (faster)
- Layer caching in Docker builds
- Pre-built base images with common dependencies

### 2. S3 Transfer Speed

**Optimizations:**
- Compress files before upload
- Use S3 multipart uploads for large files
- CDN for static assets

### 3. Dependency Caching

**Future Enhancement:**
```dockerfile
# Shared dependency cache volume
volumes:
  - npm-cache:/root/.npm
```

## Migration from Filesystem

### Step 1: Identify Workspaces
```bash
ls -la /workspaces/
```

### Step 2: Upload Each Workspace
```bash
for dir in /workspaces/*/; do
  workspace_name=$(basename "$dir")
  workspace upload "$workspace_name" "$dir"
done
```

### Step 3: Update Monitor Configuration
```yaml
# Change storage mode
STORAGE_MODE=s3
```

### Step 4: Rebuild Containers
```bash
docker-compose down
docker-compose up -d --build
```

## Troubleshooting

### Container Won't Start
```bash
# Check S3 connectivity
docker exec workspace-myapp aws s3 ls s3://workspaces/ --endpoint-url http://minio:9000

# Check logs
docker logs workspace-myapp
```

### Slow npm install
```bash
# Use npm ci instead
# Ensure package-lock.json is in S3
workspace upload myapp . --include-lock
```

### S3 Access Denied
```bash
# Verify credentials
aws s3 ls --endpoint-url $S3_ENDPOINT

# Check bucket policy
mc policy get myminio/workspaces
```

## Advanced Features

### 1. Multi-Stage Builds
```dockerfile
# Build stage (compile TypeScript, etc.)
FROM node:20 AS builder
# ... build steps ...

# Runtime stage (fetch from S3)
FROM workspace-node-s3:latest
# Inherits S3 fetch capability
```

### 2. Workspace Versioning
```javascript
// Upload with version tag
await s3Manager.uploadWorkspace('myapp-v2.0', './myapp');

// Container uses specific version
WORKSPACE_NAME=myapp-v2.0
```

### 3. Blue-Green Deployments
```bash
# Upload new version
workspace upload myapp-green .

# Switch traffic in Traefik
# Roll back if needed by switching back
```

## Cost Analysis

### Storage Costs (Monthly)

**Traditional (EBS/Local):**
- 100GB for 10 projects: $10/month
- Includes all node_modules

**S3/MinIO:**
- 1GB for 10 projects: $0.023/month
- Only source code stored

**Savings: 99.77% reduction**

### Bandwidth Considerations
- Initial container start: ~500MB download
- Subsequent starts: Docker layer cache
- Use private S3 endpoints to avoid charges

## Future Enhancements

1. **Dependency Layer Caching**
   - Shared npm cache across containers
   - Pre-built dependency images

2. **Git-Style Versioning**
   - Tag workspaces like git tags
   - Branch-based deployments

3. **Incremental Sync**
   - Only upload changed files
   - Binary diff uploads

4. **Global CDN**
   - CloudFront for S3
   - Edge locations for faster pulls

## Conclusion

The S3-based architecture provides:
- ✅ 99% storage reduction
- ✅ True container ephemerality
- ✅ Clean, reproducible builds
- ✅ Better scalability
- ✅ Simplified backup/restore

Perfect for modern cloud-native development!