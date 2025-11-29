// MV Intelligence - Background Service Worker
class MVIntelligenceBackground {
  constructor() {
    this.capturedSlides = [];
    this.currentDeck = null;
    this.supabaseUrl = 'https://uqptiychukuwixubrbat.supabase.co';
    this.supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
    
    this.init();
  }

  init() {
    try {
      // Check if Chrome extension APIs are available
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        console.error('Chrome extension APIs not available');
        return;
      }
      
      this.setupMessageListeners();
      this.setupExternalMessageListeners();
      this.setupContextMenus();
      this.loadStoredData();
      console.log('MV Intelligence Background Service Worker initialized successfully');
    } catch (error) {
      console.error('Error initializing background service worker:', error);
    }
  }

  setupMessageListeners() {
    try {
      if (!chrome.runtime) {
        console.error('Chrome runtime API not available');
        return;
      }
      
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        try {
          switch (request.action) {
            case 'captureSlide':
              this.handleSlideCapture(request.data, sendResponse);
              return true; // Keep message channel open for async response
              
            case 'captureScreenshot':
              this.handleScreenshotCapture(sendResponse);
              return true;
              
            case 'compileDeck':
              this.handleDeckCompilation(sendResponse);
              return true;
              
            case 'pushToAffinity':
              this.handleAffinityPush(sendResponse);
              return true;
              
                    case 'getDeckStatus':
          sendResponse({ deck: this.currentDeck, slides: this.capturedSlides });
          break;
          
        case 'uploadFile':
          this.handleFileUpload(request.data, sendResponse);
          return true;
          }
        } catch (error) {
          console.error('Error handling message:', error);
          sendResponse({ success: false, error: error.message });
        }
      });
    } catch (error) {
      console.error('Error setting up message listeners:', error);
    }
  }

  setupExternalMessageListeners() {
    try {
      if (chrome.runtime && chrome.runtime.onMessageExternal) {
        chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
          console.log('📡 Received external message:', request);
          
          switch (request.action) {
            case 'ping':
              sendResponse({ 
                success: true, 
                version: chrome.runtime.getManifest().version,
                permissions: ['activeTab', 'storage', 'scripting'],
                installed: true
              });
              break;
              
            case 'auth_handshake':
              this.handleAuthHandshake(request.data, sendResponse);
              break;
              
            default:
              sendResponse({ success: false, error: 'Unknown action' });
          }
        });
        console.log('✅ External message listeners set up');
      }
    } catch (error) {
      console.error('Error setting up external message listeners:', error);
    }
  }

  async handleAuthHandshake(data, sendResponse) {
    try {
      console.log('🤝 Handling auth handshake');
      if (data.supabaseUrl && data.supabaseKey) {
        this.supabaseUrl = data.supabaseUrl;
        this.supabaseKey = data.supabaseKey;
        
        // Save to storage
        await this.storeData();
        
        sendResponse({ success: true, message: 'Extension authenticated successfully' });
      } else {
        sendResponse({ success: false, error: 'Missing auth data' });
      }
    } catch (error) {
      console.error('Auth handshake error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  setupContextMenus() {
    try {
      // Check if contextMenus API is available
      if (chrome.contextMenus) {
        // Clear existing context menus first
        chrome.contextMenus.removeAll(() => {
          console.log('🧹 Cleared existing context menus');
          
          // Create new context menus
          chrome.contextMenus.create({
            id: 'mv-capture-slide',
            title: 'Capture Slide',
            contexts: ['page'],
            documentUrlPatterns: [
              'https://*/*',
              'http://*/*'
            ]
          });

          chrome.contextMenus.create({
            id: 'mv-compile-deck',
            title: 'Compile Deck',
            contexts: ['action'],
            enabled: false
          });

          // Set up click listener only once
          if (!this.contextMenuListenerSet) {
            chrome.contextMenus.onClicked.addListener((info, tab) => {
              if (info.menuItemId === 'mv-capture-slide') {
                this.captureSlideFromTab(tab);
              } else if (info.menuItemId === 'mv-compile-deck') {
                this.compileDeck();
              }
            });
            this.contextMenuListenerSet = true;
          }
          
          console.log('✅ Context menus created successfully');
        });
      } else {
        console.log('Context menus API not available, skipping context menu setup');
      }
    } catch (error) {
      console.error('Error setting up context menus:', error);
    }
  }

  async handleSlideCapture(slideData, sendResponse) {
    try {
      console.log('Handling slide capture:', slideData);
      
      // If this is the first slide, create a new deck
      if (this.capturedSlides.length === 0) {
        await this.createNewDeck(slideData);
      }
      
      // Store slide data locally
      this.capturedSlides.push(slideData);
      
      // Update context menu state
      this.updateContextMenus();
      
      // Store in chrome.storage
      await this.storeData();
      
      // Send slide to Supabase via Edge Function
      if (this.currentDeck) {
        await this.commitSlideToSupabase(slideData);
      }
      
      sendResponse({ success: true, slideCount: this.capturedSlides.length });
      
    } catch (error) {
      console.error('Slide capture error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async createNewDeck(firstSlide) {
    try {
      console.log('Creating new deck for first slide');
      
      const deckData = {
        title: this.generateDeckTitle(),
        sourceUrl: firstSlide.metadata?.url || window.location.href,
        provider: firstSlide.type?.toUpperCase() || 'WEBPAGE',
        sourcePlatformRaw: firstSlide.type || 'webpage'
      };
      
      const response = await this.sendToEdgeFunction('capture-create-deck', deckData);
      
      if (response.artifactId) {
        this.currentDeck = {
          id: response.artifactId,
          title: deckData.title,
          status: 'CAPTURING',
          created_at: new Date().toISOString()
        };
        
        console.log('New deck created:', this.currentDeck);
      } else {
        throw new Error('Failed to create deck');
      }
      
    } catch (error) {
      console.error('Error creating deck:', error);
      throw error;
    }
  }

  async commitSlideToSupabase(slideData) {
    try {
      console.log('Committing slide to Supabase:', slideData);
      

      
      // First, upload the screenshot to Supabase storage
      const uploadResponse = await this.uploadScreenshotToSupabase(slideData);
      
      const slidePayload = {
        artifactId: this.currentDeck.id,
        slideIndex: this.capturedSlides.length - 1,
        width: slideData.metadata?.viewport?.width || 1920,
        height: slideData.metadata?.viewport?.height || 1080,
        storagePath: uploadResponse.path || `slides/${this.currentDeck.id}/${this.capturedSlides.length - 1}.png`
      };
      
      const response = await this.sendToEdgeFunction('capture-commit-slide', slidePayload);
      
      if (response.id) {
        console.log('Slide committed successfully:', response.id);
      } else {
        console.warn('Slide commit response:', response);
      }
    } catch (error) {
      console.error('Error committing slide to Supabase:', error);
      // Don't throw here - we want to continue even if Supabase fails
    }
  }

    async uploadScreenshotToSupabase(slideData) {
    try {
      console.log('Uploading screenshot to Supabase storage...');
      
      // Use the upload proxy Edge Function
      const response = await this.sendToEdgeFunction('capture-upload-proxy', {
        artifactId: this.currentDeck.id,
        slideIndex: this.capturedSlides.length - 1,
        imageData: slideData.screenshot,
        contentType: 'image/png'
      });
      
      if (response.success) {
        console.log('Screenshot uploaded successfully:', response.path);
        return response;
      } else {
        console.warn('Screenshot upload failed, using fallback path');
        return { path: `slides/${this.currentDeck.id}/${this.capturedSlides.length - 1}.png` };
      }
    } catch (error) {
      console.error('Error uploading screenshot:', error);
      // Return fallback path if upload fails
      return { path: `slides/${this.currentDeck.id}/${this.capturedSlides.length - 1}.png` };
    }
  }

  async handleFileUpload(fileData, sendResponse) {
    try {
      console.log('Handling file upload:', fileData.name);
      
      // If this is the first file, create a new deck
      if (this.capturedSlides.length === 0) {
        await this.createNewDeckFromFile(fileData);
      }
      
      // Create slide data from file
      const slideData = {
        type: 'file',
        title: fileData.name,
        content: `File: ${fileData.name}\nType: ${fileData.type}\nSize: ${fileData.size} bytes`,
        screenshot: fileData.data, // Base64 data
        metadata: {
          url: `file://${fileData.name}`,
          timestamp: new Date().toISOString(),
          viewport: { width: 1920, height: 1080 },
          fileInfo: {
            name: fileData.name,
            type: fileData.type,
            size: fileData.size
          }
        }
      };
      
      // Store slide data locally
      this.capturedSlides.push(slideData);
      
      // Update context menu state
      this.updateContextMenus();
      
      // Store in chrome.storage
      await this.storeData();
      
      // Send slide to Supabase via Edge Function
      if (this.currentDeck) {
        await this.commitSlideToSupabase(slideData);
      }
      
      sendResponse({ success: true, slideCount: this.capturedSlides.length });
      
    } catch (error) {
      console.error('File upload error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async createNewDeckFromFile(fileData) {
    try {
      console.log('Creating new deck for file upload');
      
      const deckData = {
        title: `File Upload - ${fileData.name}`,
        sourceUrl: `file://${fileData.name}`,
        provider: 'FILE_UPLOAD',
        sourcePlatformRaw: 'file'
      };
      
      const response = await this.sendToEdgeFunction('capture-create-deck', deckData);
      
      if (response.artifactId) {
        this.currentDeck = {
          id: response.artifactId,
          title: deckData.title,
          status: 'CAPTURING',
          created_at: new Date().toISOString()
        };
        
        console.log('New deck created for file:', this.currentDeck);
      } else {
        throw new Error('Failed to create deck for file');
      }
    } catch (error) {
      console.error('Error creating deck for file:', error);
      throw error;
    }
  }

  async handleScreenshotCapture(sendResponse) {
    try {
      if (!chrome.tabs) {
        sendResponse({ success: false, error: 'Chrome tabs API not available' });
        return;
      }
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        sendResponse({ success: false, error: 'No active tab' });
        return;
      }

      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'png',
        quality: 90
      });

      sendResponse({ success: true, dataUrl });
      
    } catch (error) {
      console.error('Screenshot capture error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleDeckCompilation(sendResponse) {
    try {
      if (this.capturedSlides.length === 0) {
        sendResponse({ success: false, error: 'No slides to compile' });
        return;
      }

      console.log('Opening print view for compilation...');
      
      // Open print.html in new tab
      chrome.tabs.create({ url: 'print.html' });
      
      // Update local state
      if (this.currentDeck) {
        this.currentDeck.status = 'COMPILED';
        await this.storeData();
      }
      
      sendResponse({ success: true, message: 'Opened compilation view' });
      
    } catch (error) {
      console.error('Deck compilation error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleAffinityPush(sendResponse) {
    try {
      if (!this.currentDeck) {
        sendResponse({ success: false, error: 'No deck to push' });
        return;
      }

      // Push to Affinity via Edge Function
      const affinityResponse = await this.sendToEdgeFunction('affinity-push', {
        artifactId: this.currentDeck.id,
        companyName: this.currentDeck.metadata?.companyName,
        createIfMissing: true
      });

      if (affinityResponse.success) {
        // Clear local data after successful push
        this.capturedSlides = [];
        this.currentDeck = null;
        await this.storeData();
        this.updateContextMenus();
        
        sendResponse({ success: true, affinityId: affinityResponse.affinityId });
      } else {
        sendResponse({ success: false, error: 'Affinity push failed' });
      }
      
    } catch (error) {
      console.error('Affinity push error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async sendToEdgeFunction(endpoint, data) {
    try {
      console.log(`📡 Sending to Edge Function: ${endpoint}`, data);
      
      const response = await fetch(`${this.supabaseUrl}/functions/v1/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.supabaseKey}`
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Edge Function error (${endpoint}):`, response.status, errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`✅ Edge Function response (${endpoint}):`, result);
      return result;
      
    } catch (error) {
      console.error(`Edge Function error (${endpoint}):`, error);
      throw error;
    }
  }

  generateDeckTitle() {
    const timestamp = new Date().toLocaleDateString();
    const source = this.capturedSlides[0]?.type || 'unknown';
    return `${source.charAt(0).toUpperCase() + source.slice(1)} Deck - ${timestamp}`;
  }

  updateContextMenus() {
    try {
      const hasSlides = this.capturedSlides.length > 0;
      
      if (chrome.contextMenus) {
        chrome.contextMenus.update('mv-compile-deck', {
          enabled: hasSlides,
          title: hasSlides ? `Compile Deck (${this.capturedSlides.length} slides)` : 'Compile Deck'
        });
      }
    } catch (error) {
      console.error('Error updating context menus:', error);
    }
  }

  async storeData() {
    try {
      if (!chrome.storage || !chrome.storage.local) {
        console.warn('Chrome storage API not available, skipping storage');
        return;
      }
      
      await chrome.storage.local.set({
        capturedSlides: this.capturedSlides,
        currentDeck: this.currentDeck
      });
    } catch (error) {
      console.error('Storage error:', error);
    }
  }

  async loadStoredData() {
    try {
      if (!chrome.storage || !chrome.storage.local) {
        console.warn('Chrome storage API not available, skipping storage load');
        return;
      }
      
      const data = await chrome.storage.local.get(['capturedSlides', 'currentDeck']);
      this.capturedSlides = data.capturedSlides || [];
      this.currentDeck = data.currentDeck || null;
      this.updateContextMenus();
    } catch (error) {
      console.error('Load stored data error:', error);
    }
  }

  async captureSlideFromTab(tab) {
    try {
      if (!chrome.tabs) {
        console.warn('Chrome tabs API not available, skipping tab capture');
        return;
      }
      
      // Send message to content script to capture slide
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'captureSlide'
      });
      
      if (response && response.success) {
        console.log('Slide captured from context menu');
      }
    } catch (error) {
      console.error('Context menu capture error:', error);
    }
  }
}

// Initialize background service worker
try {
  // Check if we're in a Chrome extension environment
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    new MVIntelligenceBackground();
  } else {
    console.error('Not in a Chrome extension environment, skipping initialization');
  }
} catch (error) {
  console.error('Failed to initialize MV Intelligence Background:', error);
}
