# 🧪 MV Intelligence Chrome Extension - Testing Guide

## 🚀 **Quick Start Testing**

### 1. **Install Extension in Chrome**
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `build` folder from this directory
5. Verify the extension appears in your toolbar

### 2. **Test Basic Functionality**
1. **Click Extension Icon**: Should show popup with dark theme
2. **Check UI Elements**: 
   - Slide count display
   - Capture button
   - Compile button (disabled until slides captured)
   - Push to Affinity button (disabled until deck compiled)

### 3. **Test on Supported Platforms**

#### **Figma Test**
1. Go to [Figma](https://figma.com)
2. Create a new design or open existing
3. Look for the capture button in top-right corner
4. Click "Capture Slide" button

#### **Notion Test**
1. Go to [Notion](https://notion.so)
2. Create a new page or open existing
3. Look for the capture button in top-right corner
4. Click "Capture Slide" button

#### **Google Docs Test**
1. Go to [Google Docs](https://docs.google.com)
2. Create a new document or open existing
3. Look for the capture button in top-right corner
4. Click "Capture Slide" button

## 🔧 **Current Test Status**

### ✅ **Working**
- Extension loads in Chrome
- Popup interface displays correctly
- Dark theme styling applied
- Button states update based on slide count

### 🚧 **Needs Testing**
- Slide capture on actual platforms
- Screenshot functionality
- Local storage of captured slides
- Edge Function communication

### ❌ **Known Issues**
- PNG icons are placeholders (need conversion)
- Edge Functions need proper authentication
- Affinity integration is simulated

## 🐛 **Debugging Tips**

### **Extension Console**
- Right-click extension icon → "Inspect popup"
- Check Console tab for errors
- Look for network requests to Edge Functions

### **Background Script**
- Go to `chrome://extensions/`
- Find MV Intelligence extension
- Click "service worker" link
- Check console for background script errors

### **Content Script**
- Use browser DevTools on target pages
- Look for injected capture UI
- Check for JavaScript errors

## 📱 **Test Scenarios**

### **Scenario 1: Basic Capture**
1. Navigate to Figma/Notion/Google Docs
2. Capture 2-3 slides
3. Verify slide count updates in popup
4. Check that compile button becomes enabled

### **Scenario 2: Deck Compilation**
1. After capturing slides, click "Compile Deck"
2. Watch for loading state
3. Check for success/error messages
4. Verify deck status updates

### **Scenario 3: Affinity Push**
1. After compilation, click "Push to Affinity"
2. Watch for loading state
3. Check for success/error messages
4. Verify local data is cleared

## 🔒 **Security Testing**

### **Permission Testing**
- Verify extension only requests necessary permissions
- Check that no sensitive data is stored locally
- Ensure all API calls go through Edge Functions

### **Data Handling**
- Test with invalid/malicious input
- Verify error handling for network failures
- Check that local storage is properly managed

## 📊 **Performance Testing**

### **Memory Usage**
- Monitor extension memory usage in Chrome
- Check for memory leaks during slide capture
- Verify cleanup after Affinity push

### **Response Times**
- Measure slide capture time
- Monitor Edge Function response times
- Check for UI responsiveness

## 🎯 **Success Criteria**

### **Phase 1 Complete When**
- [ ] Extension loads without errors
- [ ] Capture UI appears on supported platforms
- [ ] Slides are captured and stored locally
- [ ] Deck compilation works (even if simulated)
- [ ] Affinity push completes successfully
- [ ] No critical errors in console

### **Ready for Production When**
- [ ] All Phase 1 criteria met
- [ ] PNG icons properly generated
- [ ] Edge Functions properly authenticated
- [ ] Real Affinity API integration
- [ ] Comprehensive error handling
- [ ] Performance targets met

## 📞 **Getting Help**

### **Common Issues**
1. **Extension not loading**: Check Developer mode is enabled
2. **Capture button not appearing**: Verify you're on supported platform
3. **Edge Function errors**: Check authentication and network
4. **UI not updating**: Refresh extension or check console errors

### **Next Steps**
1. Test basic functionality
2. Identify and fix any issues
3. Test on actual platforms
4. Deploy Edge Functions with proper auth
5. Test end-to-end workflow

---

*Last Updated: August 29, 2025*
*Status: Ready for Testing*
