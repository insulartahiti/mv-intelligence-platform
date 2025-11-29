# Extension Integration Guide

This guide explains how to integrate your existing Chrome extension (`cgbjodijdlcigiedlpnooopidjdjjfjn`) with the MV Intelligence webapp for centralized management and monitoring.

## **Current Status**

✅ **Extension Management System**: Built and ready  
✅ **Extension Status Component**: Detects extension presence  
✅ **Communication Channels**: Multiple methods for extension-webapp communication  
❌ **Extension Integration**: Your extension needs to be updated to communicate with webapp  

## **What We've Built**

### 1. **Extension Management Dashboard** (`/extension-management`)
- Download and installation instructions
- Version management and updates
- Troubleshooting guide

### 2. **Extension Status Component**
- Real-time extension health monitoring
- Multiple detection methods
- Status indicators throughout the app

### 3. **Communication Infrastructure**
- PostMessage communication
- Custom events
- localStorage data sharing
- DOM element injection

## **Integration Options**

### **Option 1: Minimal Integration (Recommended to start)**

Add this simple code to your extension's content script:

```javascript
// In your extension's content script
function reportStatusToWebapp() {
  const status = {
    source: 'mv-intel-extension',
    type: 'status',
    payload: {
      version: '1.0.0', // Your actual version
      permissions: ['activeTab', 'clipboardRead'], // Your permissions
      features: ['slide-capture', 'deck-analysis'], // Your features
      lastUpdate: new Date().toISOString()
    }
  };

  // Method 1: PostMessage
  window.postMessage(status, '*');
  
  // Method 2: Custom event
  window.dispatchEvent(new CustomEvent('extensionStatus', {
    detail: status
  }));
  
  // Method 3: localStorage
  localStorage.setItem('mv-intel-extension-data', JSON.stringify(status.payload));
  
  // Method 4: Global variable
  window.mvIntelExtension = status.payload;
  
  // Method 5: DOM element
  injectStatusElement();
}

// Call this when your extension loads
reportStatusToWebapp();

// Optional: Report status periodically
setInterval(reportStatusToWebapp, 30000); // Every 30 seconds
```

### **Option 2: Full Integration**

Use the provided helper script (`/extension-helper.js`) by injecting it into pages:

```javascript
// In your extension's background script
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if it's a supported platform
    if (tab.url.includes('figma.com') || 
        tab.url.includes('slides.google.com') || 
        tab.url.includes('office.com')) {
      
      // Inject the helper script
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['extension-helper.js']
      });
    }
  }
});
```

### **Option 3: Custom Integration**

Implement your own communication protocol:

```javascript
// Your extension can listen for messages from the webapp
window.addEventListener('message', (event) => {
  if (event.data && event.data.target === 'mv-intel-extension') {
    switch (event.data.action) {
      case 'ping':
        // Respond with status
        event.source.postMessage({
          source: 'mv-intel-extension',
          type: 'pong',
          payload: getExtensionStatus()
        }, event.origin);
        break;
        
      case 'getStatus':
        // Send detailed status
        event.source.postMessage({
          source: 'mv-intel-extension',
          type: 'status',
          payload: getExtensionStatus()
        }, event.origin);
        break;
        
      case 'captureSlide':
        // Handle slide capture request
        handleSlideCapture(event.data.data);
        break;
    }
  }
});
```

## **Testing the Integration**

### 1. **Visit the Test Page**
Go to `/extension-test` to test communication between your extension and the webapp.

### 2. **Check Extension Status**
Visit the home page to see if the extension status component detects your extension.

### 3. **Monitor Console Logs**
Open browser console to see detailed communication logs.

## **What Your Extension Should Report**

```javascript
{
  version: '1.0.0',           // Current version
  permissions: [              // Granted permissions
    'activeTab',
    'clipboardRead',
    'storage'
  ],
  features: [                 // Available features
    'slide-capture',
    'deck-analysis',
    'affinity-integration'
  ],
  status: 'active',           // Extension status
  lastUpdate: '2025-01-01T...' // Last update timestamp
}
```

## **Supported Platforms**

The system automatically detects extensions on:
- **Figma** (figma.com)
- **Google Slides** (slides.google.com)
- **PowerPoint Online** (office.com)
- **Notion** (notion.so)
- **Miro** (miro.com)

## **Security Considerations**

1. **Origin Validation**: Only accept messages from trusted origins
2. **Permission Scoping**: Report only necessary information
3. **Data Validation**: Validate all incoming messages
4. **Error Handling**: Gracefully handle communication failures

## **Next Steps**

### **Immediate (This Week)**
1. **Add basic status reporting** to your extension (Option 1)
2. **Test communication** using the test page
3. **Verify detection** on the home page

### **Short Term (Next 2 Weeks)**
1. **Implement full communication protocol**
2. **Add slide capture integration**
3. **Test on supported platforms**

### **Long Term (Next Month)**
1. **Add analytics and monitoring**
2. **Implement auto-updates**
3. **Add enterprise features**

## **Troubleshooting**

### **Extension Not Detected**
- Check if status reporting code is running
- Verify communication methods are working
- Check browser console for errors

### **Communication Failures**
- Ensure extension is on supported platform
- Check if helper script is loaded
- Verify message format is correct

### **Permission Issues**
- Check if extension has required permissions
- Verify extension is enabled
- Check site access settings

## **Support**

For integration help:
1. **Check the test page** (`/extension-test`)
2. **Review console logs** for detailed information
3. **Use the debug info** in the extension status component
4. **Contact development team** for complex issues

## **Example Integration**

Here's a complete example of what to add to your extension:

```javascript
// Add this to your content script
(function() {
  'use strict';
  
  // Report extension status
  function reportStatus() {
    const status = {
      source: 'mv-intel-extension',
      type: 'status',
      payload: {
        version: '1.0.0',
        permissions: ['activeTab', 'clipboardRead'],
        features: ['slide-capture', 'deck-analysis'],
        status: 'active',
        lastUpdate: new Date().toISOString()
      }
    };

    // Multiple communication methods
    window.postMessage(status, '*');
    window.dispatchEvent(new CustomEvent('extensionStatus', { detail: status }));
    localStorage.setItem('mv-intel-extension-data', JSON.stringify(status.payload));
    window.mvIntelExtension = status.payload;
  }

  // Report on load
  reportStatus();
  
  // Report periodically
  setInterval(reportStatus, 30000);
  
  // Listen for webapp messages
  window.addEventListener('message', (event) => {
    if (event.data && event.data.target === 'mv-intel-extension') {
      console.log('Received message from webapp:', event.data);
      // Handle different actions
    }
  });
  
})();
```

This minimal integration will immediately enable the webapp to detect and monitor your extension!

