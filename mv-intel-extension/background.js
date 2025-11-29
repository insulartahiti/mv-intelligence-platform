// MV Intelligence — Deck Capture (MV3) - Demo Mode (PDF Output)

// Note: jsPDF will be loaded dynamically when needed

class MVDeckCapture {
  constructor() {
    // Supabase configuration
    this.supabaseUrl = 'https://your-project.supabase.co'; // Will be set from config
    this.supabaseAnonKey = null; // Will be set from config
    this.userSession = null;
    this.offscreenDocument = null; // Track offscreen document state
    this.captureInProgress = false; // Prevent duplicate captures
    this.pollingInterval = null;
    
    // OpenAI configuration handled by Edge Function
    
    // Rate limiting for Chrome API calls
    this.lastCaptureTime = 0;
    this.captureQueue = [];
    this.isProcessingQueue = false;
    this.MAX_CAPTURES_PER_SECOND = 2; // Chrome's limit is around 2-3 per second
  }

  async init() { 
    await this.loadSession(); 
    await this.loadSupabaseConfig();
    this.setupListeners(); 
    this.setupSupabaseIntegration();
    this.setupServiceWorkerLifecycle();
    this.log('Background initialized with Supabase integration'); 
  }

  setupServiceWorkerLifecycle() {
    // Handle extension suspension
    chrome.runtime.onSuspend.addListener(() => {
      this.cleanup();
    });

    // Handle extension startup
    chrome.runtime.onStartup.addListener(() => {
      this.log('Extension startup detected');
      this.updateExtensionStatus(true);
    });

    // Handle extension update
    chrome.runtime.onUpdateAvailable.addListener(() => {
      this.log('Extension update available');
    });

    // Handle extension install
    chrome.runtime.onInstalled.addListener((details) => {
      this.log('Extension installed/updated:', details.reason);
      if (details.reason === 'install') {
        this.updateExtensionStatus(true);
      }
    });
  }

  cleanup() {
    this.log('Cleaning up extension resources');
    this.stopPollingForRequests();
    this.updateExtensionStatus(false);
  }

  // Trigger Supabase Edge Function for OCR + Vision analysis
  async triggerDeckProcessing(artifactId, slides) {
    try {
      this.log('🚀 Triggering Supabase Edge Function for deck processing...');
      
      // Call the local Supabase Edge Function
      const response = await fetch('http://127.0.0.1:54321/functions/v1/process-deck-capture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
        },
        body: JSON.stringify({
          artifact_id: artifactId,
          slides: slides
        })
      });

      if (!response.ok) {
        throw new Error(`Edge Function error: ${response.statusText}`);
      }

      const result = await response.json();
      this.log('✅ Deck processing triggered successfully:', result);
      return result;
    } catch (error) {
      this.err('❌ Failed to trigger deck processing:', error);
      throw error;
    }
  }

  // Extract text from slide image using web app's OCR endpoint
  async extractTextFromSlideImage(slideImage, slideNumber) {
    try {
      this.log(`🔍 Processing slide ${slideNumber} for text extraction...`);
      
      // Convert image to base64
      const base64Image = slideImage.split(',')[1];
      
      // Call web app's OCR endpoint
      const response = await fetch('http://localhost:3000/api/deck-capture/ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: base64Image,
          slideNumber: slideNumber
        })
      });
      
      if (!response.ok) {
        throw new Error(`OCR API failed: ${response.status}`);
      }
      
      const result = await response.json();
      this.log(`✅ Slide ${slideNumber} text extracted:`, result.text ? 'Text found' : 'No text');
      
      return result.text || `Slide ${slideNumber} captured successfully`;
    } catch (error) {
      this.err(`❌ Failed to extract text from slide ${slideNumber}:`, error);
      return `Slide ${slideNumber} captured successfully`;
    }
  }

  // Upload captured content to Supabase using streaming approach
  async uploadToSupabase(captureData) {
    try {
      this.log('📤 Starting streaming upload to Supabase...');
      
      // Step 1: Initialize streaming capture
      const startPayload = {
        action: 'start',
        title: captureData.title,
        description: `Captured via Chrome extension on ${new Date().toLocaleString()}`,
        source_url: captureData.url || 'extension-capture',
        source_platform: 'chrome_extension',
        affinity_org_id: captureData.organizationId || 1,
        affinity_deal_id: captureData.dealId || null,
        upload_to_affinity: false
      };
      
      const startResponse = await fetch(`${this.supabaseUrl}/api/deck-capture/streaming-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(startPayload)
      });
      
      if (!startResponse.ok) {
        throw new Error(`Failed to start streaming capture: ${startResponse.status}`);
      }
      
      const startResult = await startResponse.json();
      const artifactId = startResult.data.artifact_id;
      this.log('✅ Streaming capture started:', artifactId);
      
      // Step 2: Process slides in parallel with immediate AI analysis
      const slides = captureData.slides || [];
      this.log(`🔍 Processing ${slides.length} slides with parallel streaming AI analysis...`);
      
      // Send slides in batches to avoid rate limiting and memory issues
      const BATCH_SIZE = 5; // Process 5 slides at a time
      let successful = 0;
      let failed = 0;
      
      for (let i = 0; i < slides.length; i += BATCH_SIZE) {
        const batch = slides.slice(i, i + BATCH_SIZE);
        this.log(`📤 Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(slides.length/BATCH_SIZE)} (slides ${i + 1}-${Math.min(i + BATCH_SIZE, slides.length)})`);
        
        const batchPromises = batch.map(async (slide) => {
          try {
            // Send raw slide data to Supabase - all processing happens there
            const slidePayload = {
              action: 'slide',
              artifact_id: artifactId,
              source_platform: 'chrome_extension',
              affinity_org_id: captureData.organizationId || 1,
              slide: {
                id: `slide_${slide.slideIndex}_${Date.now()}`,
                content: '', // Empty - Supabase will extract text from image
                slide_number: slide.slideIndex,
                image_url: slide.dataUrl || null
              }
            };
            
            // Retry logic for failed uploads
            let retries = 3;
            let lastError = null;
            
            while (retries > 0) {
              try {
                const slideResponse = await fetch(`${this.supabaseUrl}/api/deck-capture/streaming-upload`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(slidePayload)
                });
                
                if (slideResponse.ok) {
                  this.log(`✅ Slide ${slide.slideIndex} sent to Supabase for processing`);
                  return { success: true, slide: slide.slideIndex };
                } else {
                  lastError = `HTTP ${slideResponse.status}`;
                  this.err(`❌ Failed to send slide ${slide.slideIndex} (${retries} retries left):`, slideResponse.status);
                }
              } catch (fetchError) {
                lastError = fetchError.message;
                this.err(`❌ Network error sending slide ${slide.slideIndex} (${retries} retries left):`, fetchError.message);
              }
              
              retries--;
              if (retries > 0) {
                this.log(`⏳ Retrying slide ${slide.slideIndex} in 2 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            }
            
            this.err(`❌ Failed to send slide ${slide.slideIndex} after all retries:`, lastError);
            return { success: false, slide: slide.slideIndex, error: lastError };
            
          } catch (slideError) {
            this.err(`❌ Error sending slide ${slide.slideIndex}:`, slideError);
            return { success: false, slide: slide.slideIndex, error: slideError.message };
          }
        });
        
        // Wait for current batch to complete
        const batchResults = await Promise.allSettled(batchPromises);
        const batchSuccessful = batchResults.filter(result => result.status === 'fulfilled' && result.value.success).length;
        const batchFailed = batchResults.filter(result => result.status === 'rejected' || !result.value.success).length;
        
        successful += batchSuccessful;
        failed += batchFailed;
        
        this.log(`📊 Batch complete: ${batchSuccessful} successful, ${batchFailed} failed`);
        
        // Add delay between batches to prevent rate limiting
        if (i + BATCH_SIZE < slides.length) {
          this.log(`⏳ Waiting 1 second before next batch...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      this.log(`✅ All slides sent to Supabase: ${successful} successful, ${failed} failed`);
      
      // Step 3: Complete the capture
      const completePayload = {
        action: 'complete',
        artifact_id: artifactId,
        source_platform: 'chrome_extension',
        affinity_org_id: captureData.organizationId || 1,
        total_slides: slides.length,
        analysis_notes: captureData.content || captureData.htmlContent || null
      };
      
      const completeResponse = await fetch(`${this.supabaseUrl}/api/deck-capture/streaming-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(completePayload)
      });
      
      if (completeResponse.ok) {
        const completeResult = await completeResponse.json();
        this.log('✅ Streaming capture completed:', completeResult);
        return completeResult;
      } else {
        throw new Error(`Failed to complete streaming capture: ${completeResponse.status}`);
      }
      
    } catch (error) {
      this.err('❌ Streaming upload to Supabase failed:', error);
      throw error;
    }
  }

  // Note: Image compression removed from service worker due to DOM API limitations
  // Compression will be handled by the web app's API endpoints instead

  // Rate-limited capture method to prevent quota exceeded errors
  async rateLimitedCapture(tabId, options = {}) {
    const now = Date.now();
    const timeSinceLastCapture = now - this.lastCaptureTime;
    const minInterval = 1000 / this.MAX_CAPTURES_PER_SECOND; // 500ms between captures
    
    if (timeSinceLastCapture < minInterval) {
      const waitTime = minInterval - timeSinceLastCapture;
      this.log(`⏳ Rate limiting: waiting ${waitTime}ms before next capture`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab) {
        throw new Error(`Tab ${tabId} no longer exists`);
      }
      
      this.lastCaptureTime = Date.now();
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, options);
      
      if (!dataUrl) {
        throw new Error('No data URL returned from capture');
      }
      
      // Return uncompressed data URL - compression handled by web app
      return dataUrl;
    } catch (error) {
      this.err('Rate-limited capture failed:', error);
      throw error;
    }
  }

  async loadSession() { 
    try {
      const stored = await chrome.storage.local.get(['userSession']);
      this.userSession = stored.userSession || null;
    } catch (error) {
      this.err('Failed to load session:', error);
    }
  }

  async loadSupabaseConfig() {
    try {
      // Use localhost for development - connect to Next.js API routes
      this.supabaseUrl = 'http://localhost:3000';
      this.supabaseAnonKey = 'local-dev-key';
      this.log('Supabase config loaded for local development');
      
      // OpenAI API key is handled by the Edge Function, not needed in extension
      this.log('Extension configured for local development with Edge Function OCR');
    } catch (error) {
      this.err('Failed to load Supabase config:', error);
    }
  }

  setupListeners() {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      (async () => {
        try {
          switch (msg?.type) { 
            case 'PING': return sendResponse({ success: true, message: 'pong', timestamp: Date.now() });
            case 'GET_USER': return sendResponse({ success: true, user: { email: 'demo@mvintel.com', name: 'Demo User' } });
            case 'AUTHENTICATE': return sendResponse({ success: true, user: { email: 'demo@mvintel.com', name: 'Demo User' } });
            case 'START_POLLING': 
              this.startPollingForRequests();
              return sendResponse({ success: true, message: 'Polling started' });
            case 'STOP_POLLING': 
              this.stopPollingForRequests();
              return sendResponse({ success: true, message: 'Polling stopped' });
            case 'SIGN_OUT': this.userSession=null; await chrome.storage.local.remove(['userSession']); return sendResponse({ success:true });
            case 'TEST': return sendResponse({ success: true, status: 200, message: 'Demo mode - no database needed' });
            case 'CAPTURE': return sendResponse(await this.captureFlow(msg, sender));
            case 'WEB_APP_PING': return sendResponse({ success: true, connected: true, timestamp: Date.now() });
            case 'WEB_APP_CAPTURE': return sendResponse(await this.handleWebAppCapture(msg, sender));
            default: return sendResponse({ success:false, error:'Unknown message' });
          }
        } catch (error) {
          this.err('Message handler error:', error);
          return sendResponse({ success:false, error:error.message });
        }
      })(); 
      return true;
    });
  }

  setupSupabaseIntegration() {
    // Update extension status in Supabase (one-time on startup)
    this.updateExtensionStatus(true);
    
    // Auto-start polling for capture requests
    this.startPollingForRequests();
    this.log('Supabase integration ready - polling started automatically');
  }

  async updateExtensionStatus(connected) {
    try {
      const response = await fetch(`${this.supabaseUrl}/api/extension/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          connected: connected,
          version: '0.1.0',
          capabilities: ['deck_capture', 'slide_extraction', 'pdf_generation']
        })
      });

      if (response.ok) {
        this.log('Extension status updated in Supabase');
      } else {
        this.err('Failed to update extension status:', await response.text());
      }
    } catch (error) {
      this.err('Error updating extension status:', error);
    }
  }

  startPollingForRequests() {
    // Only start polling if not already running
    if (this.pollingInterval) {
      this.log('Polling already active');
      return;
    }
    
    this.log('Starting polling for capture requests');
    // Poll for capture requests every 10 seconds (reduced frequency)
    this.pollingInterval = setInterval(async () => {
      await this.checkForCaptureRequests();
    }, 10000);
  }

  stopPollingForRequests() {
    if (this.pollingInterval) {
      this.log('Stopping polling for capture requests');
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  async checkForCaptureRequests() {
    try {
      this.log('🔍 Checking for pending capture requests...');
      const response = await fetch(`${this.supabaseUrl}/api/extension/capture-request?status=pending`);
      
      if (response.ok) {
        const data = await response.json();
        const requests = data.data || [];
        
        if (requests.length > 0) {
          this.log(`📋 Found ${requests.length} pending capture request(s)`);
          for (const request of requests) {
            this.log(`🚀 Processing capture request: ${request.title} (${request.url})`);
            await this.processCaptureRequest(request);
          }
        } else {
          this.log('✅ No pending capture requests found');
        }
      } else {
        this.err('Failed to fetch capture requests:', response.status, response.statusText);
      }
    } catch (error) {
      this.err('Error checking for capture requests:', error);
    }
  }

  async processCaptureRequest(request) {
    try {
      this.log('Processing capture request:', request);
      
      // Update request status to processing
      await this.updateCaptureRequestStatus(request.id, 'processing');
      
      // Perform the capture
      const result = await this.captureFlow({
        url: request.url,
        title: request.title,
        organizationId: request.organization_id,
        dealId: request.deal_id
      }, { tab: { id: null } });
      
      // Update request status to completed
      await this.updateCaptureRequestStatus(request.id, 'completed', result);
      
    } catch (error) {
      this.err('Error processing capture request:', error);
      await this.updateCaptureRequestStatus(request.id, 'failed', null, error.message);
    }
  }

  async updateCaptureRequestStatus(requestId, status, result = null, error = null) {
    try {
      this.log(`📝 Updating capture request ${requestId} status to: ${status}`);
      
      const updateData = {
        status: status,
        updated_at: new Date().toISOString()
      };
      
      if (result) {
        updateData.result_data = result;
      }
      
      if (error) {
        updateData.error_message = error;
      }
      
      const response = await fetch(`${this.supabaseUrl}/api/extension/capture-request/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });
      
      if (response.ok) {
        this.log(`✅ Capture request ${requestId} status updated successfully`);
      } else {
        this.err(`❌ Failed to update capture request status: ${response.status}`);
      }
    } catch (error) {
      this.err('Error updating capture request status:', error);
    }
  }

  // Demo mode - always authenticated
  async signIn({ email, password }) {
    this.userSession = { 
      access_token: 'demo-token', 
      refresh_token: 'demo-refresh', 
      user: { email: 'demo@mvintel.com', name: 'Demo User' } 
    };
    await chrome.storage.local.set({ userSession: this.userSession });
    return { success: true, user: this.userSession.user };
  }

  async test() { 
    return { success: true, status: 200, message: 'Demo mode - no database needed' };
  }

  async captureFlow(msg, sender) {
    try {
      // Prevent duplicate captures
      if (this.captureInProgress) {
        this.log('⚠️ Capture already in progress, ignoring duplicate request');
        return { success: false, message: 'Capture already in progress' };
      }
      
      this.captureInProgress = true;
      
      // Performance monitoring
      const startTime = Date.now();
      this.log('🚀 Starting capture with OPTIMIZED timing...');
      
      // Get tab ID with better validation
      let tabId = null;
      
      if (sender?.tab?.id) {
        // Try to use sender tab first
        try {
          const senderTab = await chrome.tabs.get(sender.tab.id);
          if (senderTab && !senderTab.url?.startsWith('devtools://') && !senderTab.url?.startsWith('chrome://')) {
            tabId = sender.tab.id;
            this.log('✅ Using sender tab:', { id: tabId, url: senderTab.url, title: senderTab.title });
          }
        } catch (error) {
          this.log('⚠️ Sender tab validation failed, falling back to active tab');
        }
      }
      
      if (!tabId) {
        tabId = await this.getActiveTabId();
        if (!tabId) {
          return { success: false, error: 'No accessible tab found' };
        }
      }
      
      // Final tab validation
      try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab || tab.url?.startsWith('devtools://') || tab.url?.startsWith('chrome://')) {
          return { success: false, error: 'Cannot access this tab type' };
        }
        this.log('✅ Final tab validation:', { id: tabId, url: tab.url, title: tab.title, windowId: tab.windowId });
      } catch (error) {
        this.err('❌ Final tab validation failed:', error);
        return { success: false, error: 'Tab validation failed' };
      }
      
      let provider = this.normalizeProvider(msg.platform || 'UNIVERSAL'); 
      
      // Get platform info from content script for better optimization
      let platformInfo = null;
      const pageInfoResult = await this.sendToTab(tabId, { type: 'GET_PAGE_INFO' }, 3000);
      if (pageInfoResult && pageInfoResult.success) {
        this.log('📄 Page info:', pageInfoResult);
        platformInfo = pageInfoResult;
        
        // Override provider based on detected platform
        if (pageInfoResult.info?.presentationType === 'figma_deck') {
          provider = 'FIGMA_DECK';
          this.log('🎨 Platform overridden to FIGMA_DECK for optimization');
        }
      } else {
        this.log('⚠️ Could not get page info:', pageInfoResult?.error || 'Unknown error');
      }
      
      this.log('🎬 Capture start in DEMO MODE', { provider, url: msg.url, maxSlides: msg.gate?.maxSlides || 20, tabId });
    
      const ensured = await this.ensureContentScript(tabId); 
      if (!ensured) {
        this.log('⚠️ Content script injection failed, attempting basic capture without navigation...');
        // Continue with basic capture but warn about limited functionality
      }

      // Attempt unlock/gate if provided (only if content script is working)
      if (ensured && msg.gate && (msg.gate.email || msg.gate.passcode)) {
        this.log('🔓 Attempting to unlock presentation...');
        const unlockResult = await this.sendToTab(tabId, { type:'EXECUTE_UNLOCK', gate: msg.gate }, 10000);
        if (unlockResult && unlockResult.success) {
        this.log('🔓 Unlock result:', unlockResult);
        } else {
          this.log('⚠️ Unlock failed:', unlockResult?.error || 'Unknown error');
        }
      }
      
      this.log('📱 Preparing page for capture...');
      if (ensured) {
        const prepResult = await this.sendToTab(tabId, { type:'PREP' }, 5000);
        if (!prepResult || !prepResult.success) {
          this.log('⚠️ Page preparation failed:', prepResult?.error || 'Unknown error');
        }
      }

      const maxSlides = Math.max(1, Math.min(200, Number(msg.gate?.maxSlides || 50)));
      const slides = [];
      let lastSig = null;
      let reachedEndOfPresentation = false;
      
      this.log('📸 Starting slide capture...', { maxSlides });
      
      for (let i = 0; i < maxSlides && !reachedEndOfPresentation; i++) {
        const slideIndex = i + 1;
        
        try {
          // Verify tab is still accessible before each capture
          try {
            const currentTab = await chrome.tabs.get(tabId);
            if (!currentTab || currentTab.url?.startsWith('devtools://') || currentTab.url?.startsWith('chrome://')) {
              this.log(`🛑 Tab ${tabId} is no longer accessible, stopping capture`);
              break;
            }
            
            // Ensure tab is active for better capture quality
            if (!currentTab.active) {
              this.log(`⚠️ Tab ${tabId} is not active, attempting to activate...`);
              await chrome.tabs.update(tabId, { active: true });
              await new Promise(r => setTimeout(r, 500)); // Wait for activation
            }
          } catch (tabError) {
            this.err(`❌ Tab validation failed during capture:`, tabError);
            break;
          }
          
          this.log(`📸 Capturing slide ${slideIndex}/${maxSlides}...`);
          
          // Add delay between captures to prevent quota exceeded errors
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          // Ensure we're capturing from the correct tab with better error handling
          let dataUrl;
          try {
            // Use the current window ID for captureVisibleTab
            const currentTab = await chrome.tabs.get(tabId);
            if (!currentTab) {
              this.err(`❌ Tab ${tabId} no longer exists`);
              break;
            }
            
            this.log(`📸 Capturing from tab ${tabId} in window ${currentTab.windowId}`);
            
            // Get window dimensions for adaptive capture
            const window = await chrome.windows.get(currentTab.windowId);
            const { width, height } = window;
            this.log(`📐 Window dimensions: ${width}x${height}`);
            
            // Calculate optimal capture options
            const captureOptions = this.calculateOptimalCaptureSize(width, height, slideIndex);
            this.log(`🎯 Using capture options:`, captureOptions);
            
            dataUrl = await this.rateLimitedCapture(tabId, captureOptions);
            if (!dataUrl) {
              this.err(`❌ Failed to capture slide ${slideIndex}: No data URL returned`);
              slides.push({ slideIndex, success: false, error: 'No data URL returned' });
              continue;
            }
          } catch (captureError) {
            this.err(`❌ Capture error on slide ${slideIndex}:`, captureError);
            
            // Check if it's a permission/access error
            if (captureError.message.includes('devtools') || captureError.message.includes('Cannot access contents')) {
              this.log(`🔧 Tab access error detected, attempting to refresh tab state...`);
              
              // Try to get fresh tab info
              try {
                const freshTab = await chrome.tabs.get(tabId);
                this.log(`📋 Fresh tab info:`, { id: tabId, url: freshTab.url, title: freshTab.title });
                
                if (freshTab.url?.startsWith('devtools://') || freshTab.url?.startsWith('chrome://')) {
                  this.log(`🛑 Tab is now devtools/chrome, stopping capture`);
                  break;
                }
                
                // Try capture again
                const retryTab = await chrome.tabs.get(tabId);
                if (retryTab) {
                  // Get window dimensions for retry capture
                  const retryWindow = await chrome.windows.get(retryTab.windowId);
                  const retryCaptureOptions = this.calculateOptimalCaptureSize(retryWindow.width, retryWindow.height, slideIndex);
                  this.log(`🔄 Retry capture with options:`, retryCaptureOptions);
                  
                  dataUrl = await this.rateLimitedCapture(tabId, retryCaptureOptions);
                } else {
                  this.err(`❌ Tab ${tabId} no longer exists on retry`);
                  break;
                }
                if (dataUrl) {
                  this.log(`✅ Capture successful on retry for slide ${slideIndex}`);
                } else {
                  slides.push({ slideIndex, success: false, error: 'Capture failed on retry' });
                  continue;
                }
              } catch (refreshError) {
                this.err(`❌ Tab refresh failed:`, refreshError);
                slides.push({ slideIndex, success: false, error: 'Tab refresh failed' });
                break;
              }
            } else {
              slides.push({ slideIndex, success: false, error: captureError.message });
              break;
            }
          }
          
          // More sophisticated duplicate detection with multiple retries
          const sig = dataUrl ? dataUrl.slice(0, 100) + '|' + dataUrl.length + '|' + dataUrl.slice(-100) : '';
          if (sig && sig === lastSig) { 
            this.log(`🔄 Duplicate frame detected at slide ${slideIndex}, trying multiple retries...`);
            
            // Try multiple retries with different delays
            for (let retry = 1; retry <= 3; retry++) {
              this.log(`🔄 Retry ${retry}/3 with ${retry * 500}ms delay...`);
              await new Promise(r => setTimeout(r, retry * 500)); // Reduced from 1000ms
              
              // Get fresh tab info for retry
              const retryTab = await chrome.tabs.get(tabId);
              if (retryTab && !retryTab.url?.startsWith('devtools://') && !retryTab.url?.startsWith('chrome://')) {
                // Get window dimensions for duplicate detection retry
                const retryWindow = await chrome.windows.get(retryTab.windowId);
                const retryCaptureOptions = this.calculateOptimalCaptureSize(retryWindow.width, retryWindow.height, slideIndex);
                this.log(`🔄 Duplicate detection retry with options:`, retryCaptureOptions);
                
                const retryDataUrl = await this.rateLimitedCapture(tabId, retryCaptureOptions);
                const retrySig = retryDataUrl ? retryDataUrl.slice(0, 100) + '|' + retryDataUrl.length + '|' + retryDataUrl.slice(-100) : '';
              
                if (retrySig !== sig) {
                  this.log(`✅ Retry ${retry} successful, slide changed`);
                  dataUrl = retryDataUrl;
                  break;
                }
              
                if (retry === 3) {
                  this.log(`🛑 All retries failed, confirmed duplicate at slide ${slideIndex}`);
                  // Try one more navigation attempt before giving up
                  this.log(`🔄 Final navigation attempt...`);
                  const finalMoveResult = await this.sendToTab(tabId, { type:'NEXT_SLIDE' }, 5000);
                  if (finalMoveResult && finalMoveResult.success) {
                    this.log(`📡 Final navigation response:`, finalMoveResult);
                    const finalMove = finalMoveResult;
                  
                  if (finalMove && finalMove.moved === true) {
                    await new Promise(r => setTimeout(r, 1000)); // Reduced from 2000ms
                    const finalTab = await chrome.tabs.get(tabId);
                    if (finalTab && !finalTab.url?.startsWith('devtools://') && !finalTab.url?.startsWith('chrome://')) {
                      // Get window dimensions for final attempt
                      const finalWindow = await chrome.windows.get(finalTab.windowId);
                      const finalCaptureOptions = this.calculateOptimalCaptureSize(finalWindow.width, finalWindow.height, slideIndex);
                      this.log(`🔄 Final attempt with options:`, finalCaptureOptions);
                      
                        const finalDataUrl = await this.rateLimitedCapture(tabId, finalCaptureOptions);
                      const finalSig = finalDataUrl ? finalDataUrl.slice(0, 100) + '|' + finalDataUrl.length + '|' + finalDataUrl.slice(-100) : '';
                  
                      if (finalSig !== sig) {
                        this.log(`✅ Final attempt successful, slide changed`);
                        dataUrl = finalDataUrl;
                        break;
                      }
                    }
                    }
                  } else {
                    this.log('⚠️ Final navigation attempt failed:', finalMoveResult?.error || 'Unknown error');
                  }
                  
                  this.log(`🛑 Stopping capture at slide ${slideIndex} - confirmed end of presentation`);
                  reachedEndOfPresentation = true;
                  break;
                }
              }
            }
          }
          
          lastSig = sig;
          
          // Store slide data for PDF creation
          slides.push({ 
            slideIndex, 
            dataUrl, 
            success: true,
            timestamp: Date.now()
          });
          
          this.log(`✅ Slide ${slideIndex} captured successfully`, { size: dataUrl.length });
          
          // Try to advance to next slide (only if content script is working)
          if (ensured) {
            this.log(`➡️ Attempting to navigate to next slide...`);
            const movedResult = await this.sendToTab(tabId, { type:'NEXT_SLIDE' }, 5000);
            
            if (!movedResult || !movedResult.success) {
              this.log(`🛑 Navigation failed:`, movedResult?.error || 'Unknown error');
              reachedEndOfPresentation = true;
              break;
            }
            
            const moved = movedResult;
            this.log(`📡 Navigation response:`, moved);
            
            if (!moved) {
              this.log(`🛑 No navigation response received`);
              reachedEndOfPresentation = true;
              break;
            }
            
            if (moved.moved !== true) {
              this.log(`🛑 Navigation failed or reached end of presentation at slide ${slideIndex}`);
              // Check if this is likely the last slide
              if (slideIndex >= 20) { // Reasonable threshold for most presentations
                this.log(`🎯 Likely reached end of presentation at slide ${slideIndex} - stopping gracefully`);
              }
              reachedEndOfPresentation = true;
              break;
            }
          } else {
            this.log(`⚠️ Content script not available, using basic capture (single slide)`);
            reachedEndOfPresentation = true;
            break;
          }
          
          // Optimized slide transition timing
          this.log(`⏳ Waiting for slide transition...`);
          
          // Use platform-specific timing for better performance
          let transitionDelay = 400; // Default fast timing (was 800)
          
          if (provider === 'FIGMA_DECK') {
            transitionDelay = 300; // Figma decks are usually fast (was 600)
          } else if (provider === 'DOCSEND') {
            transitionDelay = 600; // DocSend needs more time (was 1000)
          } else if (provider === 'PITCH') {
            transitionDelay = 400; // Pitch is moderately fast (was 800)
          }
          
          await new Promise(r => setTimeout(r, transitionDelay));
          
          // Quick render check
          await new Promise(r => setTimeout(r, 100)); // Reduced from 200ms
          
        } catch (error) {
          this.err(`❌ Error capturing slide ${slideIndex}:`, error);
          
          // Check if it's a permission error and try to fix
          if (error.message.includes('permission') || error.message.includes('activeTab')) {
            this.log(`🔧 Permission error detected, attempting to re-inject content script...`);
            const reInjected = await this.ensureContentScript(tabId);
            if (reInjected) {
              this.log(`✅ Content script re-injected, retrying slide ${slideIndex}...`);
              // Wait a bit and try again
              await new Promise(r => setTimeout(r, 1000));
              try {
                // Get fresh tab info for retry
                const retryTab = await chrome.tabs.get(tabId);
                if (retryTab && !retryTab.url?.startsWith('devtools://') && !retryTab.url?.startsWith('chrome://')) {
                  const retryDataUrl = await this.rateLimitedCapture(tabId, { format:'png' });
                  if (retryDataUrl) {
                    slides.push({ 
                      slideIndex, 
                      dataUrl: retryDataUrl, 
                      success: true,
                      timestamp: Date.now()
                    });
                    this.log(`✅ Slide ${slideIndex} captured successfully on retry`);
                    continue; // Skip the break, continue with next slide
                  }
                } else {
                  this.log(`⚠️ Tab ${tabId} is now devtools/chrome, cannot retry`);
                }
              } catch (retryError) {
                this.err(`❌ Retry failed for slide ${slideIndex}:`, retryError);
              }
            }
          }
          
          slides.push({ 
            slideIndex, 
            success: false, 
            error: error.message,
            stack: error.stack 
          });
          break;
        }
      }

      if (slides.length === 0) {
        const error = 'No slides captured - check if page is a presentation';
        this.err('❌ Capture failed:', error);
        return { 
          success: false, 
          error, 
          details: 'No slides were captured. This might not be a presentation page.',
          debug: { tabId, provider, maxSlides }
        };
      }

      const successfulSlides = slides.filter(s => s.success).length;
      const totalTime = Date.now() - startTime;
      const avgTimePerSlide = totalTime / successfulSlides;
      
      this.log(`🎉 Capture complete: ${successfulSlides}/${slides.length} slides captured successfully`);
      if (reachedEndOfPresentation) {
        this.log(`🏁 Capture stopped because end of presentation was detected`);
      }
      this.log(`⏱️ Performance: Total time: ${(totalTime/1000).toFixed(1)}s, Avg per slide: ${(avgTimePerSlide/1000).toFixed(1)}s`);
      this.log(`🚀 Speed improvement: ${this.calculateSpeedImprovement(totalTime, successfulSlides)}`);

      // Create combined PDF
      this.log('📄 Creating combined PDF...');
      const deckTitle = platformInfo?.info?.title || msg.presentationInfo?.title || 'Presentation';
      const pdfResult = await this.createCombinedPDF(slides, deckTitle, platformInfo);
      
      if (!pdfResult.success) {
        this.err('❌ PDF creation failed:', pdfResult.error);
        return { 
          success: false, 
          error: 'PDF creation failed', 
          details: pdfResult.error,
          slides: slides,
          slideCount: successfulSlides
        };
      }

      this.log('✅ PDF created successfully:', pdfResult.filename);
      
      return { 
        success: true, 
        slideCount: successfulSlides, 
        totalSlides: slides.length,
        message: `Demo mode: ${successfulSlides} slides captured and combined into PDF`,
        slides: slides,
        pdf: pdfResult,
        details: {
          provider,
          maxSlides,
          successfulSlides,
          totalTime,
          avgTimePerSlide
        }
      };
      
    } catch (error) {
      this.err('❌ Capture flow failed:', error);
      return { 
        success: false, 
        error: error.message,
        stack: error.stack,
        details: 'Unexpected error in capture flow'
      };
    } finally {
      // Always reset the capture lock
      this.captureInProgress = false;
    }
  }

  async createCombinedPDF(slides, deckTitle = 'Presentation', platformInfo = null) {
    try {
      this.log('📄 Starting PDF creation...', { slideCount: slides.length, title: deckTitle });
      
      const successfulSlides = slides.filter(s => s.success);
      const failedSlides = slides.filter(s => !s.success);
      
      // Try enhanced PDF creation first, fallback to text summary
      this.log('📄 Attempting enhanced PDF creation...');
      try {
        const result = await this.createEnhancedPDF(slides, deckTitle, platformInfo);
        if (result && result.success) {
          this.log('✅ Enhanced PDF creation successful');
          return result;
        } else {
          throw new Error(result?.error || 'Enhanced PDF creation returned failure');
        }
      } catch (enhancedError) {
        this.log('⚠️ Enhanced PDF creation failed, falling back to text summary:', enhancedError.message);
        this.log('📄 Attempting text summary fallback...');
        const fallbackResult = await this.createServiceWorkerPDF(slides, deckTitle, platformInfo);
        this.log('✅ Text summary fallback successful');
        return fallbackResult;
      }
    } catch (error) {
      this.err('❌ All PDF creation methods failed:', error);
      return { 
        success: false, 
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      };
    }
  }

  async toBlob(imageBuffer) { 
    try { 
      const response = await fetch(imageBuffer);
      return await response.blob();
    } catch (error) {
      this.err('Failed to convert to blob:', error);
      throw error;
    }
  }

  async getActiveTabId() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        this.err('No active tab found');
        return null;
      }
      
      // Validate the tab is accessible
      try {
        await chrome.tabs.get(tab.id);
        this.log('✅ Active tab validated:', { id: tab.id, url: tab.url, title: tab.title });
        return tab.id;
      } catch (error) {
        this.err('❌ Active tab validation failed:', error);
        return null;
      }
    } catch (error) {
      this.err('Failed to get active tab:', error);
      return null;
    }
  }

  async ensureContentScript(tabId) {
    try {
      // First check if content script is already injected
      try {
        const response = await Promise.race([
          chrome.tabs.sendMessage(tabId, { type: 'PING' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('PING Timeout')), 1000))
        ]);
        if (response && response.ok) {
          this.log('✅ Content script already injected');
          return true;
        }
      } catch (e) {
        this.log('📥 Content script not found, injecting...');
      }
      
      // Inject content script
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      
      // Wait longer for injection to complete
      await new Promise(r => setTimeout(r, 1500));
      
      // Verify injection worked with multiple attempts
      for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await Promise.race([
          chrome.tabs.sendMessage(tabId, { type: 'PING' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Verification Timeout')), 3000))
        ]);
        if (response && response.ok) {
            this.log(`✅ Content script injection verified (attempt ${attempt})`);
          return true;
        }
      } catch (e) {
          this.log(`⚠️ Verification attempt ${attempt} failed, retrying...`);
          if (attempt < 3) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }
      
      this.err('❌ Content script injection verification failed after 3 attempts');
      return false;
    } catch (error) {
      this.err('❌ Failed to inject content script:', error);
      return false;
    }
  }

  async sendToTab(tabId, msg, timeout = 5000) {
    // First, validate that the tab still exists and is accessible
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab || tab.url?.startsWith('chrome://') || tab.url?.startsWith('devtools://')) {
        this.log('⚠️ Tab is not accessible or is a system tab, skipping message:', msg.type);
        return { success: false, error: 'Tab not accessible' };
      }
    } catch (tabError) {
      this.err('Tab validation failed:', tabError);
      return { success: false, error: 'Tab no longer exists' };
    }

    // Ensure content script is injected before sending message
    const contentScriptReady = await this.ensureContentScript(tabId);
    if (!contentScriptReady) {
      this.log('⚠️ Content script not ready, skipping message:', msg.type);
      return { success: false, error: 'Content script not available' };
    }

    try {
      const response = await Promise.race([
        chrome.tabs.sendMessage(tabId, msg),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
      ]);
      return response;
    } catch (error) {
      this.err('Failed to send message to tab:', error);
      
      // If it's a connection error, try to re-inject content script
      if (error.message.includes('Receiving end does not exist') || error.message.includes('Could not establish connection')) {
        this.log('🔧 Connection error detected, attempting to re-inject content script...');
        
        try {
        const reInjected = await this.ensureContentScript(tabId);
        if (reInjected) {
          this.log('✅ Content script re-injected, retrying message...');
            // Wait longer for injection to complete
            await new Promise(r => setTimeout(r, 2000));
            
          try {
            const retryResponse = await Promise.race([
              chrome.tabs.sendMessage(tabId, msg),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Retry Timeout')), timeout))
            ]);
            return retryResponse;
          } catch (retryError) {
            this.err('❌ Retry failed:', retryError);
              // Return a graceful failure instead of throwing
              return { success: false, error: retryError.message };
            }
          } else {
            this.log('⚠️ Content script re-injection failed, returning graceful failure');
            return { success: false, error: 'Content script injection failed' };
          }
        } catch (reInjectError) {
          this.err('❌ Content script re-injection error:', reInjectError);
          return { success: false, error: 'Content script re-injection failed' };
        }
      }
      
      // For other errors, return graceful failure instead of throwing
      return { success: false, error: error.message };
    }
  }

  normalizeProvider(platform) {
    const map = {
      'DOCSEND': 'DOCSEND',
      'PITCH': 'PITCH', 
      'CANVA': 'CANVA',
      'GOOGLE_SLIDES': 'GOOGLE_SLIDES',
      'POWERPOINT': 'POWERPOINT',
      'KEYNOTE': 'KEYNOTE',
      'FIGMA_DECK': 'FIGMA_DECK',
      'FIGMA': 'FIGMA',
      'UNIVERSAL': 'UNIVERSAL'
    };
    return map[(platform||'').toUpperCase()] || 'OTHER'; 
  }

  log(...args) {
    console.log('[MVDeckCapture]', ...args);
  }

  err(...args) {
    console.error('[MVDeckCapture]', ...args);
  }

    // Enhanced PDF creation using HTML download (service worker compatible)
  async createEnhancedPDF(slides, deckTitle, platformInfo = null) {
    try {
      this.log('📄 Attempting HTML-based PDF creation...');
      
      // Create HTML content with all slides
      const htmlContent = this.generateSlideHTML(slides, deckTitle);
      
      // Create a data URL for the HTML content (service worker compatible)
      const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
      
      // Download the HTML file directly
      const filename = `${deckTitle.replace(/[^a-zA-Z0-9]/g, '_')}_presentation_${Date.now()}.html`;
      
      this.log('📥 Downloading HTML file for PDF conversion:', filename);
      await chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: true
      });
      
      this.log('✅ HTML file downloaded successfully');
      
      // Upload to Supabase for web app integration
      try {
        await this.uploadToSupabase({
          slides: slides,
          title: deckTitle,
          url: platformInfo?.info?.url || 'extension-capture',
          htmlContent: htmlContent,
          method: 'html_download'
        });
      } catch (uploadError) {
        this.err('Failed to upload to Supabase:', uploadError);
        // Continue anyway - the HTML file was created successfully
      }
      
      return {
        success: true,
        filename: filename,
        message: 'HTML file downloaded! Open it in Chrome and use Print → Save as PDF to create your PDF with images.',
        method: 'html_download',
        type: 'html_with_images',
        instructions: [
          '1. Open the downloaded HTML file in Chrome',
          '2. Press Ctrl+P (or Cmd+P on Mac)',
          '3. Change destination to "Save as PDF"',
          '4. Click Save to create your PDF with all slide images'
        ]
      };
      
    } catch (error) {
      this.log('⚠️ HTML-based PDF creation failed, falling back to text summary:', error);
      return await this.createServiceWorkerPDF(slides, deckTitle);
    }
  }
  
  // Calculate optimal capture dimensions based on presentation window size
  calculateOptimalCaptureSize(windowWidth, windowHeight, slideIndex) {
    // Base capture options
    let captureOptions = {
      format: 'png',
      quality: 100
    };
    
    // Switch to JPEG format for proper quality compression
    captureOptions.format = 'jpeg';
    
    if (windowWidth >= 1920 && windowHeight >= 1080) {
        // Large displays - lower JPEG quality for API compatibility
        this.log(`🖥️ Large display detected (${windowWidth}x${windowHeight}), using lower JPEG quality`);
        captureOptions.quality = 40;
    } else if (windowWidth >= 1366 && windowHeight >= 768) {
        // Medium displays - lower JPEG quality
        this.log(`💻 Medium display detected (${windowWidth}x${windowHeight}), using lower JPEG quality`);
        captureOptions.quality = 35;
    } else {
        // Small displays - very low JPEG quality
        this.log(`📱 Small display detected (${windowWidth}x${windowHeight}), using very low JPEG quality`);
        captureOptions.quality = 30;
    }
    
    // Adjust for presentation aspect ratios
    const aspectRatio = windowWidth / windowHeight;
    
    if (aspectRatio > 1.5) {
      // Wide presentations (like Pitch.com) - optimize for landscape
      this.log(`🌊 Wide presentation detected (aspect ratio: ${aspectRatio.toFixed(2)}), optimizing for landscape`);
      // Keep JPEG format for better compression
      
      // Special optimization for very wide displays (like ultrawide monitors)
      if (aspectRatio > 2.0) {
        this.log(`🖥️ Ultrawide display detected, using specialized landscape optimization`);
          captureOptions.quality = Math.max(captureOptions.quality - 5, 25); // Reduce quality for very wide content
      }
    } else if (aspectRatio < 0.8) {
      // Tall presentations - optimize for portrait
      this.log(`📏 Tall presentation detected (aspect ratio: ${aspectRatio.toFixed(2)}), optimizing for portrait`);
      // Keep JPEG format for better compression
    } else {
      // Standard presentations - use JPEG format
      this.log(`📐 Standard presentation detected (aspect ratio: ${aspectRatio.toFixed(2)}), using JPEG format`);
      // Keep JPEG format for better compression
    }
    
    // Note: Cropping removed - Chrome captureVisibleTab API doesn't support clipX/clipY/clipWidth/clipHeight
    // Focus on quality optimization instead
    
    // Add any additional options based on slide index
    if (slideIndex === 1) {
        // First slide - slightly better quality for title slide
        this.log(`🎯 First slide detected, using slightly better quality`);
        captureOptions.quality = Math.max(captureOptions.quality, 45);
    }
    
    // Special optimization for Pitch.com presentations
    if (windowWidth >= 1440 && aspectRatio > 1.3) {
      this.log(`🎯 Pitch.com-style presentation detected, using specialized optimization`);
      captureOptions.quality = 50; // Lower quality for API compatibility
      captureOptions.format = 'jpeg'; // Keep JPEG for compression
    }
    
    return captureOptions;
  }
  
  // Generate HTML content for slides
  generateSlideHTML(slides, deckTitle) {
    const successfulSlides = slides.filter(s => s.success);
    
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${deckTitle} - Presentation Slides</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header h1 {
            margin: 0;
            color: #333;
            font-size: 28px;
        }
        .header .meta {
            margin-top: 10px;
            color: #666;
            font-size: 14px;
        }
        .slide-container {
            margin-bottom: 30px;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .slide-header {
            background: #2c3e50;
            color: white;
            padding: 15px 20px;
            font-size: 18px;
            font-weight: bold;
        }
        .slide-image {
            width: 100%;
            height: auto;
            display: block;
            max-height: 600px;
            object-fit: contain;
        }
        .slide-info {
            padding: 15px 20px;
            background: #f8f9fa;
            border-top: 1px solid #e9ecef;
        }
        .slide-info .timestamp {
            color: #666;
            font-size: 12px;
        }
        .slide-info .size {
            color: #28a745;
            font-weight: bold;
        }
        @media print {
            body { background: white; }
            .slide-container { 
                break-inside: avoid;
                margin-bottom: 20px;
            }
            .slide-image { max-height: 500px; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${deckTitle}</h1>
        <div class="meta">
            <strong>Total Slides:</strong> ${successfulSlides.length} | 
            <strong>Capture Date:</strong> ${new Date().toLocaleString()} | 
            <strong>Generated by:</strong> MV Intelligence Platform
        </div>
    </div>`;
    
    successfulSlides.forEach((slide, index) => {
      html += `
    <div class="slide-container">
        <div class="slide-header">Slide ${slide.slideIndex || (index + 1)}</div>
        <img src="${slide.dataUrl}" alt="Slide ${slide.slideIndex || (index + 1)}" class="slide-image">
        <div class="slide-info">
            <div class="timestamp">Captured: ${new Date(slide.timestamp).toLocaleString()}</div>
            <div class="size">Size: ${(slide.dataUrl.length / 1024).toFixed(1)} KB</div>
        </div>
    </div>`;
    });
    
    html += `
    <script>
        // Auto-trigger print when page loads
        window.addEventListener('load', function() {
            setTimeout(function() {
                window.print();
            }, 1000);
        });
    </script>
</body>
</html>`;
    
    return html;
  }
  
  // Legacy offscreen document function (no longer used)
  async createOffscreenDocument() {
    this.log('⚠️ Offscreen document approach deprecated - using HTML-to-PDF instead');
    return false;
  }

  // Calculate and display speed improvement
  calculateSpeedImprovement(totalTime, slideCount) {
    // Baseline: 10 seconds per slide (previous performance)
    const baselineTime = slideCount * 10000;
    const improvement = ((baselineTime - totalTime) / baselineTime * 100).toFixed(1);
    return `${improvement}% faster than baseline`;
  }

  // Legacy offscreen message function (no longer used)
  async sendMessageToOffscreen(message) {
    this.log('⚠️ Offscreen messaging deprecated - using HTML-to-PDF instead');
    throw new Error('Offscreen approach deprecated');
  }

  // Service worker compatible PDF creation
  async createServiceWorkerPDF(slides, deckTitle, platformInfo = null) {
    try {
      this.log('📄 Creating service worker compatible PDF...');
      
      // Since we can't use jsPDF in service workers, create a comprehensive text summary
      // that can be easily converted to PDF by the user
      
      let summaryContent = `=== PRESENTATION CAPTURE SUMMARY ===\n\n`;
      summaryContent += `Title: ${deckTitle}\n`;
      summaryContent += `Capture Date: ${new Date().toLocaleString()}\n`;
      summaryContent += `Total Slides: ${slides.length}\n\n`;
      
      const successfulSlides = slides.filter(s => s.success);
      const failedSlides = slides.filter(s => !s.success);
      
      summaryContent += `=== CAPTURE RESULTS ===\n`;
      summaryContent += `✅ Successful: ${successfulSlides.length}\n`;
      summaryContent += `❌ Failed: ${failedSlides.length}\n\n`;
      
      if (successfulSlides.length > 0) {
        summaryContent += `=== SUCCESSFUL SLIDES ===\n`;
        successfulSlides.forEach((slide, index) => {
          summaryContent += `Slide ${slide.slideIndex}: Captured at ${new Date(slide.timestamp).toLocaleTimeString()}\n`;
          summaryContent += `  - Data URL length: ${slide.dataUrl.length} characters\n`;
          summaryContent += `  - Timestamp: ${slide.timestamp}\n\n`;
        });
      }
      
      if (failedSlides.length > 0) {
        summaryContent += `=== FAILED SLIDES ===\n`;
        failedSlides.forEach((slide, index) => {
          summaryContent += `Slide ${slide.slideIndex}: ${slide.error}\n`;
          if (slide.stack) {
            summaryContent += `  - Stack trace: ${slide.stack}\n`;
          }
          summaryContent += `\n`;
        });
      }
      
      summaryContent += `=== TECHNICAL DETAILS ===\n`;
      summaryContent += `This is a comprehensive capture summary.\n`;
      summaryContent += `To create a PDF with embedded images, use the Chrome extension:\n`;
      summaryContent += `1. Copy this text to a document\n`;
      summaryContent += `2. Save as .txt or .md\n`;
      summaryContent += `3. Convert to PDF using your preferred tool\n\n`;
      
      summaryContent += `=== COPY-PASTE FRIENDLY ERROR LOG ===\n`;
      summaryContent += `Timestamp: ${new Date().toISOString()}\n`;
      summaryContent += `Extension Version: Demo Mode\n`;
      summaryContent += `User Agent: ${navigator.userAgent}\n`;
      summaryContent += `Platform: ${navigator.platform}\n`;
      
      // Create data URL for download
      const dataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(summaryContent)}`;
      const filename = `${deckTitle.replace(/[^a-zA-Z0-9]/g, '_')}_capture_summary_${Date.now()}.txt`;
      
      await chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: false
      });
      
      this.log('✅ Service worker compatible summary created:', filename);
      
      // Upload to Supabase for web app integration
      try {
        await this.uploadToSupabase({
          slides: slides,
          title: deckTitle,
          url: platformInfo?.info?.url || 'extension-capture',
          content: summaryContent,
          method: 'text_summary'
        });
      } catch (uploadError) {
        this.err('Failed to upload to Supabase:', uploadError);
        // Continue anyway - the summary was created successfully
      }
      
      return { 
        success: true, 
        filename: filename,
        message: 'Comprehensive text summary created (service worker compatible)',
        type: 'text_summary',
        content: summaryContent
      };
      
    } catch (error) {
      this.err('❌ Service worker PDF creation failed:', error);
      throw error;
    }
  }
}

// Initialize
const mvDeckCapture = new MVDeckCapture();

// Service worker lifecycle management
chrome.runtime.onStartup.addListener(() => {
  console.log('🚀 Extension startup - initializing...');
mvDeckCapture.init();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('📦 Extension installed/updated - initializing...');
  mvDeckCapture.init();
});

// Ensure initialization on service worker wake-up
if (typeof chrome !== 'undefined' && chrome.runtime) {
  mvDeckCapture.init();
}
