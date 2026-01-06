#!/bin/bash

# Script to set up an isolated development instance of Chorus
# Usage: ./script/setup-instance.sh [instance-name]

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

echo "Setting up OpenRouter Chorus development instance: $INSTANCE_NAME"
echo "App identifier: $IDENTIFIER"

# Install dependencies
echo "Installing dependencies..."
pnpm i

# Create the Application Support directory
APP_SUPPORT_DIR="$HOME/Library/Application Support"
INSTANCE_DIR="$APP_SUPPORT_DIR/$IDENTIFIER"

if [ ! -d "$INSTANCE_DIR" ]; then
    echo "Creating data directory: $INSTANCE_DIR"
    mkdir -p "$INSTANCE_DIR"
else
    echo "Data directory already exists: $INSTANCE_DIR"
fi

# Copy auth.dat if it exists in the source directory
SOURCE_AUTH="$APP_SUPPORT_DIR/ai.openrouter.desktop.dev/auth.dat"
if [ -f "$SOURCE_AUTH" ]; then
    echo "Copying auth.dat from ai.openrouter.desktop.dev..."
    cp "$SOURCE_AUTH" "$INSTANCE_DIR/auth.dat"
    echo "✓ Authentication copied successfully"
else
    echo "⚠ No auth.dat found in ai.openrouter.desktop.dev - you'll need to log in"
fi

# copy chats.db if it exists in the source directory
SOURCE_CHATS="$APP_SUPPORT_DIR/ai.openrouter.desktop.dev/chats.db"
if [ -f "$SOURCE_CHATS" ]; then
    echo "Copying chats.db from ai.openrouter.desktop.dev using sqlite's online backup API..."
    if ! sqlite3 "$SOURCE_CHATS" ".backup '$INSTANCE_DIR/chats.db'"; then  
        echo "❌ Failed to copy chats database - database will start empty"  
    fi 

    echo "✓ Chats copied successfully"
else
    echo "⚠ No chats.db found in ai.openrouter.desktop.dev - database will start empty"
fi

# Generate custom icon with ImageMagick if available
if command -v magick >/dev/null 2>&1; then
    echo ""
    echo "Generating custom icon..."
    
    # Create instance icons directory
    ICONS_DIR="$INSTANCE_DIR/icons"
    mkdir -p "$ICONS_DIR"
    
    # Generate icon with instance name overlay
    # Use the dev icon as base
    BASE_ICON="$REPO_DIR/src-tauri/icons/icon.png"
    OUTPUT_ICON="$ICONS_DIR/icon.png"
    
    # Create icon with text overlay
    # Position text in the bottom third of the icon
    magick "$BASE_ICON" \
        -gravity South \
        -pointsize 86 \
        -font Arial-Bold \
        -fill darkorange \
        -stroke white \
        -strokewidth 2 \
        -annotate +0+60 "$INSTANCE_NAME" \
        "$OUTPUT_ICON"
    
    # Also create the .icns file for macOS
    # First create required sizes
    mkdir -p "$ICONS_DIR/icon.iconset"
    
    # Generate all required sizes for iconset
    magick "$OUTPUT_ICON" -resize 16x16     "$ICONS_DIR/icon.iconset/icon_16x16.png"
    magick "$OUTPUT_ICON" -resize 32x32     "$ICONS_DIR/icon.iconset/icon_16x16@2x.png"
    magick "$OUTPUT_ICON" -resize 32x32     "$ICONS_DIR/icon.iconset/icon_32x32.png"
    magick "$OUTPUT_ICON" -resize 64x64     "$ICONS_DIR/icon.iconset/icon_32x32@2x.png"
    magick "$OUTPUT_ICON" -resize 128x128   "$ICONS_DIR/icon.iconset/icon_128x128.png"
    magick "$OUTPUT_ICON" -resize 256x256   "$ICONS_DIR/icon.iconset/icon_128x128@2x.png"
    magick "$OUTPUT_ICON" -resize 256x256   "$ICONS_DIR/icon.iconset/icon_256x256.png"
    magick "$OUTPUT_ICON" -resize 512x512   "$ICONS_DIR/icon.iconset/icon_256x256@2x.png"
    magick "$OUTPUT_ICON" -resize 512x512   "$ICONS_DIR/icon.iconset/icon_512x512.png"
    magick "$OUTPUT_ICON" -resize 1024x1024 "$ICONS_DIR/icon.iconset/icon_512x512@2x.png"
    
    # Convert to .icns
    iconutil -c icns "$ICONS_DIR/icon.iconset" -o "$ICONS_DIR/icon.icns" 2>/dev/null || true
    
    # Clean up iconset
    rm -rf "$ICONS_DIR/icon.iconset"
    
    echo "✓ Custom icon generated!"
else
    echo ""
    echo "⚠ ImageMagick not found - skipping icon generation"
    echo "  Install with: brew install imagemagick"
fi

echo ""
echo "✅ Setup complete! You can now run:"
echo "    pnpm run dev"