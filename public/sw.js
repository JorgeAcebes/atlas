const CACHE_VERSION = "v14";
const CACHE_NAME = "atlas-cache-v14";
const PHOTOS_CACHE = `atlas-photos-${CACHE_VERSION}`;
const TILES_CACHE = `atlas-tiles-${CACHE_VERSION}`;

const MAX_PHOTO_CACHE_ENTRIES = 250;
const MAX_TILE_CACHE_ENTRIES = 600;

const STATIC_ASSETS = [
  '/manifest.json',
  '/world-countries.topo.json',
  '/provincias_spain.topo.json',
  '/icon-1024.png',
  '/icon-512.png',
  '/icon-192.png',
  '/icon-maskable-1024.png',
  '/icon-maskable-512.png',
  '/icon-maskable-192.png',
  '/apple-touch-icon.png',
];

async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;
    const excess = keys.length - maxEntries;
    for (let i = 0; i < excess; i++) {
      await cache.delete(keys[i]);
    }
  } catch {
    /* ignore cache trim errors */
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const validCaches = new Set([CACHE_NAME, PHOTOS_CACHE, TILES_CACHE]);
  event.waitUntil(
    (async () => {
      if (self.registration && self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => {});
      }
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !validCaches.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

function isPhotoUrl(url) {
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/photos/view/")) {
    return true;
  }
  return url.hostname.endsWith(".r2.dev") || url.pathname.startsWith("/photos/");
}

function isImmutableAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || url.pathname.endsWith(".topo.json"))
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never intercept Supabase auth/data or mutating API calls
  if (url.hostname.includes("supabase.co") || url.hostname.includes("supabase.in")) {
    return;
  }

  // 1. Photos (/api/photos/view/* & optional R2 CDN): Cache-First + LRU bounded cache
  if (isPhotoUrl(url)) {
    event.respondWith(
      caches.open(PHOTOS_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const response = await fetch(req);
        if (response && response.ok && response.status === 200) {
          cache.put(req, response.clone()).then(() => trimCache(PHOTOS_CACHE, MAX_PHOTO_CACHE_ENTRIES));
        }
        return response;
      })
    );
    return;
  }

  // Skip all other /api/ calls
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    return;
  }

  // 2. OpenStreetMap Tiles: Cache-First + LRU bounded cache
  if (url.hostname.endsWith("tile.openstreetmap.org")) {
    event.respondWith(
      caches.open(TILES_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const response = await fetch(req);
        if (response && response.ok) {
          cache.put(req, response.clone()).then(() => trimCache(TILES_CACHE, MAX_TILE_CACHE_ENTRIES));
        }
        return response;
      })
    );
    return;
  }

  // 3. Immutable hashed Next static bundles & TopoJSON: strict Cache-First (no re-fetch on every load)
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const response = await fetch(req);
        if (response && response.ok) {
          cache.put(req, response.clone());
        }
        return response;
      })
    );
    return;
  }

  // 4. HTML navigations: navigationPreload -> network-first with cache fallback
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const preloadResp = await event.preloadResponse;
          if (preloadResp && preloadResp.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, preloadResp.clone());
            return preloadResp;
          }
          const networkResp = await fetch(req);
          if (networkResp && networkResp.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, networkResp.clone());
          }
          return networkResp;
        } catch {
          const cached = await caches.match(req);
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // 5. Same-origin public static icons/assets: Stale-While-Revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkFetch = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
            }
            return res;
          })
          .catch(() => cached || Response.error());
        return cached || networkFetch;
      })
    );
  }
});
