# Workspace Monitor Service

Automatic Docker container management and Traefik routing for workspace projects.

## Overview

The Workspace Monitor service automatically:
- Scans the `/workspaces` directory for projects
- Detects project types (Node.js, Python, PHP, Go, Ruby, static HTML)
- Generates appropriate `docker-compose.yml` files
- Manages Docker containers for each project
- Configures Traefik routing with proper path prefixes

## Routing Rules

- **`www` directory** → Served at root domain (`etdofresh-dev.duckdns.org`)
- **Other directories** → Served at subpaths (`etdofresh-dev.duckdns.org/projectname`)

For example:
- `/workspaces/www` → `https://etdofresh-dev.duckdns.org/`
- `/workspaces/blog` → `https://etdofresh-dev.duckdns.org/blog`
- `/workspaces/api` → `https://etdofresh-dev.duckdns.org/api`

## Features

### Automatic Project Detection

The monitor detects projects by looking for:
- `package.json` (Node.js projects)
- `index.html` (Static websites)
- `index.php` (PHP applications)
- `requirements.txt` or `setup.py` (Python projects)
- `go.mod` (Go projects)
- `Gemfile` (Ruby projects)

### Docker Compose Generation

If a project doesn't have a `docker-compose.yml`, the monitor will:
1. Generate an appropriate configuration
2. Set up Traefik labels for routing
3. Configure the correct port and startup command

### Container Management

The monitor:
- Starts containers for new projects
- Restarts containers when configuration changes
- Monitors container health
- Handles container logs

## Installation

### Local Development

```bash
cd /home/claude/cloudyknight/workspaces/monitor
npm install
npm start
```

### Docker Deployment

```bash
cd /home/claude/cloudyknight/workspaces/monitor
docker-compose up -d
```

## Configuration

Environment variables (set in docker-compose.yml):

| Variable | Description | Default |
|----------|-------------|---------|
| `WORKSPACE_PATH` | Path to monitor | `/workspaces` |
| `DOMAIN` | Base domain for routing | `etdofresh-dev.duckdns.org` |
| `NETWORK` | Docker network name | `traefik-network` |
| `LOG_LEVEL` | Logging verbosity | `info` |

## Project Structure

```
monitor/
├── src/
│   ├── index.js           # Main entry point
│   ├── monitor.js          # Workspace monitoring logic
│   ├── project-detector.js # Project type detection
│   ├── compose-generator.js # Docker Compose generation
│   ├── docker-manager.js   # Docker container management
│   └── logger.js           # Logging utility
├── Dockerfile              # Container image definition
├── docker-compose.yml      # Service configuration
├── package.json            # Node.js dependencies
└── README.md              # This file
```

## How It Works

1. **Scanning Phase**
   - Monitors `/workspaces` directory
   - Detects new projects or changes
   - Identifies project type and requirements

2. **Configuration Phase**
   - Generates or updates `docker-compose.yml`
   - Sets up Traefik routing rules
   - Configures path stripping for subpath projects

3. **Deployment Phase**
   - Builds/pulls required Docker images
   - Starts containers with proper networking
   - Monitors container health

## Supported Project Types

### Node.js
- Detects: `package.json`
- Frameworks: React, Vue, Next.js, Express
- Default port: 3000

### Static HTML
- Detects: `index.html`
- Server: http-server
- Default port: 3000

### PHP
- Detects: `index.php`
- Server: Apache with PHP
- Default port: 80

### Python
- Detects: `requirements.txt` or `setup.py`
- Default port: 8000

### Go
- Detects: `go.mod`
- Default port: 8080

### Ruby
- Detects: `Gemfile`
- Framework: Rails
- Default port: 3000

## Logs

Monitor logs are available at:
- Container logs: `docker logs workspace-monitor`
- File logs: `./logs/workspace-monitor.log`

## Troubleshooting

### Container Not Starting

Check the monitor logs:
```bash
docker logs workspace-monitor -f
```

### Project Not Detected

Ensure your project has one of the detection files:
- `package.json` for Node.js
- `index.html` for static sites
- Other framework-specific files

### Routing Issues

Verify Traefik labels:
```bash
docker inspect workspace-<projectname> | grep -A 20 Labels
```

### Manual Container Management

Stop a project:
```bash
cd /workspaces/<projectname>
docker-compose down
```

Restart a project:
```bash
cd /workspaces/<projectname>
docker-compose up -d
```

## Adding New Projects

Simply create a new directory in `/workspaces` with your project files. The monitor will:
1. Detect the project within 30 seconds
2. Generate a `docker-compose.yml` if needed
3. Start the container automatically
4. Configure routing at `domain.com/projectname`

## Excluding Projects

To prevent a directory from being monitored, add a `.nomonitor` file:
```bash
touch /workspaces/myproject/.nomonitor
```