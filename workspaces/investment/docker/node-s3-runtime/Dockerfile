# Multi-purpose Node.js runtime that fetches code from S3
# and installs dependencies at container startup
FROM node:20-alpine

# Install AWS CLI for S3 operations
RUN apk add --no-cache aws-cli bash

# Create app directory
WORKDIR /app

# Add initialization script
COPY init.sh /init.sh
RUN chmod +x /init.sh

# Environment variables (to be provided at runtime)
ENV S3_ENDPOINT=""
ENV S3_BUCKET=""
ENV S3_ACCESS_KEY=""
ENV S3_SECRET_KEY=""
ENV WORKSPACE_NAME=""
ENV NODE_ENV="production"

# The init script will:
# 1. Download source code from S3
# 2. Install dependencies (if package.json exists)
# 3. Start the application
ENTRYPOINT ["/init.sh"]
CMD ["npm", "start"]