
// Minimal Service Worker to satisfy PWA installation criteria
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
        // Fallback for offline or errors
        return new Response('Offline');
    })
  );
});
