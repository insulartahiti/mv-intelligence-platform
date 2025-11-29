'use client';

import { useState, useEffect } from 'react';
import { Card, Button, StatusBadge } from './ui/GlassComponents';
import { Chrome, Download, AlertCircle, CheckCircle, RefreshCw, Info } from 'lucide-react';
import { EXTENSION_CONFIG, checkExtensionHealth } from '../../lib/extensionConfig';

interface ExtensionStatusProps {
  compact?: boolean;
  showActions?: boolean;
  className?: string;
}

export default function ExtensionStatus({ 
  compact = false, 
  showActions = true,
  className = "" 
}: ExtensionStatusProps) {
  const [status, setStatus] = useState<{
    installed: boolean;
    version?: string;
    permissions?: string[];
    lastUpdate?: string;
  }>({ installed: false });
  const [isChecking, setIsChecking] = useState(false);
  const [health, setHealth] = useState<{
    healthy: boolean;
    issues: string[];
    recommendations: string[];
  }>({ healthy: false, issues: [], recommendations: [] });
  const [extensionId, setExtensionId] = useState('cgbjodijdlcigiedlpnooopidjdjjfjn');
  const [customId, setCustomId] = useState('cgbjodijdlcigiedlpnooopidjjfjn');
  const [connectionMethod, setConnectionMethod] = useState<'extension' | 'webapp'>('webapp');

  // Listen for messages from the extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Check if message is from our extension
      if (event.data && event.data.source === 'mv-intel-extension') {
        console.log('📡 Received message from extension:', event.data);
        
        if (event.data.type === 'status') {
          const extensionStatus = event.data.payload;
          setStatus({
            installed: true,
            version: extensionStatus.version || 'Unknown',
            permissions: extensionStatus.permissions || [],
            lastUpdate: new Date().toISOString()
          });
          
          const healthCheck = checkExtensionHealth(extensionStatus);
          setHealth(healthCheck);
          setConnectionMethod('extension');
        }
      }
    };

    // Listen for postMessage from extension
    window.addEventListener('message', handleMessage);
    
    // Also listen for custom events that the extension might dispatch
    const handleCustomEvent = (event: CustomEvent) => {
      if (event.detail && event.detail.source === 'mv-intel-extension') {
        console.log('📡 Received custom event from extension:', event.detail);
        // Handle extension status updates
      }
    };
    
    window.addEventListener('extensionStatus', handleCustomEvent as EventListener);

    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('extensionStatus', handleCustomEvent as EventListener);
    };
  }, []);

  const connectExtension = async () => {
    const targetId = customId || extensionId;
    console.log('🔗 Connecting to extension:', targetId);
    
    try {
      // Use environment variables for configuration
      const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!sbUrl || !sbKey) {
        throw new Error('Supabase configuration missing');
      }

      const response = await chrome.runtime.sendMessage(targetId, { 
        action: 'auth_handshake',
        data: {
          supabaseUrl: sbUrl,
          supabaseKey: sbKey
        }
      });
      
      console.log('🤝 Auth Handshake response:', response);
      
      if (response && response.success) {
        // Show success toast or state update
        const newStatus = { ...status, installed: true, authenticated: true };
        setStatus(newStatus);
        setHealth({ healthy: true, issues: [], recommendations: [] });
      } else {
        throw new Error(response?.error || 'Handshake failed');
      }
    } catch (error) {
      console.error('Connection error:', error);
      alert('Failed to connect extension. Ensure ID is correct and extension is reloaded.');
    }
  };

  const checkExtensionStatus = async () => {
    setIsChecking(true);
    try {
      console.log('🔍 Checking for extension...');
      
      // Check if Chrome APIs are available
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        console.log('⚠️ Chrome APIs not available - this is normal in webapp context');
        
        // Try alternative methods to detect extension
        await checkExtensionViaWebapp();
        return;
      }
      
      // Try to communicate with extension via Chrome APIs
      await checkExtensionViaChrome();
      
    } catch (error) {
      console.log('❌ Extension communication failed:', error);
      setStatus({ installed: false });
      setHealth({ 
        healthy: false, 
        issues: ['Extension communication failed'], 
        recommendations: ['Check if extension is installed and has proper permissions'] 
      });
    } finally {
      setIsChecking(false);
    }
  };

  const checkExtensionViaChrome = async () => {
    const targetId = customId || extensionId;
    console.log('🎯 Trying to communicate with extension ID via Chrome APIs:', targetId);
    
    try {
      const response = await chrome.runtime.sendMessage(targetId, { action: 'ping' });
      console.log('📡 Extension response via Chrome:', response);
      
      if (response && response.version) {
        const newStatus = {
          installed: true,
          version: response.version,
          permissions: response.permissions || [],
          lastUpdate: new Date().toISOString()
        };
        setStatus(newStatus);
        
        const healthCheck = checkExtensionHealth(response);
        setHealth(healthCheck);
        setConnectionMethod('extension');
        
        console.log('✅ Extension detected via Chrome APIs:', newStatus);
      } else {
        throw new Error('Extension responded but no version info');
      }
    } catch (error) {
      throw new Error(`Chrome API communication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const checkExtensionViaWebapp = async () => {
    console.log('🌐 Checking extension via webapp methods...');
    
    // Method 1: Check if extension has injected any content
    const extensionElements = document.querySelectorAll('[data-mv-extension]');
    if (extensionElements.length > 0) {
      console.log('✅ Found extension elements in DOM');
      setStatus({
        installed: true,
        version: 'Detected via DOM',
        permissions: [],
        lastUpdate: new Date().toISOString()
      });
      setHealth({ healthy: true, issues: [], recommendations: [] });
      setConnectionMethod('webapp');
      return;
    }
    
    // Method 2: Check localStorage for extension data
    const extensionData = localStorage.getItem('mv-intel-extension-data');
    if (extensionData) {
      try {
        const data = JSON.parse(extensionData);
        console.log('✅ Found extension data in localStorage:', data);
        setStatus({
          installed: true,
          version: data.version || 'Unknown',
          permissions: data.permissions || [],
          lastUpdate: data.lastUpdate || new Date().toISOString()
        });
        setHealth({ healthy: true, issues: [], recommendations: [] });
        setConnectionMethod('webapp');
        return;
      } catch (error) {
        console.log('⚠️ Failed to parse extension data from localStorage');
      }
    }
    
    // Method 3: Check for extension-specific global variables
    if ((window as any).mvIntelExtension) {
      console.log('✅ Found extension global variable');
      const extData = (window as any).mvIntelExtension;
      setStatus({
        installed: true,
        version: extData.version || 'Unknown',
        permissions: extData.permissions || [],
        lastUpdate: new Date().toISOString()
      });
      setHealth({ healthy: true, issues: [], recommendations: [] });
      setConnectionMethod('webapp');
      return;
    }
    
    // No extension detected
    console.log('❌ No extension detected via webapp methods');
    setStatus({ installed: false });
    setHealth({ 
      healthy: false, 
      issues: ['Extension not detected'], 
      recommendations: [
        'Install the extension from the Extension Management page',
        'Make sure the extension is enabled in Chrome',
        'Check if the extension has injected content into this page'
      ] 
    });
  };

  const downloadExtension = () => {
    window.open('/extension-management', '_blank');
  };

  const findExtensionId = async () => {
    try {
      // Try to get all installed extensions
      if (chrome.management && chrome.management.getAll) {
        const extensions = await chrome.management.getAll();
        const mvExtensions = extensions.filter(ext => 
          ext.name.toLowerCase().includes('mv') || 
          ext.name.toLowerCase().includes('intelligence') ||
          ext.name.toLowerCase().includes('motive')
        );
        
        if (mvExtensions.length > 0) {
          console.log('🔍 Found potential MV extensions:', mvExtensions);
          setCustomId(mvExtensions[0].id);
          return mvExtensions[0].id;
        }
      }
      
      // Fallback: try common extension IDs
      const commonIds = ['cgbjodijdlcigiedlpnooopidjdjjfjn', 'mv-intel-extension', 'mv-intelligence', 'motive-ventures'];
      for (const id of commonIds) {
        try {
          const response = await chrome.runtime.sendMessage(id, { action: 'ping' });
          if (response) {
            console.log('✅ Found extension with ID:', id);
            setCustomId(id);
            return id;
          }
        } catch (e) {
          // Continue to next ID
        }
      }
      
      console.log('❌ No MV extensions found');
      return null;
    } catch (error) {
      console.log('❌ Could not search for extensions:', error);
      return null;
    }
  };

  useEffect(() => {
    // Initial check
    checkExtensionStatus();
  }, []);

  if (compact) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <Chrome className="w-4 h-4 text-onGlass-secondary" />
        <StatusBadge 
          status={status.installed && health.healthy ? 'success' : 'warning'}
        >
          {status.installed ? 'Extension Active' : 'Extension Needed'}
        </StatusBadge>
        {showActions && !status.installed && (
          <Button 
            variant="primary" 
            size="sm" 
            onClick={downloadExtension}
          >
            <Download className="w-3 h-3 mr-1" />
            Install
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card className={`p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <Chrome className="w-5 h-5 text-onGlass-secondary" />
          <h3 className="text-sm font-medium text-onGlass">Extension Status</h3>
        </div>
        <StatusBadge 
          status={status.installed && health.healthy ? 'success' : 'warning'}
        >
          {status.installed ? 'Active' : 'Inactive'}
        </StatusBadge>
      </div>
      
      {status.installed ? (
        <div className="space-y-2 text-sm">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="text-onGlass-secondary">
              Version {status.version}
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            <Info className="w-4 h-4 text-blue-400" />
            <span className="text-onGlass-secondary">
              Connected via {connectionMethod === 'extension' ? 'Chrome APIs' : 'Webapp detection'}
            </span>
          </div>
          
          {!health.healthy && health.issues.length > 0 && (
            <div className="space-y-1">
              {health.issues.map((issue, index) => (
                <div key={index} className="flex items-center space-x-2 text-yellow-400">
                  <AlertCircle className="w-3 h-3" />
                  <span className="text-xs">{issue}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex items-center space-x-2 text-yellow-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-onGlass-secondary">
              Extension not detected
            </span>
          </div>
          <p className="text-xs text-onGlass-muted">
            Install the extension to enable deck capture features
          </p>
        </div>
      )}
      
      {/* Debug Info (only show in development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-3 p-2 bg-white/5 rounded text-xs text-onGlass-muted">
          <div className="font-medium mb-1">Debug Info:</div>
          <div>Extension ID: {customId || extensionId}</div>
          <div>Chrome Runtime: {typeof chrome !== 'undefined' && chrome.runtime ? 'Available' : 'Not Available'}</div>
          <div>Chrome Management: {typeof chrome !== 'undefined' && chrome.management ? 'Available' : 'Not Available'}</div>
          <div className="mt-2 p-2 bg-yellow-500/20 rounded text-yellow-400">
            <strong>Note:</strong> Chrome APIs are only available when running as a Chrome extension. 
            The webapp can't directly communicate with extensions for security reasons.
          </div>
        </div>
      )}
      
      {showActions && (
        <div className="space-y-3 mt-3">
          {/* Custom Extension ID Input */}
          <div className="flex space-x-2">
            <input
              type="text"
              placeholder="Extension ID (optional)"
              value={customId}
              onChange={(e) => setCustomId(e.target.value)}
              className="flex-1 px-3 py-1 text-sm glass rounded border border-white/20 bg-white/5 text-onGlass-secondary"
            />
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={findExtensionId}
              title="Auto-detect extension"
            >
              🔍
            </Button>
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={checkExtensionStatus}
              disabled={isChecking}
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${isChecking ? 'animate-spin' : ''}`} />
              {isChecking ? 'Checking...' : 'Check'}
            </Button>
          </div>
          
          {!status.installed && (
            <Button 
              variant="primary" 
              size="sm" 
              onClick={downloadExtension}
            >
              <Download className="w-3 h-3 mr-1" />
              Install
            </Button>
          )}
          
          {status.installed && (
            <Button 
              variant="primary" 
              size="sm" 
              onClick={connectExtension}
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Connect & Approve
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
