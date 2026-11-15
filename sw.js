// Service worker: guarda la app para abrirla sin conexión. Los datos (Dropbox) nunca pasan por aquí.
const VERSION = 'otm-1.0.0';
const SHELL = [
  './', 'index.html', 'app.css', 'manifest.webmanifest', 'config.js',
  'js/app.js', 'js/sync.js', 'js/dropbox.js',
  'lib/ops.js', 'lib/util.js', 'lib/pack.js', 'lib/crypto.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Red primero para la app (así se actualiza sola al publicar) y caché si no hay conexión.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const isPage = e.request.mode === 'navigate';
  e.respondWith((async () => {
    try {
      const res = await fetch(e.request);
      if (res.ok) {
        const c = await caches.open(VERSION);
        c.put(isPage ? './' : e.request, res.clone());
      }
      return res;
    } catch {
      return (await caches.match(isPage ? './' : e.request, { ignoreSearch: isPage })) || Response.error();
    }
  })());
});
