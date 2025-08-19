#!/bin/bash

# Read JSON input from stdin
input=$(cat)

# Check if ccusage is available
if command -v ccusage >/dev/null 2>&1; then
    # Use ccusage statusline command for comprehensive usage data
    echo "$input" | ccusage statusline --cache --refresh-interval 5
else
    # Fallback message if ccusage is not installed
    echo "⚠️ ccusage not installed - run: npm install -g ccusage"
fi