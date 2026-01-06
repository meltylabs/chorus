#!/bin/bash

# Script to delete the OpenRouter Chorus database
# This will remove all data including workspaces, sessions, and settings

# Get the instance name from the directory
INSTANCE_NAME=$(basename "$(pwd)")

# Sanitize the instance name to be filesystem-safe (same as setup-instance.sh)
SAFE_INSTANCE_NAME=$(echo "$INSTANCE_NAME" | sed 's/[^a-zA-Z0-9_-]/_/g')

# Construct the database path
DB_PATH="$HOME/Library/Application Support/ai.openrouter.desktop.dev.$SAFE_INSTANCE_NAME/chats.db"

# Check if the database exists
if [ -f "$DB_PATH" ]; then
    echo "Found database at: $DB_PATH"

    # Prompt for confirmation
    read -p "Are you sure you want to delete the database? This will remove all data. (y/N): " -n 1 -r
    echo    # Move to a new line

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm "$DB_PATH"
        echo "Database deleted successfully."
    else
        echo "Operation cancelled."
    fi
else
    echo "No database found at: $DB_PATH"
    echo "The database may not exist yet or might be in a different location."
fi
