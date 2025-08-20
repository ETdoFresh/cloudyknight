# CloudyKnight - Workspace Infrastructure

A Docker-based workspace orchestration system with S3 storage backend and automatic container management.

## Overview

CloudyKnight provides automated containerization and management of development workspaces with:
- S3/MinIO storage backend (mounted at `/workspaces`)
- Automatic project detection and containerization
- Traefik reverse proxy with path-based routing
- Ephemeral containers with fresh dependencies
- Multi-destination backup support

## Quick Start

1. Ensure MinIO is running and workspaces are mounted:
   ```bash
   ./remount-workspaces.sh
   ```

2. Check mounted workspaces:
   ```bash
   ls -la /workspaces
   ```

## Architecture

See [NEW_IMPLEMENTATION.md](NEW_IMPLEMENTATION.md) for detailed architecture documentation and design decisions.

## Key Features

- **99% Storage Reduction**: Only source code in S3, no dependencies
- **Ephemeral Containers**: Fresh `node_modules` in each container
- **Automatic Detection**: Identifies Node.js, Python, PHP, Go, Ruby projects
- **Path-Based Routing**: Clean URLs via Traefik reverse proxy
- **Real-time Monitoring**: WebSocket-based dashboard

## Current Status

🚧 **Under Development** - Fresh implementation in progress based on lessons learned from previous system.