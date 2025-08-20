# CloudyKnight Project Memory

## About This Memory System

This file serves as a hierarchical knowledge base for the CloudyKnight project. It contains implementation details, solutions to problems, and technical discoveries made during development. The file is structured to be efficiently readable by AI assistants - they can read just this explanation and the table of contents below to understand what information is available, then jump to specific sections as needed rather than reading the entire file.

### How to Use This File
1. **For AI Assistants**: Read the table of contents first to understand available topics, then read only the relevant sections for your current task
2. **For Developers**: Add new discoveries under appropriate sections with timestamps
3. **For Debugging**: Check relevant sections for known issues and solutions

---

## Table of Contents

1. [Workspace Architecture](#workspace-architecture)
   - [Clock Workspace](#clock-workspace)
   - [Admin Workspace](#admin-workspace)
   - [Workspace Structure](#workspace-structure)

2. [Vite Configuration](#vite-configuration)
   - [Subpath Routing Configuration](#subpath-routing-configuration)
   - [Hot Module Replacement (HMR)](#hot-module-replacement-hmr)
   - [Common Vite Issues](#common-vite-issues)

3. [Traefik & Routing](#traefik--routing)
   - [Docker Compose Labels](#docker-compose-labels)
   - [Middleware Configuration](#middleware-configuration)
   - [Path Handling](#path-handling)

4. [Docker Configuration](#docker-configuration)
   - [Development Containers](#development-containers)
   - [Volume Management](#volume-management)
   - [Container Best Practices](#container-best-practices)

5. [UI Implementation](#ui-implementation)
   - [Dark Mode System](#dark-mode-system)
   - [SVG Clock Implementation](#svg-clock-implementation)
   - [Responsive Design](#responsive-design)

6. [Debugging & Troubleshooting](#debugging--troubleshooting)
   - [HMR Troubleshooting](#hmr-troubleshooting)
   - [Path Resolution Issues](#path-resolution-issues)
   - [Container Issues](#container-issues)

7. [File Organization](#file-organization)
   - [Project Structure](#project-structure)
   - [Naming Conventions](#naming-conventions)

8. [S3/MinIO Storage Integration](#s3minio-storage-integration)
   - [S3 Mount Configuration](#s3-mount-configuration)
   - [MinIO Setup](#minio-setup)
   - [Systemd Service](#systemd-service)
   - [Mount Management](#mount-management)

---

## Workspace Architecture

### Clock Workspace
<!-- Added: 2024-01-20 -->
- **Location**: `/workspaces/clock/`
- **URL**: `https://workspaces.etdofresh.com/clock/`
- **Port**: 5173 (Vite dev server)
- **Docker Image**: Node.js 20 Alpine
- **Purpose**: Interactive clock with timer, stopwatch, and world clocks

### Admin Workspace
<!-- Added: 2024-01-20 -->
- **Location**: `/workspaces/admin/`
- **URL**: `https://workspaces.etdofresh.com/admin/`
- **Port**: 5173 (Vite dev server)
- **Purpose**: Admin panel for managing all workspaces
- **Features**: Workspace CRUD operations, status management, theme synchronization

### Investment Workspace
<!-- Added: 2025-08-20 -->
- **Location**: `/home/claude/cloudyknight/workspaces/investment/`
- **URL**: `https://workspaces.etdofresh.com/investment/`
- **Port**: 5173 (Vite dev server)
- **Docker Image**: Node.js 20 Alpine
- **Purpose**: Investment tracking and portfolio management

### File Browser Workspace
<!-- Added: 2025-08-20 -->
- **Location**: `/home/claude/cloudyknight/workspaces/file-browser/`
- **URL**: `https://workspaces.etdofresh.com/file-browser/`
- **Port**: 5173 (Vite dev server)
- **Docker Image**: Node.js 20 Alpine
- **Purpose**: Browse and manage workspace files and directories
- **Migration Notes**: Migrated from standalone HTML/JS at `/home/claude/claude-workspace/frontend/`

### Workspace Structure
Each workspace is self-contained with:
- `docker-compose.yml` - Container configuration
- `vite.config.js` - Build tool configuration
- `package.json` - Dependencies
- `index.html` - Entry point
- JavaScript and CSS files

---

## Vite Configuration

### Subpath Routing Configuration
<!-- Critical for workspace routing -->
When serving through Traefik with a subpath (e.g., `/clock/`):

```javascript
// vite.config.js
export default defineConfig({
  base: '/clock/',  // MUST match the URL subpath
  server: {
    host: '0.0.0.0',
    port: 5173,
    hmr: {
      clientPort: 443,
      protocol: 'wss',
      host: 'workspaces.etdofresh.com',
      path: '/clock/@vite'  // WebSocket path for HMR
    },
    watch: {
      usePolling: true,  // Required for Docker
      interval: 1000
    },
    allowedHosts: [
      'localhost',
      'clock',
      'workspaces.etdofresh.com',
      '.etdofresh.com'
    ]
  }
});
```

**Critical Points**:
- `base` must be absolute path with trailing slash
- `hmr.path` should include the subpath
- `allowedHosts` must include the domain

### Hot Module Replacement (HMR)
For HMR to work through reverse proxy:
1. Set `base: '/subpath/'` in Vite config
2. Configure `hmr.path: '/subpath/@vite'`
3. Do NOT strip prefix in Traefik when base is set

### Common Vite Issues
- **Issue**: Constant page refreshing
  - **Cause**: Failed WebSocket connections
  - **Solution**: Correct HMR configuration or disable HMR

- **Issue**: Assets 404
  - **Cause**: Incorrect base path
  - **Solution**: Ensure base matches URL subpath

- **Issue**: Port binding issues
  - **Cause**: Missing explicit port configuration in vite.config.js
  - **Solution**: Always specify `port: 5173` in server config

- **Issue**: Vite auto-selects different port
  - **Cause**: npm process occupies intended port
  - **Solution**: Use default Vite port 5173 to avoid conflicts

---

## Traefik & Routing

### Docker Compose Labels
```yaml
labels:
  - traefik.enable=true
  - traefik.docker.network=traefik-network
  
  # Main router
  - traefik.http.routers.clock.rule=Host(`${DOMAIN}`) && PathPrefix(`/clock`)
  - traefik.http.routers.clock.entrypoints=websecure
  - traefik.http.routers.clock.tls=true
  - traefik.http.routers.clock.tls.certresolver=letsencrypt
  - traefik.http.services.clock.loadbalancer.server.port=5173
  
  # Trailing slash redirect
  - traefik.http.middlewares.clock-redirect.redirectregex.regex=^https?://([^/]+)/clock$$
  - traefik.http.middlewares.clock-redirect.redirectregex.replacement=https://$$1/clock/
  
  # NO stripprefix when Vite base is set!
  - traefik.http.routers.clock.middlewares=clock-redirect
```

### Middleware Configuration
- **Redirect Middleware**: Adds trailing slash for proper relative paths
- **Stripprefix**: Do NOT use when Vite `base` is configured
- **Priority**: Higher numbers = higher priority

### Path Handling
- With `base: '/clock/'` in Vite: Keep full path, don't strip
- Without base in Vite: Strip prefix with middleware
- Always redirect to trailing slash for consistency

### Path Redirects
<!-- Added: 2025-08-20 -->
To redirect paths (e.g., `/www` to `/`), add a separate router with redirect middleware:

```yaml
# Redirect /www to root
- traefik.http.routers.www-redirect.rule=Host(`${DOMAIN}`) && (Path(`/www`) || PathPrefix(`/www/`))
- traefik.http.routers.www-redirect.priority=20
- traefik.http.middlewares.www-to-root.redirectregex.regex=^https?://([^/]+)/www/?(.*)$$
- traefik.http.middlewares.www-to-root.redirectregex.replacement=https://$$1/$$2
- traefik.http.middlewares.www-to-root.redirectregex.permanent=true
- traefik.http.routers.www-redirect.middlewares=www-to-root
```

---

## Docker Configuration

### Development Containers
```yaml
services:
  clock:
    image: node:20-alpine
    container_name: clock
    working_dir: /app
    volumes:
      - ./:/app
      - /app/node_modules  # Anonymous volume
    command: sh -c "npm install && npm run dev"
    environment:
      - NODE_ENV=development
      - VITE_HOST=0.0.0.0
    networks:
      - traefik-network
    restart: unless-stopped
```

### Volume Management
- Mount source code: `./:/app`
- Use anonymous volume for node_modules to prevent conflicts
- This prevents host node_modules from overriding container's

### Container Best Practices
- Use Alpine images for smaller size
- Set working directory explicitly
- Run npm install in container startup
- Configure restart policy

---

## UI Implementation

### Dark Mode System
<!-- Synchronized across all workspaces -->

**localStorage Key**: `workspace-theme` (values: 'dark' or 'light')

```javascript
// Save theme
localStorage.setItem('workspace-theme', isDarkMode ? 'dark' : 'light');

// Load theme
const savedTheme = localStorage.getItem('workspace-theme');
const isDarkMode = savedTheme === 'dark' || 
  (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
```

**CSS Variables**:
```css
:root {
  --bg-primary: #f5f5f5;
  --bg-secondary: #ffffff;
  --text-primary: #212529;
  --accent-color: #007bff;
}

body.dark-mode {
  --bg-primary: #1a202c;
  --bg-secondary: #374151;
  --text-primary: #f7fafc;
  --accent-color: #667eea;
}
```

### SVG Clock Implementation
<!-- Analog clock with rotating hands -->

**Key Concepts**:
- Use `transform` attribute with explicit center: `rotate(angle centerX centerY)`
- Calculate angles: hours × 30°, minutes × 6°, seconds × 6°
- No offset needed when hands point up initially

```javascript
const hourAngle = (hours * 30) + (minutes * 0.5);
const minuteAngle = (minutes * 6) + (seconds * 0.1);
const secondAngle = seconds * 6;

element.setAttribute('transform', `rotate(${angle} 100 100)`);
```

### Responsive Design
- Use CSS Grid for layouts
- Media queries at 768px breakpoint
- Scale fonts and spacing for mobile

---

## Debugging & Troubleshooting

### HMR Troubleshooting
1. **Check WebSocket connection**: Browser DevTools → Network → WS tab
2. **Verify Vite logs**: `docker logs [container] --tail 20`
3. **Test with CSS change**: Change button color as simple test
4. **Common fixes**:
   - Ensure correct `base` and `hmr.path` in vite.config.js
   - Check Traefik isn't stripping needed prefixes
   - Verify allowedHosts includes your domain

### Path Resolution Issues
- **Problem**: Assets return 404
- **Check**: Is Vite base path correct?
- **Check**: Is Traefik stripping prefixes?
- **Solution**: Align Vite base with URL structure

### Container Issues
- **Container restarts**: Check logs with `docker logs [container]`
- **Module not found**: Delete node_modules and rebuild
- **Permission issues**: Check volume mount permissions
- **Mount namespace errors**: After moving directories, fully recreate containers with `docker-compose down && docker-compose up -d`
- **"Current working directory outside of container mount namespace"**: Container references moved/deleted paths - restart required

### Container Naming Conflicts
<!-- Added: 2025-08-20 -->
**Issue**: Duplicate Traefik routers cause routing failures
**Solution**: Use consistent naming patterns:
- Single HTTPS router per workspace
- Container name matches workspace name (e.g., `investment` not `workspace-investment`)
- Router priority: 10 for specific paths, 1 for catch-all

---

## File Organization

### Project Structure
```
/home/claude/cloudyknight/
├── workspaces/
│   ├── clock/
│   │   ├── docker-compose.yml
│   │   ├── vite.config.js
│   │   ├── package.json
│   │   ├── index.html
│   │   ├── main.js
│   │   └── style.css
│   ├── admin/
│   │   └── [similar structure]
│   └── [other workspaces]/
├── traefik/
│   └── docker-compose.yml
├── .claude/
│   └── commands/
│       └── update-memory.md
└── MEMORY.md (this file)
```

### Naming Conventions
- Workspaces: lowercase, hyphenated (e.g., `clock`, `admin-panel`)
- Docker containers: Same as workspace name
- Routes: Match workspace name with leading slash
- localStorage keys: hyphenated (e.g., `workspace-theme`)

---

## Recent Discoveries
<!-- Add new findings here with date stamps -->

### 2024-01-20: Vite Base Path Critical Finding
When using `base: '/clock/'` in Vite config, you MUST NOT use Traefik's stripprefix middleware. The base path tells Vite to expect requests at `/clock/*`, so stripping the prefix breaks asset loading.

### 2024-01-20: HMR Path Configuration
The HMR WebSocket path should be set to `/clock/@vite` (matching the subpath) for proper hot reload functionality through Traefik.

### 2025-08-20: S3/MinIO Mount Configuration
Successfully configured s3fs-fuse to mount MinIO buckets as filesystem. The mount provides cloud storage backend for workspaces with automatic persistence and versioning capabilities.

### 2025-08-20: Workspace Migration Pattern
<!-- Added: 2025-08-20 -->
When migrating workspaces from S3-mounted to local directories:
1. Copy all files with `sudo cp -r /workspaces/[name]/* ./workspaces/[name]/`
2. Fix ownership: `sudo chown -R claude:claude ./workspaces/[name]/`
3. Update vite.config.js with base path and HMR settings
4. Match docker-compose.yml pattern from clock workspace
5. Remove stripprefix middleware when base path is set
6. Restart containers to clear mount namespace issues

### 2025-08-20: Docker Compose Standards
<!-- Added: 2025-08-20 -->
Standard workspace docker-compose.yml pattern:
- No `version` declaration needed
- Container name matches workspace name
- Include `/app/node_modules` anonymous volume
- Use `NODE_ENV=development` for dev containers
- Single HTTPS router with priority 10
- Trailing slash redirect middleware only

---

## S3/MinIO Storage Integration
<!-- Added: 2025-08-20 -->

### S3 Mount Configuration
The project now supports mounting MinIO S3-compatible storage as a filesystem using s3fs-fuse.

**Installation**:
```bash
sudo apt-get install -y s3fs
```

**Mount Command**:
```bash
sudo s3fs workspaces /workspaces \
  -o passwd_file=/home/claude/.passwd-s3fs \
  -o url=https://workspaces.etdofresh.com:9000 \
  -o use_path_request_style \
  -o allow_other \
  -o umask=0022 \
  -o no_check_certificate \
  -o nonempty
```

**Key Parameters**:
- `use_path_request_style`: Required for MinIO compatibility
- `no_check_certificate`: Bypasses SSL verification for self-signed certificates
- `allow_other`: Permits access by other users
- `nonempty`: Allows mounting on non-empty directories

### MinIO Setup
**Endpoint**: `https://workspaces.etdofresh.com:9000`
**Bucket**: `workspaces`
**Credentials**: Stored in `/home/claude/.passwd-s3fs` (format: `ACCESS_KEY:SECRET_KEY`)

**Important**: Set file permissions to 600 for security:
```bash
chmod 600 /home/claude/.passwd-s3fs
```

### Systemd Service
Automatic mounting on boot via systemd service at `/etc/systemd/system/s3-workspaces.service`:

```ini
[Unit]
Description=Mount MinIO S3 bucket for CloudyKnight workspaces
After=network-online.target
Wants=network-online.target

[Service]
Type=forking
User=root
ExecStart=/usr/bin/s3fs workspaces /workspaces -o passwd_file=/home/claude/.passwd-s3fs -o url=https://workspaces.etdofresh.com:9000 -o use_path_request_style -o allow_other -o umask=0022 -o no_check_certificate
ExecStop=/bin/umount /workspaces
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**Service Management**:
```bash
# Enable auto-start
sudo systemctl enable s3-workspaces.service

# Check status
sudo systemctl status s3-workspaces.service

# Manual restart
sudo systemctl restart s3-workspaces.service
```

### Mount Management

**Directory Structure**:
- `/home/claude/cloudyknight/workspaces/`: Local workspaces (unchanged)
- `/workspaces/`: S3-mounted workspaces (MinIO storage)
- `/workspaces-root-backup/`: Backup of original root workspaces
- `/home/claude/cloudyknight/workspaces-backup/`: Backup of local workspaces

**Helper Scripts**:
- `/home/claude/cloudyknight/mount-s3-workspaces.sh`: Manual mount/unmount script with safety checks
- Includes automatic backup creation before mounting
- Provides colored output for better user feedback

**Common Commands**:
```bash
# Check mount status
df -h /workspaces
mountpoint /workspaces

# List S3 contents
ls -la /workspaces/

# Unmount manually
sudo umount /workspaces

# Test write access
sudo sh -c 'echo "test" > /workspaces/test.txt'
```

**Troubleshooting**:
- **Permission denied**: S3 mounts may require sudo for write operations
- **Mount fails**: Check MinIO credentials and network connectivity
- **"Directory not empty" error**: Use `-o nonempty` flag or clear directory first
- **SSL certificate issues**: Ensure `-o no_check_certificate` for self-signed certs

---

## Workspace Migration Patterns
<!-- Added: 2025-08-20 -->

### Migrating Standalone HTML/JS/CSS to CloudyKnight Workspace

When migrating a standalone web application to a CloudyKnight workspace, follow these steps:

1. **Create workspace directory**: `/home/claude/cloudyknight/workspaces/[workspace-name]/`

2. **Required files**:
   - `index.html` - Entry point (reference assets with relative paths like `./main.js`)
   - `main.js` - JavaScript entry point (rename from other names if needed)
   - `style.css` - Styles
   - `package.json` - Minimal with just Vite as devDependency
   - `vite.config.js` - With correct base path and HMR configuration
   - `docker-compose.yml` - Container and Traefik routing configuration

3. **Theme synchronization updates**:
   - Update localStorage key from custom names to `workspace-theme`
   - Update CSS class from custom names to `dark-mode`
   - Include system preference detection fallback

4. **Asset path updates**:
   - Change absolute paths to relative (e.g., `/js/file.js` to `./main.js`)
   - Vite will handle base path injection automatically

5. **Docker Compose pattern**:
   ```yaml
   services:
     [workspace-name]:
       image: node:20-alpine
       container_name: [workspace-name]
       working_dir: /app
       volumes:
         - ./:/app
         - /app/node_modules  # Anonymous volume prevents conflicts
       command: sh -c "npm install && npm run dev"
   ```

6. **Workspace registration**:
   - Add entry to `/home/claude/cloudyknight/workspaces/admin/workspaces.json`
   - Include: id, slug, name, icon, description, status, type, created timestamp

### Key Migration Insights
- API calls with relative URLs (empty `serverUrl`) work correctly through Traefik
- The `workspace-theme` localStorage key enables cross-workspace theme sync
- Using `main.js` as entry point follows Vite conventions
- Anonymous volume for node_modules prevents host/container dependency conflicts

---

## API Command Execution System
<!-- Added: 2025-08-20 -->

### Command Execution Endpoint

The CloudyKnight API now includes a command execution endpoint that allows workspaces to run shell commands within their container environments.

**Endpoint**: `POST /api/v1/workspaces/:slug/execute`

**Request Body**:
```json
{
  "command": "ls -la",
  "cwd": "."  // Optional, defaults to workspace root
}
```

**Security Features**:
- Path validation ensures commands only run within workspace directory
- Dangerous command filtering (blocks rm -rf /, shutdown, etc.)
- 30-second execution timeout
- 10MB output buffer limit
- Workspace existence validation

**Implementation Location**: `/home/claude/cloudyknight/workspaces/api/v1/server.js:562-650`

### File-Browser Command Integration

The file-browser workspace was refactored to use the command execution API instead of dedicated file endpoints:

**File Operations via Commands**:
- **List files**: `ls -la` (BusyBox compatible, no --time-style)
- **Create file**: `touch` or `echo 'content' > file`
- **Create folder**: `mkdir -p`
- **Delete**: `rm -f` (files) or `rm -rf` (directories)
- **Rename/Move**: `mv`
- **Read file**: `cat`
- **Upload**: `base64 -d` for binary, heredoc for text

**BusyBox Compatibility**:
Alpine Linux containers use BusyBox utilities with limited options compared to GNU coreutils:
- No `--time-style` for `ls`
- Different date format in output
- Requires adjusted parsing regex for file listings

**Parser Implementation**:
```javascript
// Parse BusyBox ls -la output
// Format: drwxr-xr-x    2 1000     1000          4096 Jan 20 10:30 dirname
const parts = line.trim().split(/\s+/);
const permissions = parts[0];
const size = parseInt(parts[4]) || 0;
const dateTimeParts = parts.slice(5, 8);  // "Jan 20 10:30"
const name = parts.slice(8).join(' ');    // Handle spaces in names
```

### Node.js Watch Mode Issues

**Problem**: Node's `--watch` mode in Docker containers may have delayed file change detection

**Symptoms**:
- Changes to server.js not immediately triggering restart
- 3-5 second delay for file system events through Docker volumes

**Solutions**:
1. Manual container restart: `docker-compose restart`
2. Touch file to trigger: `touch server.js`
3. Watch mode eventually detects changes (just delayed)

**Root Cause**: Docker volume mount file system event propagation latency

---

## File-Browser Workspace Implementation
<!-- Added: 2025-08-20 -->

### Terminal Integration

The file-browser includes an integrated terminal for command execution:

**Features**:
- Modal terminal interface with command history
- Keyboard shortcuts: `Ctrl/Cmd + K` to open
- Arrow keys for history navigation
- Auto-refresh file list after modifying commands
- Path-aware execution (respects current directory)

**UI Elements**:
- Terminal button in toolbar
- Command output display with green text on black
- Current workspace and path indicator
- Enter to execute, Escape to close

**Implementation Details**:
- Command history stored in localStorage (last 100 commands)
- Special handling for `cd` commands to update file browser path
- File-modifying commands trigger automatic refresh

### API Response Handling

**Workspace List Response**:
```javascript
// API returns object with workspaces array
const data = await response.json();
this.workspaces = Array.isArray(data) ? data : (data.workspaces || []);
```

The API returns workspace data wrapped in an object with metadata, not as a raw array.

### Benefits of Command-Based Architecture

1. **Simplicity**: No need for separate file operation endpoints
2. **Flexibility**: Can use any shell command available in container
3. **Consistency**: Leverages existing Unix tools
4. **Maintainability**: Single endpoint to maintain instead of many
5. **Power**: Full shell capabilities for advanced operations

---

*End of Memory File - Last Updated: 2025-08-20 (Command Execution API and File-Browser refactoring)*