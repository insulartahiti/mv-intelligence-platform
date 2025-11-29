#!/bin/bash

# MV Intelligence Chrome Extension Build Script

echo "🚀 Building MV Intelligence Chrome Extension..."

# Set variables
EXTENSION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$EXTENSION_DIR/build"
DIST_DIR="$EXTENSION_DIR/dist"

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf "$BUILD_DIR" "$DIST_DIR"
mkdir -p "$BUILD_DIR" "$DIST_DIR"

# Copy extension files
echo "📁 Copying extension files..."
cp -r "$EXTENSION_DIR"/manifest.json "$BUILD_DIR/"
cp -r "$EXTENSION_DIR"/background.js "$BUILD_DIR/"
cp -r "$EXTENSION_DIR"/content.js "$BUILD_DIR/"
cp -r "$EXTENSION_DIR"/content.css "$BUILD_DIR/"
cp -r "$EXTENSION_DIR"/popup.html "$BUILD_DIR/"
cp -r "$EXTENSION_DIR"/popup.js "$BUILD_DIR/"
cp -r "$EXTENSION_DIR"/icons "$BUILD_DIR/"

# Create production manifest (remove debug features)
echo "⚙️  Creating production manifest..."
cat > "$BUILD_DIR/manifest.json" << EOF
{
  "manifest_version": 3,
  "name": "MV Intelligence - Deck Capture",
  "version": "1.0.0",
  "description": "Capture slides from Figma, Docs, Notion and compile into PDFs with AI analysis",
  "permissions": [
    "activeTab",
    "storage",
    "scripting",
    "contextMenus"
  ],
  "host_permissions": [
    "https://*.supabase.co/*",
    "https://*/*",
    "http://*/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": [
        "https://*/*",
        "http://*/*"
      ],
      "js": ["content.js"],
      "css": ["content.css"]
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_title": "MV Intelligence"
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
EOF

# Content styles already copied from source
echo "🎨 Content styles copied..."

# Generate PNG icons from SVG (requires ImageMagick or similar)
if command -v convert &> /dev/null; then
    echo "🖼️  Generating PNG icons..."
    convert "$BUILD_DIR/icons/icon.svg" -resize 16x16 "$BUILD_DIR/icons/icon16.png"
    convert "$BUILD_DIR/icons/icon.svg" -resize 48x48 "$BUILD_DIR/icons/icon48.png"
    convert "$BUILD_DIR/icons/icon.svg" -resize 128x128 "$BUILD_DIR/icons/icon128.png"
else
    echo "⚠️  ImageMagick not found. Please manually convert SVG to PNG icons."
    echo "   Required sizes: 16x16, 48x48, 128x128"
fi

# Create zip file for distribution
echo "📦 Creating distribution package..."
cd "$BUILD_DIR"
zip -r "../dist/mv-intelligence-extension.zip" . -x "*.DS_Store"

# Create development package
echo "🔧 Creating development package..."
cd "$EXTENSION_DIR"
zip -r "dist/mv-intelligence-extension-dev.zip" chrome-extension/ -x "*.DS_Store" "chrome-extension/build/*" "chrome-extension/dist/*"

echo "✅ Build complete!"
echo ""
echo "📁 Build files: $BUILD_DIR"
echo "📦 Distribution: $DIST_DIR"
echo ""
echo "🚀 To install in Chrome:"
echo "   1. Go to chrome://extensions/"
echo "   2. Enable Developer mode"
echo "   3. Click 'Load unpacked'"
echo "   4. Select: $BUILD_DIR"
echo ""
echo "📋 Files included:"
ls -la "$BUILD_DIR"
