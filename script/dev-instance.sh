#!/bin/bash

# Script to run isolated development instances of Chorus
# Usage: ./script/dev-instance.sh [instance-name]

# Get the directory containing this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# Get the parent directory (the repo root)
REPO_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
# Get just the directory name
DEFAULT_INSTANCE_NAME="$(basename "$REPO_DIR")"

# Get the instance name from the first argument, or use the repo directory name if not provided
INSTANCE_NAME="${1:-$DEFAULT_INSTANCE_NAME}"

# Sanitize the instance name to be filesystem-safe
SAFE_INSTANCE_NAME=$(echo "$INSTANCE_NAME" | sed 's/[^a-zA-Z0-9_-]/_/g')

# Create the unique identifier
IDENTIFIER="ai.openrouter.desktop.dev.$SAFE_INSTANCE_NAME"

# Calculate a unique port based on the instance name
# Use a hash of the instance name to generate a port number between 1422 and 1520
HASH=$(echo -n "$SAFE_INSTANCE_NAME" | cksum | cut -d' ' -f1)
PORT=$((1422 + (($HASH % 100) * 2)))
HMR_PORT=$(($PORT + 1))

# Check if custom icon exists for this instance
APP_SUPPORT_DIR="$HOME/Library/Application Support"
INSTANCE_DIR="$APP_SUPPORT_DIR/$IDENTIFIER"
CUSTOM_ICON="$INSTANCE_DIR/icons/icon.icns"

# Create a temporary config override file
CONFIG_OVERRIDE=$(mktemp)

# Build the config, conditionally including icon if it exists
if [ -f "$CUSTOM_ICON" ]; then
    echo "Using custom icon for instance: $INSTANCE_NAME"
    cat > "$CONFIG_OVERRIDE" <<EOF
{
  "identifier": "$IDENTIFIER",
  "productName": "Chorus Dev - $INSTANCE_NAME",
  "bundle": {
    "icon": ["$CUSTOM_ICON"]
  },
  "build": {
    "devUrl": "http://localhost:$PORT"
  }
}
EOF
else
    # Write the JSON configuration override without custom icon
    cat > "$CONFIG_OVERRIDE" <<EOF
{
  "identifier": "$IDENTIFIER",
  "productName": "Chorus Dev - $INSTANCE_NAME",
  "build": {
    "devUrl": "http://localhost:$PORT"
  }
}
EOF
fi

echo "Starting OpenRouter Chorus development instance: $INSTANCE_NAME"
echo "App identifier: $IDENTIFIER"
echo "Data directory: ~/Library/Application Support/$IDENTIFIER/"
echo "Dev server port: $PORT (HMR: $HMR_PORT)"

# Set environment variables
export CHORUS_INSTANCE_NAME="$INSTANCE_NAME"
export VITE_PORT="$PORT"
export VITE_HMR_PORT="$HMR_PORT"

# Run tauri dev with the base dev config and our override
pnpm run tauri dev --config src-tauri/tauri.dev.conf.json --config "$CONFIG_OVERRIDE"

# Clean up the temporary file when done
rm -f "$CONFIG_OVERRIDE"