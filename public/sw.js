const CACHE_NAME = 'mind-map-tasks-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-maskable.svg'
];

const isDev = self.location.hostname.includes('localhost') || 
              self.location.hostname.includes('127.0.0.1') || 
              self.location.hostname.includes('run.app');

// Install Event
self.addEventListener('install', (event) => {
  if (isDev) {
    console.log('[Service Worker] Running in development environment, skipping assets caching.');
    self.skipWaiting();
    return;
  }
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching App Shell...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  // Always skip caching in development or preview to prevent out of date files and blank screens
  if (isDev) {
    return;
  }

  // Only handle HTTP/HTTPS, skip other schemes like chrome-extension
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch new version in background to update cache (stale-while-revalidate)
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(() => { /* Ignore background update failures offline */ });
        return cachedResponse;
      }

      // Fallback to network
      return fetch(event.request).then((networkResponse) => {
        const url = new URL(event.request.url);
        if (
          networkResponse.status === 200 &&
          (url.pathname.includes('/src/') ||
           url.pathname.endsWith('.js') ||
           url.pathname.endsWith('.css') ||
           url.pathname.endsWith('.png') ||
           url.pathname.endsWith('.svg') ||
           url.pathname.endsWith('.woff2'))
        ) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch((err) => {
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/');
        }
        throw err;
      });
    })
  );
});

// Notification Click Event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Focus existing open browser windows or open a new one
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
