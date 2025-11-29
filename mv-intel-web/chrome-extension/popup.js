// MV Intelligence - Popup Script
class MVIntelligencePopup {
  constructor() {
    this.init();
  }

  init() {
    this.bindEvents();
    this.loadStatus();
    this.startStatusUpdates();
  }

  bindEvents() {
    // Capture button
    document.getElementById('capture-btn').addEventListener('click', () => {
      this.captureCurrentSlide();
    });

    // Upload button
    document.getElementById('upload-btn').addEventListener('click', () => {
      this.triggerFileUpload();
    });

    // File input change
    document.getElementById('file-input').addEventListener('change', (e) => {
      this.handleFileUpload(e.target.files[0]);
    });

    // Compile button
    document.getElementById('compile-btn').addEventListener('click', () => {
      this.compileDeck();
    });

    // Push to Affinity button
    document.getElementById('push-btn').addEventListener('click', () => {
      this.pushToAffinity();
    });

    // Clear button
    document.getElementById('clear-btn').addEventListener('click', () => {
      this.clearAll();
    });

    // Dashboard link
    document.getElementById('dashboard-link').addEventListener('click', (e) => {
      e.preventDefault();
      this.openDashboard();
    });
  }

  async loadStatus() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getDeckStatus'
      });

      this.updateUI(response);
    } catch (error) {
      console.error('Failed to load status:', error);
      this.showError('Failed to load status');
    }
  }

  startStatusUpdates() {
    // Update status every 2 seconds
    setInterval(() => {
      this.loadStatus();
    }, 2000);
  }

  updateUI(data) {
    const { deck, slides } = data;
    
    // Update slide count
    const slideCountEl = document.getElementById('slide-count');
    slideCountEl.textContent = slides.length;
    
    // Update button states
    const compileBtn = document.getElementById('compile-btn');
    const pushBtn = document.getElementById('push-btn');
    
    compileBtn.disabled = slides.length === 0;
    pushBtn.disabled = !deck;
    
    // Update deck status
    const deckStatusEl = document.getElementById('deck-status');
    const deckTitleEl = document.getElementById('deck-title');
    const deckMetaEl = document.getElementById('deck-meta');
    
    if (deck) {
      deckStatusEl.style.display = 'block';
      deckTitleEl.textContent = deck.metadata?.title || 'Untitled Deck';
      deckMetaEl.textContent = `${slides.length} slides • ${this.formatDate(deck.created_at)}`;
    } else {
      deckStatusEl.style.display = 'none';
    }
    
    // Update slide list
    this.updateSlideList(slides);
  }

  updateSlideList(slides) {
    const slideListEl = document.getElementById('slide-list');
    
    if (slides.length === 0) {
      slideListEl.style.display = 'none';
      return;
    }
    
    slideListEl.style.display = 'block';
    slideListEl.innerHTML = '';
    
    slides.forEach((slide, index) => {
      const slideItem = document.createElement('div');
      slideItem.className = 'slide-item';
      
      slideItem.innerHTML = `
        <div class="slide-title">${slide.title || `Slide ${index + 1}`}</div>
        <div class="slide-meta">
          ${slide.type} • ${this.formatDate(slide.timestamp)}
        </div>
      `;
      
      slideListEl.appendChild(slideItem);
    });
  }

  async captureCurrentSlide() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        this.showError('No active tab found');
        return;
      }
      
      // Check if content script is available
      try {
        // Send message to content script to capture slide
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'captureSlide'
        });
        
        if (response && response.success) {
          this.showSuccess('Slide captured successfully!');
          this.loadStatus(); // Refresh status
        } else {
          this.showError('Failed to capture slide');
        }
      } catch (contentScriptError) {
        // Content script not available, show helpful error
        if (contentScriptError.message.includes('Receiving end does not exist')) {
          this.showError('Extension not active on this page. Try refreshing or navigating to Figma/Notion/Google Docs.');
        } else {
          this.showError('Failed to capture slide: ' + contentScriptError.message);
        }
      }
      
    } catch (error) {
      console.error('Capture error:', error);
      this.showError('Failed to capture slide');
    }
  }

  async compileDeck() {
    try {
      this.showLoading('Compiling deck...');
      
      const response = await chrome.runtime.sendMessage({
        action: 'compileDeck'
      });
      
      if (response && response.success) {
        this.showSuccess('Deck compiled successfully!');
        this.loadStatus(); // Refresh status
      } else {
        this.showError(response?.error || 'Failed to compile deck');
      }
      
    } catch (error) {
      console.error('Compile error:', error);
      this.showError('Failed to compile deck');
    }
  }

  async pushToAffinity() {
    try {
      this.showLoading('Pushing to Affinity...');
      
      const response = await chrome.runtime.sendMessage({
        action: 'pushToAffinity'
      });
      
      if (response && response.success) {
        this.showSuccess('Successfully pushed to Affinity!');
        this.loadStatus(); // Refresh status
      } else {
        this.showError(response?.error || 'Failed to push to Affinity');
      }
      
    } catch (error) {
      console.error('Affinity push error:', error);
      this.showError('Failed to push to Affinity');
    }
  }

  async clearAll() {
    try {
      if (confirm('Are you sure you want to clear all captured slides?')) {
        this.showLoading('Clearing...');
        
        // Clear local storage
        await chrome.storage.local.clear();
        
        // Refresh status
        this.loadStatus();
        
        this.showSuccess('All slides cleared');
      }
    } catch (error) {
      console.error('Clear error:', error);
      this.showError('Failed to clear slides');
    }
  }

  triggerFileUpload() {
    document.getElementById('file-input').click();
  }

  async handleFileUpload(file) {
    if (!file) return;
    
    try {
      this.showLoading(`Processing ${file.name}...`);
      
      // Convert file to base64 for processing
      const base64Data = await this.fileToBase64(file);
      
      // Send to background script for processing
      const response = await chrome.runtime.sendMessage({
        action: 'uploadFile',
        data: {
          name: file.name,
          type: file.type,
          size: file.size,
          data: base64Data
        }
      });
      
      if (response && response.success) {
        this.showSuccess(`File ${file.name} uploaded successfully!`);
        this.loadStatus(); // Refresh status
      } else {
        this.showError(response?.error || 'Failed to upload file');
      }
      
    } catch (error) {
      console.error('File upload error:', error);
      this.showError('Failed to upload file');
    }
  }

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  }

  openDashboard() {
    // Open the MV Intelligence dashboard in a new tab
    chrome.tabs.create({
      url: 'https://your-dashboard-url.com'
    });
  }

  formatDate(dateString) {
    if (!dateString) return 'Unknown';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString();
    } catch {
      return 'Unknown';
    }
  }

  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  showError(message) {
    this.showNotification(message, 'error');
  }

  showLoading(message) {
    this.showNotification(message, 'loading');
  }

  showNotification(message, type) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Add styles
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: ${type === 'success' ? '#4BB37A' : type === 'error' ? '#E25555' : '#D1B172'};
      color: ${type === 'success' || type === 'error' ? '#FFFFFF' : '#0B0B0C'};
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new MVIntelligencePopup();
});
