/* Snake service worker — v1.1.0 (PRD §10.5).
 *
 * Strategy:
 *  - navigation: network-first, 3s timeout, fall back to the cached shell
 *  - same-origin GET: cache-first, refresh in the background
 *  - activate: drop every cache that is not the current version
 *
 * Bump CACHE when shipping. The page never reloads itself: it tells the
 * player an update is ready and lets them choose.
 */
const CACHE = 'snake-v1.1.0';

const PRECACHE = [
  './',
  'index.html',
  'css/style.css',
  'js/main.js',
  'js/config.js',
  'js/game.js',
  'js/renderer.js',
  'js/audio.js',
  'js/input.js',
  'js/timestep.js',
  'js/rng.js',
  'js/daily.js',
  'js/copy.js',
  'js/controls.js',
  'js/theme.js',
  'js/pwa.js',
  'manifest.webmanifest',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable-512.png',
  'assets/og.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).catch((error) => {
      console.warn('Precache failed; offline mode is degraded.', error);
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) ?? (await cache.match('index.html'));
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) {
    // Refresh in the background; the player never waits for it.
    fetch(request).then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
    }).catch(() => {});
    return cached;
  }

  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
