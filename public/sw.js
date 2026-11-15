// CarryBee tracker service worker. Required for Chrome's install prompt.
// Network only: live escalation data is never served from cache.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
