#!/bin/bash

# Chorus Data Backup Script
# This script backs up all Chorus application data including:
# - SQLite database (chats.db)
# - Settings files (settings, settings.json)
# - Authentication data (auth.dat)
# - Uploaded files (uploads directory)
# - Generated images (generated_images directory, if present)

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored messages
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Determine which instance to backup
if [ -z "$1" ]; then
    echo "Usage: $0 [prod|dev|all] [output_directory]"
    echo ""
    echo "Examples:"
    echo "  $0 prod              # Backup production instance to current directory"
    echo "  $0 dev               # Backup dev instance to current directory"
    echo "  $0 all               # Backup all instances to current directory"
    echo "  $0 prod ~/backups    # Backup production to ~/backups"
    echo ""
    echo "Available instances:"
    echo "  prod - Production instance (sh.chorus.app)"
    echo "  dev  - Development instance for current directory"
    echo "  all  - All Chorus instances"
    exit 1
fi

INSTANCE_TYPE="$1"
OUTPUT_DIR="${2:-.}"  # Default to current directory if not specified

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Get the current directory name for dev instances
CURRENT_DIR_NAME=$(basename "$(pwd)")
SAFE_INSTANCE_NAME=$(echo "$CURRENT_DIR_NAME" | sed 's/[^a-zA-Z0-9_-]/_/g')

# Generate timestamp for backup filename
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Function to backup a single instance
backup_instance() {
    local app_data_dir="$1"
    local backup_name="$2"

    if [ ! -d "$app_data_dir" ]; then
        print_warning "Directory not found: $app_data_dir"
        return 1
    fi

    print_info "Backing up: $app_data_dir"

    # Check if there's any data to backup
    if [ ! -f "$app_data_dir/chats.db" ] && [ ! -f "$app_data_dir/settings" ]; then
        print_warning "No data found in $app_data_dir (database and settings missing)"
        return 1
    fi

    # Create backup filename
    BACKUP_FILE="$OUTPUT_DIR/chorus_backup_${backup_name}_${TIMESTAMP}.zip"

    # Create a temporary directory for organizing the backup
    TEMP_DIR=$(mktemp -d)
    BACKUP_STAGING="$TEMP_DIR/chorus_backup"
    mkdir -p "$BACKUP_STAGING"

    # Copy all files to staging area
    print_info "Collecting files..."

    # Database (most important!)
    if [ -f "$app_data_dir/chats.db" ]; then
        cp "$app_data_dir/chats.db" "$BACKUP_STAGING/"
        DB_SIZE=$(du -h "$app_data_dir/chats.db" | cut -f1)
        print_info "  ✓ Database (chats.db) - $DB_SIZE"
    else
        print_warning "  ✗ Database not found"
    fi

    # Settings files
    if [ -f "$app_data_dir/settings" ]; then
        cp "$app_data_dir/settings" "$BACKUP_STAGING/"
        print_info "  ✓ Settings"
    fi

    if [ -f "$app_data_dir/settings.json" ]; then
        cp "$app_data_dir/settings.json" "$BACKUP_STAGING/"
        print_info "  ✓ Settings JSON"
    fi

    # Authentication data
    if [ -f "$app_data_dir/auth.dat" ]; then
        cp "$app_data_dir/auth.dat" "$BACKUP_STAGING/"
        print_info "  ✓ Authentication data"
    fi

    # Uploads directory
    if [ -d "$app_data_dir/uploads" ]; then
        cp -r "$app_data_dir/uploads" "$BACKUP_STAGING/"
        UPLOAD_COUNT=$(find "$app_data_dir/uploads" -type f | wc -l | tr -d ' ')
        print_info "  ✓ Uploads directory ($UPLOAD_COUNT files)"
    fi

    # Generated images directory (if it exists)
    if [ -d "$app_data_dir/generated_images" ]; then
        cp -r "$app_data_dir/generated_images" "$BACKUP_STAGING/"
        IMAGE_COUNT=$(find "$app_data_dir/generated_images" -type f | wc -l | tr -d ' ')
        print_info "  ✓ Generated images ($IMAGE_COUNT files)"
    fi

    # Icons directory (if it exists)
    if [ -d "$app_data_dir/icons" ]; then
        cp -r "$app_data_dir/icons" "$BACKUP_STAGING/"
        print_info "  ✓ Icons directory"
    fi

    # Create a backup info file
    cat > "$BACKUP_STAGING/BACKUP_INFO.txt" << EOF
Chorus Data Backup
==================
Backup Date: $(date)
Instance: $backup_name
Source Path: $app_data_dir
Hostname: $(hostname)
Username: $(whoami)

Contents:
---------
EOF

    ls -lh "$BACKUP_STAGING" >> "$BACKUP_STAGING/BACKUP_INFO.txt"

    # Create zip file
    print_info "Creating archive..."
    cd "$TEMP_DIR"
    zip -r "$BACKUP_FILE" chorus_backup > /dev/null
    cd - > /dev/null

    # Clean up temp directory
    rm -rf "$TEMP_DIR"

    # Show backup summary
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    print_info "✓ Backup created: $BACKUP_FILE ($BACKUP_SIZE)"
    echo ""

    return 0
}

# Perform backup based on instance type
case "$INSTANCE_TYPE" in
    prod)
        print_info "=== Backing up Production Instance ==="
        echo ""
        backup_instance "$HOME/Library/Application Support/sh.chorus.app" "production"
        ;;

    dev)
        print_info "=== Backing up Development Instance ($CURRENT_DIR_NAME) ==="
        echo ""
        backup_instance "$HOME/Library/Application Support/sh.chorus.app.dev.$SAFE_INSTANCE_NAME" "dev_$SAFE_INSTANCE_NAME"
        ;;

    all)
        print_info "=== Backing up All Chorus Instances ==="
        echo ""

        BACKUP_COUNT=0

        # Find all Chorus directories
        while IFS= read -r dir; do
            if [ -z "$dir" ]; then
                continue
            fi

            # Extract instance name from directory path
            DIR_NAME=$(basename "$dir")
            INSTANCE_NAME=$(echo "$DIR_NAME" | sed 's/^sh\.chorus\.app\.dev\./dev_/' | sed 's/^sh\.chorus\.app$/production/')

            if backup_instance "$dir" "$INSTANCE_NAME"; then
                ((BACKUP_COUNT++))
            fi
        done < <(find "$HOME/Library/Application Support/" -maxdepth 1 -type d -name "sh.chorus.app*" 2>/dev/null)

        if [ $BACKUP_COUNT -eq 0 ]; then
            print_error "No Chorus instances found to backup!"
            exit 1
        fi

        print_info "=== Summary ==="
        print_info "Backed up $BACKUP_COUNT instance(s)"
        ;;

    *)
        print_error "Invalid instance type: $INSTANCE_TYPE"
        echo "Use 'prod', 'dev', or 'all'"
        exit 1
        ;;
esac

print_info "Backup complete! Files saved to: $OUTPUT_DIR"
echo ""
print_info "To restore from backup:"
print_info "  1. Close Chorus completely"
print_info "  2. Extract the zip file"
print_info "  3. Copy files back to: ~/Library/Application Support/sh.chorus.app[.dev.NAME]/"
print_info "  4. Restart Chorus"
