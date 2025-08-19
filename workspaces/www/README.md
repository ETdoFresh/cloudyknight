# Static NPM Server with Docker & Traefik

This directory contains a Docker-based static file server using Node.js and http-server, integrated with Traefik for reverse proxy and automatic SSL.

## Directory Structure

```
workspaces/www/
├── docker-compose.yml   # Docker Compose configuration
├── package.json         # NPM dependencies
├── public/              # Static files directory
│   └── index.html      # Sample index page
└── README.md           # This file
```

## Configuration

### 1. Update Domain Name
Edit `docker-compose.yml` and replace `yourdomain.com` with your actual domain:

```yaml
- "traefik.http.routers.static-server.rule=Host(`www.yourdomain.com`) || Host(`yourdomain.com`)"
- "traefik.http.routers.static-server-secure.rule=Host(`www.yourdomain.com`) || Host(`yourdomain.com`)"
```

### 2. Add Static Files
Place all your static files (HTML, CSS, JS, images, etc.) in the `public/` directory.

## Usage

### Start the Server
```bash
cd /home/claude/cloudyknight/workspaces/www
docker-compose up -d
```

### Check Status
```bash
docker-compose ps
docker-compose logs -f static-server
```

### Stop the Server
```bash
docker-compose down
```

### Restart the Server
```bash
docker-compose restart
```

## Features

- **Automatic HTTPS**: Traefik automatically obtains SSL certificates via Let's Encrypt
- **HTTP to HTTPS Redirect**: All HTTP traffic is automatically redirected to HTTPS
- **CORS Enabled**: Cross-Origin Resource Sharing is enabled for API usage
- **No Caching**: Cache is disabled with `-c-1` flag for development
- **Lightweight**: Uses Alpine Linux-based Node.js image

## Environment

- **Node.js**: v20 (Alpine)
- **Server**: http-server
- **Port**: 3000 (internal)
- **Network**: traefik-network (external)

## Customization

### Change Port
Edit the `command` in docker-compose.yml:
```yaml
command: sh -c "npm install -g http-server && http-server public -p 8080 --cors -c-1"
```
And update the loadbalancer port:
```yaml
- "traefik.http.services.static-server.loadbalancer.server.port=8080"
```

### Enable Caching
Remove the `-c-1` flag from the command to enable default caching:
```yaml
command: sh -c "npm install -g http-server && http-server public -p 3000 --cors"
```

### Add Authentication
You can add basic authentication by adding these Traefik labels:
```yaml
- "traefik.http.middlewares.static-auth.basicauth.users=user:$$2y$$..."
- "traefik.http.routers.static-server-secure.middlewares=static-auth"
```

## Troubleshooting

### Check Container Logs
```bash
docker logs www-static-server
```

### Verify Network Connection
```bash
docker network inspect traefik-network
```

### Test Locally
```bash
docker exec -it www-static-server wget -O- http://localhost:3000
```

### Check Traefik Dashboard
Access Traefik dashboard at `http://YOUR_SERVER_IP:8080` to see routing status.