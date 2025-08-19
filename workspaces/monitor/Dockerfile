FROM node:20-alpine

# Install docker and docker-compose
RUN apk add --no-cache docker docker-compose

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy application files
COPY src/ ./src/

# Create log directory
RUN mkdir -p /var/log

# Copy public files for dashboard
COPY public/ ./public/

# Note: Running as root is required for Docker socket access
# In production, consider using Docker group permissions

# Start the monitor
CMD ["node", "src/index.js"]