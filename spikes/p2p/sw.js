// Precache the single page so the spike opens with no network (home-screen app, airplane mode).
const CACHE = 'p2p-spike-v1';
const FILES = ['./', './index.html', './manifest.webmanifest'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
