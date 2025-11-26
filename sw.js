// Service Worker for Smart Bus Tracking - Offline Support
const CACHE_NAME = 'bus-tracker-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/tracker.html',
  '/assets/styles.css',
  '/assets/app.js',
  '/assets/auth.js',
  '/assets/config.js',
  '/assets/supabaseClient.js',
  '/assets/data/routes.json',
  '/assets/images/bus.svg'
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Cache failed for some assets', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: cache-first strategy with network fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Skip non-GET or external requests
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Return cached, but update in background
        fetch(request).then((response) => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
          }
        }).catch(() => {}); // Silent fail for background update
        return cached;
      }

      // Not in cache: fetch from network
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        // Clone and cache successful responses
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, cloned);
        });

        return response;
      }).catch((err) => {
        console.warn('[SW] Fetch failed:', request.url, err);
        // Return offline page or cached fallback
        return caches.match('/index.html');
      });
    })
  );
});
