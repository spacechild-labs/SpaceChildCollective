/**
 * SpaceChild Research Collective - Service Worker
 * Space Child PWA - Auto-versioned for automatic updates
 */

const VERSION = new Date().getTime();
const APP_NAME = 'spacechild-collective';
const CACHE_NAME = `${APP_NAME}-${VERSION}`;
const RUNTIME_CACHE = `${APP_NAME}-runtime-${VERSION}`;
const IMAGE_CACHE = `${APP_NAME}-images-${VERSION}`;
const API_CACHE = `${APP_NAME}-api-${VERSION}`;
const OFFLINE_URL = '/';

// Assets to cache for offline functionality
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/icon-72x72.png',
  '/icon-96x96.png',
  '/icon-128x128.png',
  '/icon-144x144.png',
  '/icon-152x152.png',
  '/apple-touch-icon.png',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/site.webmanifest',
  '/robots.txt',
  '/humans.txt',
  '/security.txt',
  '/browserconfig.xml'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing SpaceChild service worker');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.log('[SW] Caching static assets');
        
        // Cache files individually to prevent installation failure if one file fails
        const cachePromises = STATIC_ASSETS.map(async (url) => {
          try {
            const response = await fetch(url);
            if (response.ok) {
              await cache.put(url, response);
              console.log('[SW] Cached:', url);
            } else {
              console.warn('[SW] Failed to cache (non-200):', url, response.status);
            }
          } catch (error) {
            console.warn('[SW] Failed to cache:', url, error.message);
          }
        });
        
        // Wait for all cache attempts (but don't fail on individual errors)
        await Promise.allSettled(cachePromises);
        console.log('[SW] Installation complete');
        
        // Force the waiting service worker to become the active service worker
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Critical installation error:', error);
        // Still try to skip waiting even if caching failed
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker with version:', VERSION);
  const currentCaches = [CACHE_NAME, RUNTIME_CACHE, IMAGE_CACHE, API_CACHE];
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete any cache that starts with our app name but isn't current
            if (cacheName.startsWith(APP_NAME) && !currentCaches.includes(cacheName)) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Activation complete');
        // Take control of all open clients
        return self.clients.claim();
      })
      .catch((error) => {
        console.error('[SW] Activation failed:', error);
      })
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip external requests
  if (!request.url.startsWith(self.location.origin)) {
    return;
  }
  
  event.respondWith(
    // Skip cache in development mode - always fetch fresh
    (SKIP_CACHING ? Promise.resolve(null) : caches.match(request))
      .then((response) => {
        // Return cached version if available (only in production)
        if (response && !SKIP_CACHING) {
          console.log('[SW] Serving from cache:', request.url);
          return response;
        }
        
        // Otherwise fetch from network
        console.log('[SW] Fetching from network:', request.url);
        return fetch(request)
          .then((response) => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone the response since it can only be consumed once
            const responseToCache = response.clone();
            
            // Cache the response for future use
            caches.open(CACHE_NAME)
              .then((cache) => {
                console.log('[SW] Caching new response:', request.url);
                cache.put(request, responseToCache);
              });
            
            return response;
          })
          .catch((error) => {
            console.error('[SW] Network request failed:', error);
            
            // Return offline page for navigation requests
            if (request.mode === 'navigate') {
              console.log('[SW] Serving offline page');
              return caches.match(OFFLINE_URL);
            }
            
            // Return a basic error response for other requests
            return new Response('Offline - Please check your connection', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: {
                'Content-Type': 'text/plain'
              }
            });
          });
      })
  );
});

// Push notification event
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  
  const options = {
    body: event.data ? event.data.text() : 'New research collaboration available',
    icon: '/android-chrome-192x192.png',
    badge: '/favicon-32x32.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    },
    actions: [
      {
        action: 'explore',
        title: 'Explore Research',
        icon: '/icon-96x96.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/icon-96x96.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('SpaceChild Research Collective', options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click received');
  
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/dashboard')
    );
  } else if (event.action === 'close') {
    // Notification already closed
  } else {
    // Default action - open the app
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Background sync event
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync event:', event.tag);
  
  if (event.tag === 'background-sync-research') {
    event.waitUntil(
      // Sync research data when back online
      syncResearchData()
    );
  }
});

// Periodic background sync
self.addEventListener('periodicsync', (event) => {
  console.log('[SW] Periodic sync event:', event.tag);
  
  if (event.tag === 'periodic-sync-updates') {
    event.waitUntil(
      // Check for updates periodically
      checkForUpdates()
    );
  }
});

// Helper functions
async function syncResearchData() {
  try {
    // Sync any pending research data
    console.log('[SW] Syncing research data');
    // Implementation would go here
  } catch (error) {
    console.error('[SW] Research sync failed:', error);
  }
}

async function checkForUpdates() {
  try {
    // Check for app updates
    console.log('[SW] Checking for updates');
    // Implementation would go here
  } catch (error) {
    console.error('[SW] Update check failed:', error);
  }
}

// Message event for communication with the app
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[SW] SpaceChild service worker loaded');
