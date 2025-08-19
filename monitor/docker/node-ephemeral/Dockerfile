# Node.js runtime with ephemeral node_modules
FROM node:20-alpine

WORKDIR /app

# Create init script
COPY init-ephemeral.sh /init.sh
RUN chmod +x /init.sh

# The init script will:
# 1. Copy source from mounted volume
# 2. Install dependencies in container
# 3. Start the application
ENTRYPOINT ["/init.sh"]
CMD ["npm", "start"]