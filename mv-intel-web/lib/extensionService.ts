import { CaptureDeckRequest, CaptureSlideRequest } from './types/deckCapture';

export interface ExtensionStatus {
  connected: boolean;
  version?: string;
  lastSeen?: Date;
  capabilities?: string[];
}

export interface ExtensionMessage {
  type: 'capture_deck' | 'capture_slide' | 'status_update' | 'ping' | 'pong';
  payload?: any;
  timestamp: number;
  id: string;
}

export interface CaptureRequest {
  url: string;
  title?: string;
  organizationId: string;
  dealId?: string;
}

export class ExtensionService {
  private static instance: ExtensionService;
  private messageQueue: ExtensionMessage[] = [];
  private listeners: Map<string, (status: ExtensionStatus) => void> = new Map();
  private status: ExtensionStatus = { connected: false };

  static getInstance(): ExtensionService {
    if (!ExtensionService.instance) {
      ExtensionService.instance = new ExtensionService();
    }
    return ExtensionService.instance;
  }

  constructor() {
    // Only setup browser-specific features if we're in the browser
    if (typeof window !== 'undefined') {
      this.setupMessageListener();
      this.setupStatusCheck();
    }
  }

  // Setup message listener for extension communication
  private setupMessageListener() {
    if (typeof window === 'undefined') return;
    
    window.addEventListener('message', (event) => {
      if (event.data && event.data.source === 'mv-extension') {
        this.handleExtensionMessage(event.data);
      }
    });

    // Listen for localStorage changes (extension status updates)
    window.addEventListener('storage', (event) => {
      if (event.key === 'mv-extension-data') {
        this.updateStatusFromStorage();
      }
    });
  }

  // Setup periodic status check
  private setupStatusCheck() {
    if (typeof window === 'undefined') return;
    
    setInterval(() => {
      this.checkExtensionStatus();
    }, 10000); // Check every 10 seconds

    // Cleanup when page is unloaded
    window.addEventListener('beforeunload', () => {
      this.stopPolling();
    });

    // Cleanup when page becomes hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stopPolling();
      } else {
        this.checkExtensionStatus();
      }
    });
  }

  // Handle incoming extension messages
  private handleExtensionMessage(message: any) {
    console.log('ExtensionService: Received message:', message);
    
    switch (message.type) {
      case 'status':
        this.updateStatus(message.payload);
        break;
      case 'capture_complete':
        this.handleCaptureComplete(message.payload);
        break;
      case 'pong':
        this.updateStatus({ connected: true, lastSeen: new Date() });
        break;
      default:
        console.log('ExtensionService: Unknown message type:', message.type);
    }
  }

  // Update extension status
  private updateStatus(statusData: any) {
    this.status = {
      ...this.status,
      ...statusData,
      lastSeen: new Date()
    };
    
    // Store in localStorage for persistence (only in browser)
    if (typeof window !== 'undefined') {
      localStorage.setItem('mv-extension-status', JSON.stringify(this.status));
    }
    
    // Notify listeners
    this.notifyStatusChange();
  }

  // Update status from localStorage
  private updateStatusFromStorage() {
    if (typeof window === 'undefined') return;
    
    try {
      const stored = localStorage.getItem('mv-extension-data');
      if (stored) {
        const data = JSON.parse(stored);
        this.updateStatus(data);
      }
    } catch (error) {
      console.error('Failed to parse extension status from storage:', error);
    }
  }

  // Check extension status
  private async checkExtensionStatus() {
    // Extension status is managed via Supabase, no need to ping
    // Check localStorage for recent activity
    this.updateStatusFromStorage();
  }

  // Send message to extension
  public sendMessage(message: Omit<ExtensionMessage, 'timestamp' | 'id'>) {
    if (typeof window === 'undefined') return;
    
    const fullMessage: ExtensionMessage = {
      ...message,
      timestamp: Date.now(),
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    // Try multiple communication methods
    this.trySendMessage(fullMessage);
    
    // Queue message for retry if needed
    this.messageQueue.push(fullMessage);
  }

  // Try multiple communication methods
  private trySendMessage(message: ExtensionMessage) {
    // Method 1: postMessage to extension
    window.postMessage({
      target: 'mv-extension',
      ...message
    }, '*');

    // Method 2: Try to find extension in DOM
    const extensionElement = document.querySelector('[data-mv-extension]');
    if (extensionElement) {
      extensionElement.dispatchEvent(new CustomEvent('mv-extension-message', {
        detail: message
      }));
    }

    // Method 3: Try global variable
    if ((window as any).mvExtensionService) {
      try {
        (window as any).mvExtensionService.receiveMessage(message);
      } catch (error) {
        console.log('Global extension service not available');
      }
    }
  }

  // Request deck capture from extension
  public async requestDeckCapture(request: CaptureRequest): Promise<boolean> {
    try {
      // Create capture request in Supabase
      const response = await fetch('/api/extension/capture-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: request.url,
          title: request.title,
          organization_id: request.organizationId,
          deal_id: request.dealId,
          user_id: 'current-user' // This would be the actual user ID
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Capture request created:', data);
        return true;
      } else {
        throw new Error(`Failed to create capture request: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to request deck capture:', error);
      throw error;
    }
  }

  // Request slide capture from extension
  public async requestSlideCapture(request: CaptureRequest): Promise<boolean> {
    if (!this.status.connected) {
      throw new Error('Extension not connected');
    }

    // Slide capture is handled via Supabase capture requests
    // No need to send direct messages to extension
    console.log('Slide capture request handled via Supabase');
    return true;
  }

  // Handle capture completion
  private async handleCaptureComplete(payload: any) {
    try {
      // Upload captured content to our API
      const response = await fetch('/api/deck-capture/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Deck capture completed:', result);
        
        // Capture completed successfully
        console.log('Deck capture completed successfully:', result);
      } else {
        throw new Error(`Upload failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to process capture:', error);
      
      // Capture failed
      console.error('Deck capture failed:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  // Get current extension status
  public getStatus(): ExtensionStatus {
    return { ...this.status };
  }

  // Subscribe to status changes
  public onStatusChange(callback: (status: ExtensionStatus) => void): () => void {
    const id = `status_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.listeners.set(id, callback);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(id);
    };
  }

  // Notify status change to listeners
  private notifyStatusChange() {
    this.listeners.forEach(callback => {
      try {
        callback(this.status);
      } catch (error) {
        console.error('Error in status change callback:', error);
      }
    });
  }

  // Check if extension is available
  public isExtensionAvailable(): boolean {
    return this.status.connected;
  }

  // Get extension capabilities
  public getCapabilities(): string[] {
    return this.status.capabilities || [];
  }

  // Force status refresh
  public async refreshStatus(): Promise<void> {
    try {
      // Get extension status from Supabase
      const response = await fetch('/api/extension/status');
      
      if (response.ok) {
        const data = await response.json();
        this.status.connected = data.data?.connected || false;
        this.status.lastSeen = data.data?.last_seen ? new Date(data.data.last_seen) : undefined;
        this.status.version = data.data?.version;
        this.status.capabilities = data.data?.capabilities || [];
        this.updateStatus(this.status);
        
        // Start polling when extension is connected
        if (this.status.connected) {
          await this.startPolling();
        }
      } else {
        this.status.connected = false;
        this.updateStatus({ connected: false });
        await this.stopPolling();
      }
    } catch (error) {
      console.warn('Extension status check failed:', error);
      this.status.connected = false;
      this.updateStatus({ connected: false });
      await this.stopPolling();
    }
  }

  // Start polling for capture requests
  public async startPolling(): Promise<void> {
    try {
      // Extension polling is handled automatically by the extension via Supabase
      // No need to send Chrome messages
      console.log('Extension polling managed by extension service worker');
    } catch (error) {
      console.warn('Failed to start extension polling:', error);
    }
  }

  // Stop polling for capture requests
  public async stopPolling(): Promise<void> {
    try {
      // Extension polling is handled automatically by the extension via Supabase
      // No need to send Chrome messages
      console.log('Extension polling managed by extension service worker');
    } catch (error) {
      console.warn('Failed to stop extension polling:', error);
    }
  }
}

// Export singleton instance
export const extensionService = ExtensionService.getInstance();
