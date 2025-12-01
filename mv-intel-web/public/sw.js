// Service Worker for MV Intelligence Platform
const CACHE_NAME = 'mv-intel-v2.0.5';
const STATIC_CACHE = 'mv-intel-static-v2.0.5';
const DYNAMIC_CACHE = 'mv-intel-dynamic-v2.0.5';

const urlsToCache = [
  '/',
  '/knowledge-graph',
  '/manifest.json',
  '/offline.html'
];

const staticAssets = [
  '/mv-icons-24.png',
  '/mv-icons-48.png',
  '/mv-icons-72.png',
  '/mv-icons-96.png',
  '/mv-icons-192.png',
  '/mv-icons-512.png'
];

// Helper: Cache assets individually (resilient to failures)
async function cacheAssetsIndividually(cache, urls) {
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, { cache: 'reload' }); // Force fresh fetch
        if (response.ok) {
          await cache.put(url, response);
          return { url, status: 'cached' };
        }
        return { url, status: 'failed', reason: response.status };
      } catch (error) {
        return { url, status: 'failed', reason: error.message };
      }
    })
  );
  
  const cached = results.filter(r => r.value?.status === 'cached').length;
  const failed = results.filter(r => r.value?.status === 'failed').length;
  console.log(`[SW] Cached ${cached}/${urls.length} assets (${failed} failed)`);
  return results;
}

// Install event
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v2.0.5...');
  
  event.waitUntil(
    Promise.all([
      // Cache static assets (resilient - won't fail if some assets 404)
      caches.open(STATIC_CACHE).then((cache) => {
        console.log('[SW] Caching static assets...');
        return cacheAssetsIndividually(cache, staticAssets);
      }),
      // Cache essential pages (resilient)
      caches.open(CACHE_NAME).then((cache) => {
        console.log('[SW] Caching essential pages...');
        return cacheAssetsIndividually(cache, urlsToCache);
      })
    ]).then(() => {
      console.log('[SW] Installation complete');
      return self.skipWaiting();
    })
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker v2.0.5...');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && 
                cacheName !== STATIC_CACHE && 
                cacheName !== DYNAMIC_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control of all clients
      self.clients.claim()
    ]).then(() => {
      console.log('[SW] Service worker activated successfully');
    })
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Skip API calls - let them go directly to server
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Skip Next.js internal requests (HMR, static chunks, etc)
  if (url.pathname.startsWith('/_next/') || url.searchParams.has('_rsc')) {
    return;
  }

  // Helper: Network only for specific assets (bypass cache)
  // Fixes "Failed to fetch" for favicon.ico in PWA mode
  if (url.pathname === '/favicon.ico') {
    return;
  }

  event.respondWith(
    handleRequest(request)
  );
});

async function handleRequest(request) {
  const url = new URL(request.url);
  
  try {
    // Static assets - cache first
    if (staticAssets.includes(url.pathname)) {
      return await cacheFirst(request, STATIC_CACHE);
    }
    
    // API calls are now handled directly by the server (not intercepted by SW)
    
    // Pages - network first with fallback
    if (request.headers.get('accept')?.includes('text/html')) {
      return await networkFirst(request, DYNAMIC_CACHE, '/offline.html');
    }
    
    // Other resources - network first
    return await networkFirst(request, DYNAMIC_CACHE);
    
  } catch (error) {
    console.error('[SW] Fetch error:', error);
    
    // Return offline page for navigation requests
    if (request.headers.get('accept')?.includes('text/html')) {
      const offlineResponse = await caches.match('/offline.html');
      if (offlineResponse) {
        return offlineResponse;
      }
    }
    
    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  const networkResponse = await fetch(request);
  if (networkResponse.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, networkResponse.clone());
  }
  
  return networkResponse;
}

async function networkFirst(request, cacheName, fallbackUrl = null) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return fallback if available
    if (fallbackUrl) {
      const fallbackResponse = await caches.match(fallbackUrl);
      if (fallbackResponse) {
        return fallbackResponse;
      }
    }
    
    throw error;
  }
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  console.log('[SW] Performing background sync...');
  // Implement background sync logic here
}

// Push notifications
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/icons/mv-icons-192.png',
      badge: '/icons/mv-icons-72.png',
      vibrate: [100, 50, 100],
      data: data.data || {},
      actions: data.actions || []
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});