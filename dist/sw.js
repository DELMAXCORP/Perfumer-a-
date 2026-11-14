/* Service worker de ALPHA Perfumería: cachea el sitio (estático).
   El catálogo y las imágenes de Supabase NO se cachean aquí: los precios
   y la disponibilidad siempre deben venir en vivo de la base de datos. */
const CACHE = 'alpha-static-v7';
const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './alpha-data.js',
  './store-core.js',
  './supabaseClient.js',
  './product-metadata.js',
  './decant-pricing.js',
  './app.js',
  './assets/alpha-logo.jpeg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/hero-decants-pexels.jpg'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  const refresh = () => fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
    }
    return response;
  });
  event.respondWith(caches.match(event.request).then(hit => {
    // stale-while-revalidate: se muestra lo guardado y se refresca en segundo plano.
    if (hit) { refresh().catch(() => {}); return hit; }
    return refresh().catch(() => caches.match('./index.html'));
  }));
});
