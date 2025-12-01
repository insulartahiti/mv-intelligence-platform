'use client';

import { useEffect, useState } from 'react';
import { Button } from './ui/GlassComponents';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function PWAInstaller() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallButton, setShowInstallButton] = useState(false);

  useEffect(() => {
    // Check if PWA is already installed
    const checkInstallation = () => {
      if (window.matchMedia('(display-mode: standalone)').matches || 
          (window.navigator as any).standalone === true) {
        setIsInstalled(true);
        setShowInstallButton(false);
      }
    };

    checkInstallation();

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstallButton(true);
    };

    // Listen for appinstalled event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowInstallButton(false);
      setDeferredPrompt(null);
      
      // Show success message
      if ((window as any).showToast) {
        (window as any).showToast({
          message: 'Motive Intelligence has been installed successfully!',
          type: 'success',
          duration: 5000
        });
      }
    };

    // Listen for display mode changes
    const handleDisplayModeChange = () => {
      checkInstallation();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.matchMedia('(display-mode: standalone)').addEventListener('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.matchMedia('(display-mode: standalone)').removeEventListener('change', handleDisplayModeChange);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      // Show the install prompt
      await deferredPrompt.prompt();
      
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      
      // Clear the deferredPrompt
      setDeferredPrompt(null);
      setShowInstallButton(false);
    } catch (error) {
      console.error('Error showing install prompt:', error);
    }
  };

  const handleUpdateClick = () => {
    // Trigger service worker update
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.update();
      });
    }
  };

  // Don't show anything if PWA is already installed
  if (isInstalled) {
    return null;
  }

  // Don't show install button if no prompt is available
  if (!showInstallButton) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div className="glass border border-white/20 rounded-2xl p-4 shadow-elev3 max-w-sm">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 bg-accent rounded-full flex items-center justify-center">
              <span className="text-onGlass font-bold text-lg">MI</span>
            </div>
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-onGlassDark mb-1">
              Install Motive Intelligence
            </h3>
            <p className="text-xs text-onGlassDarkMuted mb-3">
              Get a native app experience with offline access and desktop shortcuts
            </p>
            
            <div className="flex space-x-2">
              <Button
                onClick={handleInstallClick}
                size="sm"
                className="flex-1"
              >
                Install App
              </Button>
              
              <Button
                onClick={() => setShowInstallButton(false)}
                variant="secondary"
                size="sm"
                className="px-3"
              >
                Later
              </Button>
            </div>
          </div>
          
          <button
            onClick={() => setShowInstallButton(false)}
            className="flex-shrink-0 text-onGlassDarkMuted hover:text-onGlassDark transition-colors duration-sm"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

// PWA Status Component
export function PWAStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [swStatus, setSwStatus] = useState<'active' | 'installing' | 'waiting' | 'redundant'>('waiting');

  useEffect(() => {
    const updateOnlineStatus = () => {
      setIsOnline(navigator.onLine);
    };

    const updateSWStatus = () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((registration) => {
          if (registration.active) {
            setSwStatus('active');
          } else if (registration.installing) {
            setSwStatus('installing');
          } else if (registration.waiting) {
            setSwStatus('waiting');
          }
        });
      }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    
    updateOnlineStatus();
    updateSWStatus();

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  if (isOnline && swStatus === 'active') {
    return null; // Don't show status when everything is working
  }

  return (
    <div className="fixed top-4 left-4 z-50">
      <div className="glass border border-white/20 rounded-xl p-3 shadow-elev2">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${
            isOnline ? 'bg-green-400' : 'bg-red-400'
          }`} />
          <span className="text-xs text-onGlassDark">
            {!isOnline ? 'Offline' : 
             swStatus === 'installing' ? 'Installing...' :
             swStatus === 'waiting' ? 'Waiting...' : 'Ready'}
          </span>
        </div>
      </div>
    </div>
  );
}
