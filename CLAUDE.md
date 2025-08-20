# CloudyKnight Project Instructions

## Before Starting Any Task

**IMPORTANT**: Before beginning work on any new task, always review the `MEMORY.md` file to get caught up on what's been happening in the project. This file contains:

- Recent implementation discoveries
- Solutions to common problems
- Project architecture details
- Configuration patterns that work
- Known issues and their fixes

To review the memory file, use:
```
Read MEMORY.md
```

## Project Overview

CloudyKnight is a multi-workspace web application served through Traefik reverse proxy. Each workspace is a self-contained Docker container running a Vite development server.

## Key Workspaces

- **Admin Panel** (`/workspaces/admin/`): Central management interface
- **Clock Workspace** (`/workspaces/clock/`): Interactive clock with timer, stopwatch, and world clocks
- **Additional workspaces**: Can be added following the same pattern

## Development Guidelines

### 1. Workspace Development
- Each workspace runs in its own Docker container
- Uses Vite for development with hot module replacement
- Served through Traefik at `https://workspaces.etdofresh.com/[workspace-name]/`

### 2. Configuration Management
- Vite config must have correct `base` path matching the URL subpath
- Docker Compose labels handle Traefik routing
- Do NOT use stripprefix middleware when Vite base is configured

### 3. Theme Synchronization
- All workspaces use `workspace-theme` localStorage key
- Values: 'dark' or 'light'
- Consistent color variables across workspaces

### 4. Testing Changes
- Use Docker logs to debug container issues: `docker logs [container-name]`
- Check browser DevTools Network tab for WebSocket connections (HMR)
- Test with simple CSS changes first (e.g., button colors)

## Common Commands

### Workspace Management
```bash
# Restart a workspace container
cd /workspaces/[workspace-name]/
docker compose down && docker compose up -d

# View container logs
docker logs [workspace-name] --tail 50 -f

# Check container status
docker ps | grep [workspace-name]
```

### Development
```bash
# Install dependencies (runs automatically in container)
npm install

# Run development server (default container command)
npm run dev
```

## Updating Project Memory

When you discover new implementation details or solve problems, update the MEMORY.md file:

1. Use the `/update-memory` command, or
2. Manually edit MEMORY.md following its existing structure

## File Organization

```
/home/claude/cloudyknight/
├── workspaces/          # All workspace directories
├── traefik/            # Reverse proxy configuration
├── .claude/            # Claude-specific commands
├── MEMORY.md           # Project knowledge base
└── CLAUDE.md           # This file
```

## Important Notes

- Always check MEMORY.md for known issues before debugging
- Maintain consistent code style within each workspace
- Document significant discoveries in MEMORY.md
- Use the shared localStorage key for theme synchronization
- Test hot reload after configuration changes

---

*Last Updated: 2024-01-20*