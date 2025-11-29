# Extension Management System

The MV Intelligence Platform includes a comprehensive extension management system that allows users to download, install, and manage the Chrome extension directly from the webapp.

## Features

### 🚀 **Centralized Management**
- **Extension Status**: Real-time monitoring of extension installation and health
- **Version Management**: Automatic update detection and version tracking
- **Download Center**: One-click extension downloads with progress tracking
- **Health Monitoring**: Extension health checks with issue detection and recommendations

### 📱 **User Experience**
- **Installation Guide**: Step-by-step installation instructions
- **Troubleshooting**: Common issues and solutions
- **Feature Overview**: Clear explanation of extension capabilities
- **Status Indicators**: Visual feedback on extension health

### 🔧 **Developer Tools**
- **Version Scripts**: Automated version management and updates
- **Configuration Management**: Centralized extension configuration
- **API Endpoints**: RESTful APIs for extension management
- **Health Checks**: Automated extension diagnostics

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Webapp UI     │    │  Extension Mgmt  │    │  Chrome Ext.    │
│                 │    │     API          │    │                 │
│ • Status Check  │◄──►│ • Version Check  │◄──►│ • Health Ping   │
│ • Download      │    │ • Download Mgmt  │    │ • Status Report │
│ • Installation  │    │ • Analytics      │    │ • Version Info  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Extension      │    │  Version Config  │    │  Storage        │
│  Components     │    │  Management      │    │  Buckets        │
│ • Status Card   │    │ • Config Files   │    │ • Extension     │
│ • Management    │    │ • Update Scripts │    │   Files         │
│   Page          │    │ • Changelog      │    │ • Version       │
└─────────────────┘    └──────────────────┘    │   Tracking      │
                                               └─────────────────┘
```

## Components

### 1. **Extension Management Page** (`/extension-management`)
- Full extension management interface
- Download progress tracking
- Installation instructions
- Troubleshooting guide

### 2. **Extension Status Component** (`ExtensionStatus.tsx`)
- Reusable status indicator
- Compact and full display modes
- Health monitoring
- Quick actions

### 3. **Configuration Management** (`extensionConfig.ts`)
- Centralized version information
- Feature definitions
- Platform support
- Permission requirements

### 4. **API Endpoints**
- `/api/extension/check-updates` - Version checking
- `/api/extension/download` - Download management

## Usage

### For Users

1. **Check Extension Status**
   - Visit the Extension page or see status on home page
   - View current version and health status

2. **Install Extension**
   - Click "Download Extension" button
   - Follow installation instructions
   - Grant necessary permissions

3. **Monitor Health**
   - Extension automatically reports status
   - Issues are highlighted with recommendations
   - Update notifications when available

### For Developers

1. **Add New Version**
   ```bash
   node scripts/manage-extension-versions.js --version 1.1.0 "New feature" "Bug fix"
   ```

2. **Check Current Status**
   ```bash
   node scripts/manage-extension-versions.js --current
   ```

3. **List All Versions**
   ```bash
   node scripts/manage-extension-versions.js --list
   ```

## Extension Communication

The extension communicates with the webapp through Chrome's messaging system:

```javascript
// Extension sends status
chrome.runtime.sendMessage('mv-intel-extension', { 
  action: 'ping',
  version: '1.0.0',
  permissions: ['activeTab', 'clipboardRead']
});

// Webapp receives and processes
const response = await chrome.runtime.sendMessage('mv-intel-extension', { action: 'ping' });
```

## File Structure

```
mv-intel-web/
├── app/
│   ├── extension-management/     # Extension management page
│   └── api/extension/           # Extension API endpoints
├── components/
│   └── ExtensionStatus.tsx      # Reusable status component
├── lib/
│   └── extensionConfig.ts       # Configuration management
├── scripts/
│   └── manage-extension-versions.js  # Version management script
└── public/
    └── chrome-extension/        # Extension files for download
```

## Configuration

### Version Management
- **Current Version**: Version currently deployed
- **Latest Version**: Most recent available version
- **Changelog**: Detailed change history per version
- **Breaking Changes**: Flag for major updates

### Platform Support
- **Figma**: Design platform integration
- **Google Slides**: Presentation capture
- **PowerPoint Online**: Office 365 integration
- **Notion**: Document capture
- **Miro**: Whiteboard integration

### Permissions
- **activeTab**: Access to current tab content
- **clipboardRead**: Read clipboard data
- **storage**: Save user preferences
- **downloads**: Save files locally

## Security Considerations

1. **Extension Verification**: Only signed extensions are distributed
2. **Permission Scoping**: Minimal required permissions
3. **Update Validation**: Version integrity checks
4. **User Consent**: Clear permission explanations

## Future Enhancements

1. **Auto-Updates**: Seamless extension updates
2. **Analytics Dashboard**: Usage and performance metrics
3. **Beta Testing**: Staged rollouts for new versions
4. **Cross-Platform**: Support for Firefox and Edge
5. **Enterprise Features**: Bulk deployment and management

## Troubleshooting

### Common Issues

1. **Extension Not Detected**
   - Check if extension is installed
   - Verify permissions are granted
   - Restart browser if needed

2. **Permission Errors**
   - Go to chrome://extensions/
   - Enable required permissions
   - Check site access settings

3. **Update Failures**
   - Clear browser cache
   - Reinstall extension
   - Check network connectivity

### Support

For technical support or feature requests:
- Check the troubleshooting guide
- Review extension documentation
- Contact development team

## Contributing

To contribute to the extension management system:

1. **Fork the repository**
2. **Create a feature branch**
3. **Make your changes**
4. **Add tests if applicable**
5. **Submit a pull request**

## License

This extension management system is part of the MV Intelligence Platform and follows the same licensing terms.

