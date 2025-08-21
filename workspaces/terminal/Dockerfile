# Ubuntu sandbox with ttyd terminal
FROM ubuntu:22.04

# Install essential packages
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    vim \
    nano \
    htop \
    build-essential \
    python3 \
    python3-pip \
    nodejs \
    npm \
    sudo \
    locales \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Generate locale
RUN locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

# Install ttyd (web terminal)
RUN wget https://github.com/tsl0922/ttyd/releases/download/1.7.4/ttyd.x86_64 -O /usr/local/bin/ttyd \
    && chmod +x /usr/local/bin/ttyd

# Create a non-root user with sudo access
RUN useradd -m -s /bin/bash developer \
    && echo "developer:developer" | chpasswd \
    && usermod -aG sudo developer \
    && echo "developer ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Set working directory
WORKDIR /workspace

# Create startup script
RUN echo '#!/bin/bash\n\
echo "Welcome to CloudyKnight Terminal Sandbox"\n\
echo "Workspace: $WORKSPACE_NAME"\n\
echo "----------------------------------------"\n\
cd /workspace\n\
exec /bin/bash\n' > /usr/local/bin/start-shell.sh \
    && chmod +x /usr/local/bin/start-shell.sh

# Expose ttyd port
EXPOSE 7681

# Switch to non-root user
USER developer

# Start ttyd with the shell script
CMD ["ttyd", "-p", "7681", "-W", "/usr/local/bin/start-shell.sh"]