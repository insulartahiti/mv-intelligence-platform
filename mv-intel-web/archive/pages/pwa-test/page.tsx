'use client';

import { useEffect, useState } from 'react';
import { Card, Button, Panel } from '../components/ui/GlassComponents';
import BrowserTranslucency from '../components/BrowserTranslucency';

export default function PWATestPage() {
  const [pwaStatus, setPwaStatus] = useState({
    isInstalled: false,
    isOnline: true,
    swStatus: 'unknown',
    canInstall: false
  });

  useEffect(() => {
    // Check PWA installation status
    const checkInstallation = () => {
      const isInstalled = window.matchMedia('(display-mode: standalone)').matches || 
                         (window.navigator as any).standalone === true;
      setPwaStatus(prev => ({ ...prev, isInstalled }));
    };

    // Check online status
    const checkOnlineStatus = () => {
      setPwaStatus(prev => ({ ...prev, isOnline: navigator.onLine }));
    };

    // Check service worker status
    const checkSWStatus = async () => {
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.ready;
          if (registration.active) {
            setPwaStatus(prev => ({ ...prev, swStatus: 'active' }));
          } else if (registration.installing) {
            setPwaStatus(prev => ({ ...prev, swStatus: 'installing' }));
          } else if (registration.waiting) {
            setPwaStatus(prev => ({ ...prev, swStatus: 'waiting' }));
          }
        } catch (error) {
          setPwaStatus(prev => ({ ...prev, swStatus: 'error' }));
        }
      }
    };

    // Check if PWA can be installed
    const checkInstallability = () => {
      setPwaStatus(prev => ({ ...prev, canInstall: 'serviceWorker' in navigator }));
    };

    checkInstallation();
    checkOnlineStatus();
    checkSWStatus();
    checkInstallability();

    // Listen for online/offline events
    window.addEventListener('online', checkOnlineStatus);
    window.addEventListener('offline', checkOnlineStatus);

    // Listen for display mode changes
    window.matchMedia('(display-mode: standalone)').addEventListener('change', checkInstallation);

    return () => {
      window.removeEventListener('online', checkOnlineStatus);
      window.removeEventListener('offline', checkOnlineStatus);
      window.matchMedia('(display-mode: standalone)').removeEventListener('change', checkInstallation);
    };
  }, []);

  const testOffline = async () => {
    try {
      const response = await fetch('/api/test-offline');
      if (response.ok) {
        alert('Online: API call successful');
      }
    } catch (error) {
      alert('Offline: API call failed - this is expected when offline');
    }
  };

  const testCache = async () => {
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        alert(`Available caches: ${cacheNames.join(', ')}`);
      } catch (error) {
        alert('Error accessing caches');
      }
    } else {
      alert('Caches API not supported');
    }
  };

  const testNotifications = async () => {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification('MV Intelligence', {
          body: 'PWA notifications are working!',
          icon: '/icons/mv-icons-72.png'
        });
      } else if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          new Notification('MV Intelligence', {
            body: 'PWA notifications are working!',
            icon: '/icons/mv-icons-72.png'
          });
        }
      } else {
        alert('Notification permission denied');
      }
    } else {
      alert('Notifications not supported');
    }
  };

  return (
    <div className="min-h-screen app-backdrop p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-4">PWA Test Page</h1>
          <p className="text-white/80 text-lg">
            Test Progressive Web App features and MV Glass design system
          </p>
        </div>

        {/* PWA Status */}
        <Card>
          <h2 className="text-2xl font-semibold text-white mb-4">PWA Status</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{pwaStatus.isInstalled ? '✅' : '❌'}</div>
              <div className="text-sm text-white/70">Installed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{pwaStatus.isOnline ? '✅' : '❌'}</div>
              <div className="text-sm text-white/70">Online</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{pwaStatus.swStatus === 'active' ? '✅' : '⏳'}</div>
              <div className="text-sm text-white/70">Service Worker</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{pwaStatus.canInstall ? '✅' : '❌'}</div>
              <div className="text-sm text-white/70">Can Install</div>
            </div>
          </div>
        </Card>

        {/* PWA Features Test */}
        <Card>
          <h2 className="text-2xl font-semibold text-white mb-4">PWA Features Test</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button onClick={testOffline} variant="neutral" className="w-full">
              Test Offline
            </Button>
            <Button onClick={testCache} variant="neutral" className="w-full">
              Test Cache
            </Button>
            <Button onClick={testNotifications} variant="neutral" className="w-full">
              Test Notifications
            </Button>
          </div>
        </Card>

        {/* MV Glass Design System Test */}
        <Card>
          <h2 className="text-2xl font-semibold text-white mb-4">MV Glass Design System</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="mv-glass p-4 rounded-lg">
              <h3 className="text-lg font-medium text-white mb-2">MV Glass Component</h3>
              <p className="text-white/70 text-sm">This uses the new .mv-glass class</p>
            </div>
            <div className="glass-dark p-4 rounded-lg">
              <h3 className="text-lg font-medium text-white mb-2">Glass Dark Variant</h3>
              <p className="text-white/70 text-sm">This uses the .glass-dark class</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="primary">Primary</Button>
            <Button variant="neutral">Neutral</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
        </Card>

        {/* Browser Window Translucency Test */}
        <BrowserTranslucency />

        {/* PWA Information */}
        <Card>
          <h2 className="text-2xl font-semibold text-white mb-4">PWA Information</h2>
          <div className="space-y-4 text-white/80">
            <div>
              <h3 className="text-lg font-medium text-white mb-2">What is a PWA?</h3>
              <p className="text-sm">
                Progressive Web Apps (PWAs) are web applications that can be installed on devices and work offline. 
                They provide a native app-like experience while being built with web technologies.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-medium text-white mb-2">Key Features</h3>
              <ul className="text-sm space-y-1 list-disc list-inside">
                <li>Installable on home screen</li>
                <li>Offline functionality</li>
                <li>Push notifications</li>
                <li>App-like experience</li>
                <li>Automatic updates</li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-medium text-white mb-2">MV Glass Design System</h3>
              <p className="text-sm">
                The platform now uses the MV Glass design system, providing consistent glassmorphic components, 
                improved spacing, and browser window translucency effects.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
