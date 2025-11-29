// MV Intelligence - Content Script for Slide Capture
class SlideCapture {
  constructor() {
    this.capturedSlides = [];
    this.currentSite = this.detectSite();
    this.init();
  }

  detectSite() {
    const url = window.location.href;
    if (url.includes('figma.com')) return 'figma';
    if (url.includes('notion.so')) return 'notion';
    if (url.includes('docs.google.com')) return 'gdocs';
    if (url.includes('docsend.com')) return 'docsend';
    if (url.includes('pitch.com')) return 'pitch';
    if (url.includes('canva.com')) return 'canva';
    if (url.includes('slideshare.net')) return 'slideshare';
    return 'generic'; // Universal capture for any other site
  }

  init() {
    // Inject UI on all sites, but maybe minimize it on generic ones initially?
    // For now, we'll show it everywhere to ensure "capture availability"
    this.injectCaptureUI();
    this.setupMessageListener();
    
    // Always run basic detection as fallback
    this.setupBasicSlideDetection();
    
    switch (this.currentSite) {
      case 'figma':
        this.setupFigmaCapture();
        break;
      case 'notion':
        this.setupNotionCapture();
        break;
      case 'gdocs':
        this.setupGDocsCapture();
        break;
      case 'docsend':
        this.setupDocSendCapture();
        break;
      // Add more specific handlers here if needed
    }
  }

  injectCaptureUI() {
    const captureButton = document.createElement('div');
    captureButton.id = 'mv-capture-button';
    captureButton.innerHTML = `
      <div class="mv-capture-ui">
        <button id="mv-capture-slide" class="mv-btn">
          📄 Capture Slide
        </button>
        <div id="mv-capture-status" class="mv-status"></div>
      </div>
    `;
    
    document.body.appendChild(captureButton);
    this.addCaptureStyles();
    
    // Add event listeners
    document.getElementById('mv-capture-slide').addEventListener('click', () => {
      this.captureCurrentSlide();
    });
  }

  addCaptureStyles() {
    // Styles are now loaded from content.css
    // This method is kept for any dynamic style additions if needed
  }

  setupFigmaCapture() {
    // Figma-specific slide detection
    this.observeFigmaChanges();
  }

  setupNotionCapture() {
    // Notion-specific slide detection
    this.observeNotionChanges();
  }

  setupGDocsCapture() {
    // Google Docs-specific slide detection
    this.observeGDocsChanges();
  }

  setupDocSendCapture() {
    // DocSend-specific slide detection
    this.observeDocSendChanges();
  }

  observeFigmaChanges() {
    // Watch for Figma frame/page changes
    const observer = new MutationObserver(() => {
      this.updateFigmaSlideInfo();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  observeNotionChanges() {
    // Watch for Notion page changes
    const observer = new MutationObserver(() => {
      this.updateNotionSlideInfo();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  observeGDocsChanges() {
    // Watch for Google Docs changes
    const observer = new MutationObserver(() => {
      this.updateGDocsSlideInfo();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  observeDocSendChanges() {
    // Watch for DocSend changes
    const observer = new MutationObserver(() => {
      this.updateDocSendSlideInfo();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  updateFigmaSlideInfo() {
    // Extract current Figma frame/page info
    const frames = document.querySelectorAll('[data-testid="frame"]');
    if (frames.length > 0) {
      this.currentSlideInfo = {
        type: 'figma',
        title: this.extractFigmaTitle(),
        frameCount: frames.length,
        currentFrame: this.getCurrentFigmaFrame()
      };
    }
  }

  updateNotionSlideInfo() {
    // Extract current Notion page info
    const pageTitle = document.querySelector('h1')?.textContent;
    if (pageTitle) {
      this.currentSlideInfo = {
        type: 'notion',
        title: pageTitle,
        blocks: this.extractNotionBlocks()
      };
    }
  }

  updateGDocsSlideInfo() {
    // Extract current Google Docs info
    const docTitle = document.title.replace(' - Google Docs', '');
    if (docTitle) {
      this.currentSlideInfo = {
        type: 'gdocs',
        title: docTitle,
        content: this.extractGDocsContent()
      };
    }
  }

  updateDocSendSlideInfo() {
    // Extract current DocSend info
    // Note: DocSend structure varies, this is a basic implementation
    const viewerContent = document.querySelector('.viewer-content') || document.querySelector('#viewer');
    const pageTitle = document.title || 'DocSend Document';
    
    if (viewerContent || pageTitle) {
      this.currentSlideInfo = {
        type: 'docsend',
        title: pageTitle,
        content: 'DocSend slide content', // Placeholder until structure is known
        slideIndex: this.getDocSendSlideIndex()
      };
    }
  }

  extractFigmaTitle() {
    const titleElement = document.querySelector('[data-testid="page-title"]');
    return titleElement?.textContent || 'Untitled Figma';
  }

  getCurrentFigmaFrame() {
    const selectedFrame = document.querySelector('[data-selected="true"]');
    return selectedFrame?.getAttribute('data-testid') || 'unknown';
  }

  extractNotionBlocks() {
    const blocks = document.querySelectorAll('[data-block-id]');
    return Array.from(blocks).map(block => ({
      id: block.getAttribute('data-block-id'),
      type: block.getAttribute('data-block-type'),
      content: block.textContent?.slice(0, 100)
    }));
  }

  extractGDocsContent() {
    const content = document.querySelector('.kix-appview-editor');
    return content?.textContent?.slice(0, 200) || '';
  }

  getDocSendSlideIndex() {
    // Try to find slide index/number in DocSend viewer
    const progressEl = document.querySelector('.toolbar-page-indicator') || document.querySelector('.page-label');
    return progressEl?.textContent?.trim() || 'unknown';
  }

  async captureCurrentSlide() {
    // Retry detection if info is missing (just in case)
    if (!this.currentSlideInfo) {
      console.log('Slide info missing, retrying detection...');
      this.setupBasicSlideDetection();
      
      // Try platform specific update again
      switch (this.currentSite) {
        case 'docsend': this.updateDocSendSlideInfo(); break;
        case 'figma': this.updateFigmaSlideInfo(); break;
        case 'notion': this.updateNotionSlideInfo(); break;
        case 'gdocs': this.updateGDocsSlideInfo(); break;
      }
    }

    if (!this.currentSlideInfo) {
      console.warn('Still no slide info detected');
      // Fallback to basic page capture
      this.currentSlideInfo = {
        type: 'fallback',
        title: document.title,
        content: 'Fallback capture',
        timestamp: new Date().toISOString()
      };
    }

    try {
      this.showStatus('Capturing slide...', 'capturing');
      
      // Capture screenshot
      const screenshot = await this.captureScreenshot();
      
      // Prepare slide data
      const slideData = {
        ...this.currentSlideInfo,
        screenshot: screenshot,
        timestamp: new Date().toISOString(),
        url: window.location.href
      };

      // Send to background script
      chrome.runtime.sendMessage({
        action: 'captureSlide',
        data: slideData
      }, (response) => {
        if (response.success) {
          this.showStatus('Slide captured!', 'success');
          this.capturedSlides.push(slideData);
        } else {
          this.showStatus('Capture failed', 'error');
        }
      });

    } catch (error) {
      console.error('Slide capture error:', error);
      this.showStatus('Capture failed', 'error');
    }
  }

  async captureScreenshot() {
    // Use chrome.tabs.captureVisibleTab for screenshot
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'captureScreenshot'
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (response && response.success) {
          resolve(response.dataUrl);
        } else {
          reject(new Error(response?.error || 'Screenshot failed'));
        }
      });
    });
  }

  showStatus(message, type) {
    const statusEl = document.getElementById('mv-capture-status');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = `mv-status mv-${type}`;
      
      // Clear status after 3 seconds
      setTimeout(() => {
        statusEl.textContent = '';
        statusEl.className = 'mv-status';
      }, 3000);
    }
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('Content script received message:', request);
      
      switch (request.action) {
        case 'captureSlide':
          this.captureCurrentSlide().then(() => {
            sendResponse({ success: true });
          }).catch((error) => {
            sendResponse({ success: false, error: error.message });
          });
          return true; // Keep message channel open for async response
          
        case 'getSlideInfo':
          sendResponse({ slideInfo: this.currentSlideInfo });
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    });
  }

  setupBasicSlideDetection() {
    // Universal slide detection that works on any page
    this.currentSlideInfo = {
      type: this.currentSite,
      title: document.title || 'Web Page',
      content: this.extractPageContent(),
      elements: this.extractPageElements(),
      metadata: this.extractPageMetadata()
    };
    
    console.log('Universal slide detection set up:', this.currentSlideInfo);
  }

  extractPageContent() {
    // Extract meaningful content from the page
    const content = [];
    
    // Get headings
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach(h => {
      content.push(`# ${h.textContent.trim()}`);
    });
    
    // Get main content areas
    const mainContent = document.querySelector('main, article, .content, .main, #content, #main');
    if (mainContent) {
      const text = mainContent.textContent?.trim().slice(0, 500);
      if (text) content.push(text);
    }
    
    // Get paragraphs
    const paragraphs = document.querySelectorAll('p');
    paragraphs.slice(0, 5).forEach(p => {
      const text = p.textContent?.trim();
      if (text && text.length > 20) content.push(text);
    });
    
    return content.join('\n\n');
  }

  extractPageMetadata() {
    return {
      url: window.location.href,
      domain: window.location.hostname,
      path: window.location.pathname,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };
  }

  extractPageElements() {
    // Extract basic page structure for testing
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      .map(h => ({ type: h.tagName.toLowerCase(), text: h.textContent?.slice(0, 100) }));
    
    const images = Array.from(document.querySelectorAll('img'))
      .map(img => ({ src: img.src, alt: img.alt, width: img.width, height: img.height }));
    
    return { headings, images };
  }
}

// Initialize slide capture when DOM is ready
console.log('🎯 MV Intelligence Content Script Loading...');

function initializeSlideCapture() {
  try {
    console.log('🚀 Initializing SlideCapture...');
    new SlideCapture();
    console.log('✅ SlideCapture initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing SlideCapture:', error);
  }
}

// Multiple initialization strategies
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSlideCapture);
} else {
  initializeSlideCapture();
}

// Also try on window load as backup
window.addEventListener('load', () => {
  if (!window.mvIntelligenceInitialized) {
    console.log('🔄 Fallback initialization on window load');
    initializeSlideCapture();
  }
});

// Mark as initialized to prevent duplicates
window.mvIntelligenceInitialized = true;
