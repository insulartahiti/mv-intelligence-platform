'use client';

import { useEffect } from 'react';

export default function PWAScript() {
  useEffect(() => {
    // Register service worker in both development and production
    // if (process.env.NODE_ENV !== 'production') {
    //   return;
    // }

    // Service Worker Registration
    if ('serviceWorker' in navigator) {
      const registerSW = async () => {
        try {
          // Check if service worker is already registered
          const existingRegistration = await navigator.serviceWorker.getRegistration();
          if (existingRegistration) {
            console.log('[PWA] Service worker already registered');
            return;
          }

          // Register the service worker
          const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
            updateViaCache: 'none'
          });

          console.log('[PWA] Service Worker registered successfully:', registration);

          // Handle service worker updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[PWA] New service worker available');
                }
              });
            }
          });

        } catch (error) {
          console.error('[PWA] Service Worker registration failed:', error);
        }
      };

      registerSW();
    }
  }, []);

  // This component doesn't render anything
  return null;
}
