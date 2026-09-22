// Build replaces the version and complete asset list, including PDF.js resources.
const VERSION = '__VERSION__';
const ASSETS = __ASSETS__;
const PREFIX = 'shogi-boardreader:' + self.registration.scope + ':';
const CACHE = PREFIX + VERSION;
const urls = ASSETS.map(path => new URL(path, self.registration.scope).href);
const allowed = new Set(urls);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Small batches avoid hundreds of concurrent iPhone downloads.
    try {
      for (let i = 0; i < urls.length; i += 12) {
        await cache.addAll(urls.slice(i, i + 12).map(url => new Request(url, {cache:'reload'})));
      }
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  const key = event.request.mode === 'navigate'
    ? new URL('index.html', self.registration.scope).href : url.href;
  if (!allowed.has(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(key)) || fetch(event.request);
  })());
});
