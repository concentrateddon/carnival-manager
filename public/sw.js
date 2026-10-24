// Offline support: pre-cache the whole app on install, then serve from cache.
// Bump VERSION (and APP_VERSION in js/app.js) whenever any file below changes.
const VERSION = '1.0.0';
const CACHE = `carnival-manager-${VERSION}`;

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/tickets.js',
  'js/nfc.js',
  'js/pricing.js',
  'js/store.js',
  'js/sim.js',
  'js/feedback.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    // ignoreSearch so index.html?sim=1 and the like still hit the cached page
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)),
  );
});
