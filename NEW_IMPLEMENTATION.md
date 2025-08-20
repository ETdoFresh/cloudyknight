**Workspace Infrastructure Design Document**

---

### Overview

This document outlines the architecture for a server system that hosts multiple isolated workspaces using Docker containers. Each workspace serves static or dynamic content and can be extended to support live code editing, previewing, and deployment. This architecture is designed to be developer-friendly, modular, and easy to scale.

---

### Goals

* Spin up NPM or other services in isolated containers per workspace.
* Route all traffic through Traefik using domain subpaths.
* Support code/data syncing via Git or S3.
* Allow real-time edits and dynamic previews.
* Ensure the system can be used by an AI assistant or programmatically controlled.

---

### Core Components

#### 1. **Docker + Traefik Setup**

* One Linux host running Docker and Portainer.
* Traefik configured as the central reverse proxy.
* Each container is registered with Traefik via labels.
* Routing is handled by path prefix (e.g. `/hello`, `/project-x`).
* TLS, static IP, and dashboard access optionally enabled.

#### 2. **Default Workspace Behavior**

* Each workspace mounts a shared folder.
* If no Docker Compose file exists, a default one is generated.
* Default behavior serves a static `index.html` file.
* Workspace root page (`/`) is the "home" workspace.

#### 3. **Dynamic Workspace Index Page**

* Home page scans all active workspaces.
* Looks for `package.json` or similar metadata.
* Displays name, description, and icon for each workspace.
* Automatically links to `/[workspace]` paths.

---

### Code/Data Sync Strategy

#### A. Git-based Syncing

* Workspace initialized with remote repo.
* Pull on start, push on commit.
* Optionally supports branches or worktrees.

#### B. S3 Backup Model

* Used for cold storage or snapshots.
* Not ideal for real-time syncing.
* Backup process is separate from live editing.

#### C. Future: Real-time Collaborative Editing (RGA)

* Integrate a collaborative editing protocol.
* Multi-agent or user-safe editing on shared files.
* Can be layered over existing workspace files.

---

### Workspace API

#### Endpoints

* `POST /workspaces` — create new workspace
* `GET /workspaces` — list all workspaces
* `POST /workspaces/:id/run` — run command in workspace
* `GET /workspaces/:id/status` — check container + sync state
* `POST /workspaces/:id/sync` — force pull or push changes

#### Monitoring

* Lightweight monitor detects new workspaces
* Automatically runs default compose if none exists
* Optionally pushes to S3 or Git based on metadata

---

### Future Extensions

* Live preview support for Love2D, Node, static HTML
* Authentication and user-linked workspaces
* Persistent volume storage across containers
* Workspace templates and cloning
* Publishing platform: allow user apps to go public

---

## Key Findings from Previous Implementation

### 1. S3/MinIO Storage Architecture

#### Storage Separation Strategy
* **Source Code Only in S3**: The system stores only source files (5MB typical) vs full projects with dependencies (500MB+)
* **99% Storage Reduction**: Achieved by excluding node_modules, build artifacts, and compiled files
* **Three Mount Approaches Tested**:
  - **S3FS Mount**: Simple but slower performance
  - **RClone Mount**: Better caching and performance (chosen solution)
  - **Direct S3 API**: Best performance but requires code changes

#### Versioning and Backup
* **MinIO Versioning**: Enabled by default with lifecycle policies
* **Multi-Destination Backup**: Supports parallel backups to:
  - Remote MinIO server
  - Cloudflare R2 (free egress)
  - AWS S3 compatible endpoints
* **Backup Modes**:
  - Mirror: Complete one-way sync
  - Incremental: Only new/modified files
  - Point-in-time restore capability

### 2. Ephemeral Container Pattern

#### Dependency Management
```dockerfile
# Key pattern from node-ephemeral runtime
WORKDIR /app
# 1. Copy source from read-only mount
cp -r /workspace/* /app/
# 2. Install dependencies fresh in container
npm ci --production
# 3. Mark container as ready
echo "ready" > /app/.container-ready
```

**Benefits**:
- No persistent node_modules on host
- Clean, reproducible builds every time
- Containers are truly stateless
- Each workspace gets fresh dependencies

### 3. Traefik Routing Patterns

#### Intelligent Path-Based Routing
```yaml
# Root domain serves www workspace
- traefik.http.routers.www.rule=Host(`domain.com`)

# Subpaths serve specific workspaces
- traefik.http.routers.api.rule=Host(`domain.com`) && PathPrefix(`/api`)
- traefik.http.middlewares.api-strip.stripprefix.prefixes=/api
```

#### Special Routing Rules
* Files with extensions (`.css`, `.js`) → www workspace
* Paths without extensions (`/blog`, `/api`) → respective workspace containers
* Monitor dashboard at `/monitor` for system management

### 4. Monitor Service Architecture

#### Core Responsibilities
* **Project Detection**: Scans `/workspaces` every 30 seconds
* **Type Detection**: Identifies Node.js, Python, PHP, Go, Ruby, static HTML
* **Compose Generation**: Creates Docker Compose files automatically
* **Container Lifecycle**: Manages start/stop/restart of workspace containers
* **WebSocket Updates**: Real-time dashboard with live status

#### Project Detection Logic
```javascript
// Detection signatures from project-detector.js
Node.js:     package.json
Python:      requirements.txt, app.py, main.py
PHP:         index.php, composer.json
Go:          go.mod, main.go
Ruby:        Gemfile
Static:      index.html (without above files)
```

### 5. Workspace Sync Strategies

#### Git-Based Sync
* Not implemented in final version
* Considered for future enhancement

#### S3 Sync with Filtering
```bash
# Automatic .gitignore filtering
--exclude "node_modules/*"
--exclude ".git/*"
--exclude "*.log"
--exclude "dist/*"
--exclude "build/*"
```

#### RClone Mount Configuration
```yaml
# Optimal settings discovered
--vfs-cache-mode writes      # Cache writes only
--vfs-cache-max-size 500M   # Limit cache size
--dir-cache-time 1m         # Fast directory updates
--poll-interval 15s         # Quick change detection
```

### 6. Security Considerations

#### Read-Only Mounts
* Source code mounted as read-only in containers
* Prevents container modifications to source
* Write operations only for generated files

#### Network Isolation
* Containers only accessible through Traefik
* No direct port exposure
* Internal `traefik-network` for all services

### 7. Production Infrastructure

#### DDNS Integration
* Namecheap Dynamic DNS updater
* Updates every 10 minutes via cron
* Handles IP changes automatically

#### Health Checks
```yaml
healthcheck:
  test: ["CMD", "test", "-f", "/app/.container-ready"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s
```

### 8. Resource Optimization

#### Storage Comparison
| Component | Traditional | S3-Based | Savings |
|-----------|------------|----------|---------|
| Per Workspace | 500MB | 5MB | 99% |
| 10 Projects | 5GB | 50MB | 99% |
| Backup Size | 5GB | 50MB | 99% |

#### Container Startup Optimization
* Layer caching in Docker builds
* npm ci with package-lock.json (faster than npm install)
* Pre-built base images for common dependencies

### 9. Monitoring and Management

#### Web Dashboard Features
* Real-time container status
* Start/stop/restart controls
* Container log viewing
* WebSocket live updates
* System health monitoring

#### REST API Endpoints
```
GET /api/status         - System configuration
GET /api/projects       - List all projects
GET /api/logs          - Monitor logs
GET /api/project/:name/logs - Project logs
```

### 10. Disaster Recovery

#### Backup Strategy
* Automated hourly backups (configurable)
* Multiple destination support
* Dry-run mode for testing
* Point-in-time restoration

#### Restore Capabilities
```bash
# Full restore
./scripts/restore-minio.sh --mode mirror

# Selective restore  
./scripts/restore-minio.sh --mode merge

# Point-in-time
./scripts/restore-minio.sh --point-in-time "2024-01-15 10:30:00"
```

---
