// Service Worker minimal - juste pour maintenir la session iOS active
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
// Pas de cache - laisse tout passer au réseau
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request));
});
