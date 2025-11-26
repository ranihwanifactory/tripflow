// Minimal Service Worker to satisfy PWA installation criteria
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Simple pass-through strategy
  // Real offline caching can be implemented here if needed
  event.respondWith(fetch(event.request));
});