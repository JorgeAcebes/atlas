const CACHE_NAME = 'atlas-cache-v9';

// Recursos estáticos iniciales a cachear durante instalación.
// Solo archivos PNG que existen en /public y son esenciales para la PWA.
// NO precacheamos '/' para que el HTML nunca quede congelado.
// Los SVGs servidos por Next.js (app/icon.svg) pueden devolver redirects
// o headers especiales que rompen cache.addAll() — los excluimos del precache.
const PRECACHE_URLS = [
  '/manifest.json',
  '/icon-512.png',
  '/icon-192.png',
  '/icon-maskable-512.png',
  '/icon-maskable-192.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Cache First para tiles de OpenStreetMap y CDN assets
  if (
    url.hostname === 'a.tile.openstreetmap.org' ||
    url.hostname === 'b.tile.openstreetmap.org' ||
    url.hostname === 'c.tile.openstreetmap.org' ||
    url.hostname === 'cdn.jsdelivr.net' ||
    url.hostname === 'gist.githubusercontent.com' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((networkResponse) => {
          // Cache the response if successful
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 2. Network First (con fallback a Cache) para llamadas a Supabase API 
  if (url.hostname.endsWith('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // 3. Network First con fallback a Cache para navegaciones HTML (evita páginas desactualizadas tras despliegues o cambios de dominio)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const cachedRoot = await caches.match('/');
          if (cachedRoot) return cachedRoot;
          return new Response('Sin conexión', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        })
    );
    return;
  }

  // 4. Stale-While-Revalidate para recursos estáticos (JS, CSS, imágenes)
  if (event.request.method === 'GET' && !url.pathname.startsWith('/api/')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        });

        // Devolver lo que haya en caché inmediatamente y revalidar en segundo plano
        if (cachedResponse) {
          fetchPromise.catch(() => {});
          return cachedResponse;
        }

        // Si no está en caché, esperar a la red directamente
        return fetchPromise;
      })
    );
    return;
  }
});
