# MV Intelligence - Chrome Extension

A Chrome extension for capturing slides from Figma, Notion, and Google Docs, then compiling them into PDFs with AI analysis and pushing to Affinity CRM.

## Features

- **Multi-platform Capture**: Works on Figma, Notion, and Google Docs
- **Slide Detection**: Automatically detects slides and content
- **Screenshot Capture**: High-quality screenshots of current views
- **Deck Compilation**: Compile multiple slides into a single deck
- **Affinity Integration**: Push completed decks directly to Affinity CRM
- **Dark Theme UI**: Consistent with MV Intelligence platform design

## Installation

### Development Mode

1. Clone the repository and navigate to the `chrome-extension` folder
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the `chrome-extension` folder
5. The extension should now appear in your extensions list

### Production Installation

1. Download the `.crx` file (when available)
2. Drag and drop into Chrome extensions page
3. Confirm installation

## Usage

### Capturing Slides

1. Navigate to a supported platform (Figma, Notion, or Google Docs)
2. Click the MV Intelligence extension icon in your toolbar
3. Click "Capture Current Slide" to capture the current view
4. Repeat for additional slides

### Compiling Decks

1. After capturing multiple slides, click "Compile Deck"
2. The extension will send slides to the Edge Functions for processing
3. Wait for compilation to complete

### Pushing to Affinity

1. Once compiled, click "Push to Affinity"
2. The deck will be uploaded to Affinity CRM
3. Local data will be cleared after successful push

## Configuration

### Supabase Setup

Update the following in `background.js`:

```javascript
this.supabaseUrl = 'https://your-project.supabase.co';
this.supabaseKey = 'your-anon-key';
```

### Supported Platforms

The extension currently supports:
- **Figma**: Captures frames and pages
- **Notion**: Captures page content and blocks
- **Google Docs**: Captures document content

## Architecture

### Content Script (`content.js`)
- Injects capture UI into supported platforms
- Detects slide content and structure
- Handles screenshot capture requests

### Background Script (`background.js`)
- Manages slide storage and deck compilation
- Communicates with Edge Functions
- Handles Chrome extension lifecycle

### Edge Functions
- `capture/create-deck`: Creates new deck artifacts
- `capture/compile-pdf`: Compiles slides into PDF
- `affinity/push`: Pushes decks to Affinity CRM

## Development

### Building

1. Make changes to the extension files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the MV Intelligence extension
4. Test your changes

### Debugging

- Use Chrome DevTools on the extension popup
- Check the background script console in extension management
- Monitor Edge Function logs in Supabase dashboard

## Security

- Extension only requests necessary permissions
- All API calls go through secure Edge Functions
- No sensitive data stored locally
- Data cleared after successful Affinity push

## Troubleshooting

### Common Issues

1. **Extension not working**: Check if Developer mode is enabled
2. **Capture failed**: Ensure you're on a supported platform
3. **Compilation error**: Check Edge Function logs and Supabase connection
4. **Affinity push failed**: Verify API credentials and network connection

### Support

For issues or questions:
1. Check the Chrome extension console for errors
2. Review Edge Function logs in Supabase
3. Contact the development team

## Roadmap

- [ ] Add support for PowerPoint Online
- [ ] Implement OCR for better text extraction
- [ ] Add company auto-detection from slide content
- [ ] Support for custom slide templates
- [ ] Batch processing for multiple decks
- [ ] Integration with additional CRM platforms
