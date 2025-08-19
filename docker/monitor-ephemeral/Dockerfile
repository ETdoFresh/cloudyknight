# Monitor-specific ephemeral runtime with Docker support
FROM node:20-alpine

# Install Docker CLI for managing containers
RUN apk add --no-cache docker-cli docker-compose

WORKDIR /app

# Create init script
COPY init-monitor.sh /init.sh
RUN chmod +x /init.sh

# The init script will:
# 1. Copy source from mounted volume
# 2. Install dependencies in container
# 3. Start the monitor application
ENTRYPOINT ["/init.sh"]
CMD ["node", "src/index.js"]