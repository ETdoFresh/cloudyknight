# S3 Mount Architecture

## Overview

This architecture mounts S3/MinIO as a local filesystem using FUSE (Filesystem in Userspace), allowing the existing monitor to work transparently while gaining S3 storage benefits. Local workspaces are synced to S3 with `.gitignore` filtering to exclude dependencies and build artifacts.

## Architecture Flow

```
Local Development          S3 Storage              Container Environment
      │                        │                           │
      │                        │                           │
 workspaces/  ──[sync]───►  MinIO/S3  ◄──[mount]──  /workspaces
   (full)                   (filtered)               (read-only)
      │                        │                           │
      │                        │                           │
   includes:                stores:                    sees:
 - source code            - source code             - source code
 - node_modules          - configs                  - configs  
 - .git                  - assets                   - assets
 - everything            NO node_modules!           NO node_modules!
```

## Key Components

### 1. **MinIO** - S3-Compatible Storage
- Local S3 implementation
- Web console at port 9001
- API at port 9000
- Stores filtered workspace files

### 2. **FUSE Mount** (Two Options)

#### Option A: S3FS
```yaml
# Simpler but slower
s3fs-mounter:
  image: efrecon/s3fs:latest
  privileged: true
```

#### Option B: RClone (Recommended)
```yaml
# Better performance and caching
rclone-mount:
  image: rclone/rclone:latest
  command: mount minio:workspaces /mnt/workspaces
    --vfs-cache-mode full
```

### 3. **Sync Service**
- Watches local `/workspaces` directory
- Uploads to S3 with `.gitignore` filtering
- Excludes node_modules, .git, build artifacts
- Runs periodically or on file changes

### 4. **Monitor Service**
- Uses S3-mounted `/workspaces` directory
- Works exactly like before
- No code changes needed
- Sees filtered view (no node_modules)

## Setup Instructions

### Quick Start

1. **Start MinIO and Mount**:
```bash
# Using RClone (recommended)
docker-compose -f docker-compose.rclone.yml up -d

# OR using S3FS
docker-compose -f docker-compose.s3fs.yml up -d
```

2. **Access MinIO Console**:
```
http://localhost:9001
Username: minioadmin
Password: minioadmin
```

3. **Sync Local Workspaces**:
```bash
# Make sync script executable
chmod +x scripts/s3-workspace-sync.sh

# Sync all workspaces once
./scripts/s3-workspace-sync.sh

# Or watch for changes
./scripts/s3-workspace-sync.sh watch
```

4. **Monitor Starts Automatically**:
- Reads from S3-mounted filesystem
- Creates containers as usual
- Dashboard at `https://domain/monitor`

## How It Works

### Step 1: Local Development
You work normally in `./workspaces/`:
```
workspaces/
├── www/
│   ├── package.json
│   ├── node_modules/     # Local only
│   └── public/
├── api/
│   ├── app.js
│   ├── node_modules/     # Local only
│   └── package.json
```

### Step 2: Filtered Sync to S3
Sync service uploads to S3, excluding:
- `node_modules/`
- `.git/`
- `dist/`, `build/`
- Files in `.gitignore`

S3 contains:
```
s3://workspaces/
├── www/
│   ├── package.json      # ✓ Uploaded
│   └── public/           # ✓ Uploaded
│   # NO node_modules!
├── api/
│   ├── app.js           # ✓ Uploaded
│   └── package.json     # ✓ Uploaded
│   # NO node_modules!
```

### Step 3: S3 Mounted as Filesystem
RClone/S3FS mounts S3 at `/mnt/workspaces`:
```
/mnt/workspaces/          # This is S3!
├── www/
│   ├── package.json
│   └── public/
├── api/
│   ├── app.js
│   └── package.json
```

### Step 4: Containers Install Dependencies
When containers start:
1. Mount code from S3 filesystem
2. Run `npm install` in container
3. Dependencies exist only in container
4. Ephemeral and clean

## Sync Configuration

### Default Excludes
Always excluded from S3:
```
node_modules/
.git/
*.log
.env*
dist/
build/
__pycache__/
vendor/
*.pyc
.DS_Store
Thumbs.db
```

### Custom Excludes
Add patterns to `.gitignore` or `.dockerignore`:
```gitignore
# Custom excludes
temp/
*.tmp
secret-keys/
```

### Manual Sync Commands
```bash
# Sync all workspaces
./scripts/s3-workspace-sync.sh

# Sync specific workspace
./scripts/s3-workspace-sync.sh workspace myapp

# Watch mode (auto-sync on changes)
./scripts/s3-workspace-sync.sh watch
```

## Performance Optimization

### RClone Cache Settings
```yaml
--vfs-cache-mode full        # Cache everything
--vfs-cache-max-size 1G      # Max cache size
--vfs-cache-max-age 1h       # Cache expiry
--dir-cache-time 5m          # Directory listing cache
```

### Sync Optimization
```bash
# Only sync changed files (size comparison)
aws s3 sync --size-only

# Parallel uploads
aws s3 sync --cli-write-timeout 0 --cli-read-timeout 0
```

## Comparison: Mount vs Direct S3

| Aspect | S3 Mount (This Approach) | Direct S3 (Previous) |
|--------|-------------------------|---------------------|
| Code Changes | None - works with existing monitor | Requires rewrite |
| Complexity | Medium - needs FUSE mount | High - custom container images |
| Performance | Good with caching | Better - direct S3 |
| Local Dev | Normal filesystem | Upload required |
| Filtering | Sync service handles | Built into upload |
| Container Start | Normal + npm install | Download from S3 + npm install |

## Advantages

1. **No Code Changes**: Existing monitor works as-is
2. **Transparent**: S3 appears as normal filesystem
3. **Filtered Storage**: Only source in S3, not dependencies
4. **Local Development**: Work normally with full node_modules
5. **Cost Effective**: 90%+ storage reduction in S3

## Troubleshooting

### Mount Not Working
```bash
# Check if mount is active
docker exec workspace-rclone df -h /mnt/workspaces

# Check mount logs
docker logs workspace-rclone

# Verify S3 connectivity
docker exec workspace-rclone rclone ls minio:workspaces
```

### Files Not Syncing
```bash
# Check sync logs
docker logs workspace-sync

# Manual sync test
aws s3 ls s3://workspaces/ --endpoint-url http://localhost:9000

# Verify excludes
./scripts/s3-workspace-sync.sh workspace myapp
```

### Performance Issues
```bash
# Increase cache size
RCLONE_VFS_CACHE_MAX_SIZE=5G

# Reduce cache time for fresher data
--dir-cache-time 1m

# Check cache usage
docker exec workspace-rclone rclone cache stats
```

## Migration Path

### From Local Filesystem
1. Start MinIO: `docker-compose -f docker-compose.rclone.yml up -d minio`
2. Sync existing workspaces: `./scripts/s3-workspace-sync.sh`
3. Start mount: `docker-compose -f docker-compose.rclone.yml up -d rclone-mount`
4. Restart monitor: `docker-compose restart monitor`

### Rollback Plan
1. Stop mount: `docker-compose -f docker-compose.rclone.yml stop rclone-mount`
2. Update monitor to use local path
3. Restart monitor
4. Everything works as before

## Best Practices

1. **Use RClone over S3FS**: Better performance and caching
2. **Sync Before Deploy**: Ensure S3 is up-to-date
3. **Monitor Cache Size**: Don't let it grow too large
4. **Exclude Wisely**: Add patterns to `.gitignore`
5. **Regular Backups**: S3 versioning or snapshots

## Example Workflow

```bash
# 1. Developer works locally
cd workspaces/myapp
npm install
npm run dev

# 2. Sync to S3 (manual or automatic)
./scripts/s3-workspace-sync.sh workspace myapp

# 3. Monitor detects change (via S3 mount)
# Automatically creates/updates container

# 4. Container starts with clean environment
# - Mounts source from S3
# - Runs npm install fresh
# - Starts application

# 5. Access application
https://domain.com/myapp
```

## Cost Analysis

**Storage Saved**:
- Local: 5GB (10 projects × 500MB with node_modules)
- S3: 50MB (10 projects × 5MB source only)
- **Savings: 99% storage reduction**

**Network Usage**:
- Initial sync: ~50MB upload
- Container start: ~5MB download per container
- npm install: ~500MB download (from npm, not S3)

## Conclusion

This S3 mount approach provides:
- ✅ No code changes required
- ✅ Transparent S3 integration
- ✅ Filtered storage (no dependencies)
- ✅ Normal local development
- ✅ 99% storage cost reduction
- ✅ Clean container environments

Perfect for teams wanting S3 benefits without rewriting their infrastructure!