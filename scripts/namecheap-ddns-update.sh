#!/bin/bash

# Namecheap Dynamic DNS Updater
# Updates your domain's IP address using Namecheap's DDNS API

# Configuration - Replace these with your actual values
DOMAIN="etdofresh.com"
HOST="workspaces"  # Use @ for root domain, or subdomain like "workspaces"
DDNS_PASSWORD="dd839f485cf54ac8af8fd0c2255efa18"   # Get this from Namecheap's Advanced DNS settings

# Don't modify below unless needed
UPDATE_URL="https://dynamicdns.park-your-domain.com/update"

# Get current public IP with timeout and fallback services
echo "Getting current public IP..."
CURRENT_IP=$(curl -s --max-time 5 https://api.ipify.org)

# Fallback to alternative services if primary fails
if [ -z "$CURRENT_IP" ]; then
    echo "Primary IP service failed, trying fallback..."
    CURRENT_IP=$(curl -s --max-time 5 https://icanhazip.com)
fi

if [ -z "$CURRENT_IP" ]; then
    echo "Second fallback..."
    CURRENT_IP=$(curl -s --max-time 5 https://ifconfig.me)
fi

if [ -z "$CURRENT_IP" ]; then
    echo "Error: Could not determine public IP from any service"
    exit 1
fi

echo "Current public IP: $CURRENT_IP"

# Build the update URL
if [ "$HOST" = "@" ]; then
    FULL_URL="${UPDATE_URL}?host=@&domain=${DOMAIN}&password=${DDNS_PASSWORD}&ip=${CURRENT_IP}"
else
    FULL_URL="${UPDATE_URL}?host=${HOST}&domain=${DOMAIN}&password=${DDNS_PASSWORD}&ip=${CURRENT_IP}"
fi

# Send update request with timeout
echo "Updating Namecheap DNS..."
RESPONSE=$(curl -s --max-time 10 "$FULL_URL")

# Check response
if echo "$RESPONSE" | grep -q "<ErrCount>0</ErrCount>"; then
    echo "✓ Successfully updated ${HOST}.${DOMAIN} to ${CURRENT_IP}"
    
    # Log the update (create log directory if needed)
    LOG_DIR="${HOME}/cloudyknight/logs"
    mkdir -p "$LOG_DIR"
    echo "[$(date)] Updated ${HOST}.${DOMAIN} to ${CURRENT_IP}" >> "$LOG_DIR/namecheap-ddns.log"
else
    echo "✗ Error updating DNS:"
    echo "$RESPONSE"
    exit 1
fi