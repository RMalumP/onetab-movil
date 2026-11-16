// Service worker: guarda la app para abrirla sin conexión. Los datos (Dropbox) nunca pasan por aquí.
const VERSION = 'otm-1.3.1';
const SHELL = [
  './', 'index.html', 'app.css', 'manifest.webmanifest', 'config.js',
  'js/app.js', 'js/sync.js', 'js/dropbox.js', 'js/exchange.js', 'js/vimy-gate-check.js',
  'vimy.html', 'js/vimy-gate.js', 'vimy/gate.css',
  'lib/ops.js', 'lib/util.js', 'lib/pack.js', 'lib/crypto.js', 'lib/formats.js', 'lib/reminders.js', 'lib/xfer.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

/* ── «Compartir → OneTab» desde otra app (share_target del manifiesto, POST con archivos) ──
   Se guarda lo compartido en la misma base de datos que usa la app (clave «share») y se abre la app, que lo
   envía a la bandeja de «Archivos» (o, si es un enlace, lo añade a las listas). */
function saveShare(payload) {
  return new Promise((res, rej) => {
    const r = indexedDB.open('onetab-movil', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const t = r.result.transaction('kv', 'readwrite');
      t.objectStore('kv').put(payload, 'share');
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    };
  });
}

// Red primero para la app (así se actualiza sola al publicar) y caché si no hay conexión.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.origin === location.origin && url.pathname.endsWith('/compartir')) {
    e.respondWith((async () => {
      try {
        const f = await e.request.formData();
        const files = f.getAll('files').filter(x => typeof x === 'object' && x && (x.size || x.name));
        await saveShare({ title: String(f.get('share_title') || ''), text: String(f.get('share_text') || ''), url: String(f.get('share_url') || ''), files, at: Date.now() });
      } catch (err) { console.warn('Compartir', err); }
      return Response.redirect(new URL('./?compartido=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Las navegaciones a la app se guardan como './'; vimy.html va aparte (si no, sustituiría a la app en la caché).
  const isPage = e.request.mode === 'navigate' && !url.pathname.endsWith('/vimy.html');
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

// Aviso «Vimy ha terminado»: al tocarlo se abre (o se trae al frente) Vimy.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL('vimy.html', self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = all.find(c => c.url.startsWith(target));
    if (w) return w.focus();
    return self.clients.openWindow(target);
  })());
});
