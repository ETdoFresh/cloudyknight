# CloudyKnight - S3-Based Workspace Platform

A cloud-native development platform where all workspaces live in S3 object storage, with ephemeral container runtimes and automatic orchestration.

## Architecture

```
     Git Repo                S3 Storage              Runtime
         │                       │                      │
    [Bootstrap]  ────────>  [Workspaces]  ────────>  [Containers]
    - docker-compose         - /monitor              - Ephemeral
    - scripts                - /www                  - node_modules
    - configs                - /api                  - Only in container
                            - /blog
                            (source only)
```

## Quick Start

```bash
# 1. Clone this repository (contains only bootstrap code)
git clone <repository>
cd cloudyknight

# 2. Run bootstrap to set up S3 and mounts
chmod +x bootstrap.sh
./bootstrap.sh

# 3. Upload monitor workspace to S3 (first time only)
chmod +x scripts/upload-monitor.sh
./scripts/upload-monitor.sh

# 4. Start monitor (it will manage all other workspaces)
cd /workspaces/monitor
docker-compose up -d
```

## How It Works

1. **Bootstrap** creates:
   - MinIO (S3 storage) at localhost:9000
   - RClone mount at `/workspaces`
   - Ephemeral container runtime

2. **Monitor** (first workspace):
   - Lives in S3 at `/workspaces/monitor`
   - Detects other workspaces
   - Starts their containers automatically

3. **Workspaces**:
   - Exist only in S3
   - Mount at `/workspaces/<name>`
   - Each needs a `docker-compose.yml`

4. **Containers**:
   - Copy source from S3 mount
   - Install dependencies internally
   - Completely ephemeral

## Adding a New Workspace

```bash
# 1. Create workspace directory
mkdir /workspaces/myapp

# 2. Add source files
cd /workspaces/myapp
cat > package.json << EOF
{
  "name": "myapp",
  "dependencies": {
    "express": "^4.18.2"
  }
}
EOF

cat > index.js << EOF
console.log("Hello from S3!");
EOF

# 3. Add docker-compose.yml
cat > docker-compose.yml << EOF
version: '3.8'
services:
  myapp:
    image: workspace-node-ephemeral:latest
    container_name: workspace-myapp
    volumes:
      - /workspaces/myapp:/workspace:ro
    networks:
      - traefik-network
    # ... (add labels, environment, etc.)
networks:
  traefik-network:
    external: true
EOF

# 4. Monitor automatically detects and starts it!
```

## File Structure

```
cloudyknight/                  # Git repository (thin orchestration layer)
├── bootstrap.sh              # Main setup script
├── docker-compose.s3-direct.yml  # S3 and mount services
├── scripts/
│   ├── upload-monitor.sh    # Upload monitor to S3
│   └── ...
└── docker/
    └── node-ephemeral/       # Ephemeral runtime

/workspaces/                  # S3 mount (not in git!)
├── monitor/                  # Monitor workspace (from S3)
│   ├── package.json
│   ├── src/
│   └── docker-compose.yml
├── www/                      # Static site (from S3)
│   ├── public/
│   └── docker-compose.yml
└── api/                      # API service (from S3)
    ├── index.js
    └── docker-compose.yml
```

## Key Principles

1. **No Local Code**: Workspaces exist only in S3
2. **No node_modules**: Dependencies only in containers
3. **Ephemeral Everything**: Containers are stateless
4. **Self-Managing**: Monitor manages all workspaces
5. **Git-Free Workspaces**: Application code separate from infrastructure

## Benefits

- **100% Storage Savings**: No local workspace storage
- **Clean Builds**: Fresh dependencies every time
- **Scalable**: Add unlimited workspaces to S3
- **Portable**: Entire platform in S3 bucket
- **Simple**: Just edit files in `/workspaces/`

## Commands

```bash
# Bootstrap everything
./bootstrap.sh

# View S3 contents
docker run --rm minio/mc ls minio/workspaces/

# Check running containers
docker ps | grep workspace-

# View monitor logs
docker logs workspace-monitor

# Access services
https://yourdomain.com/        # www workspace
https://yourdomain.com/monitor # Monitor dashboard
https://yourdomain.com/api     # API workspace
```

## Cleanup

```bash
# Stop everything
docker-compose -f docker-compose.s3-direct.yml down

# Remove S3 data (careful!)
docker volume rm cloudyknight_minio_data

# Unmount S3
sudo umount /workspaces
```

## Architecture Benefits

This S3-based architecture provides:
- Complete separation of infrastructure (git) and applications (S3)
- True ephemeral containers with no persistent state
- Automatic orchestration via monitor
- 99% storage reduction (no dependencies stored)
- Cloud-native design ready for migration to AWS S3

Perfect for modern cloud development!