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

  // Skip all other /api/ calls, MCP, and agent discovery endpoints
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/api/") ||
      url.pathname === "/mcp" ||
      url.pathname.startsWith("/mcp/") ||
      url.pathname.startsWith("/.well-known/") ||
      url.pathname === "/openapi.json" ||
      url.pathname === "/llms.txt" ||
      url.pathname === "/llms-full.txt")
  ) {
    return;
  }

  // 2. OpenStreetMap Tiles: Cache-First + bounded LRU cache + single transient retry
  if (url.hostname.endsWith("tile.openstreetmap.org")) {
    event.respondWith(
      (async () => {
        let cached;
        try {
          const cache = await caches.open(TILES_CACHE);
          const isRetryReq = url.searchParams.has("_r");
          let cacheKey = req;
          if (isRetryReq) {
            const cacheUrl = new URL(url.href);
            cacheUrl.searchParams.delete("_r");
            cacheKey = new Request(cacheUrl.href, {
              mode: req.mode,
              credentials: req.credentials,
            });
          }

          if (!isRetryReq) {
            cached = await cache.match(cacheKey);
            if (cached) return cached;
          }

          let response;
          try {
            response = await fetch(req);
          } catch {
            response = await fetch(req);
          }

          if (response && response.type !== "opaque" && !response.ok) {
            try {
              const retryRes = await fetch(req);
              if (retryRes && retryRes.ok) response = retryRes;
            } catch {
              /* keep original response */
            }
          }

          if (response && response.ok) {
            cache
              .put(cacheKey, response.clone())
              .then(() => trimCache(TILES_CACHE, MAX_TILE_CACHE_ENTRIES))
              .catch(() => {});
          }
          return response;
        } catch {
          return cached || Response.error();
        }
      })()
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

// 6. Web Push Notifications (PWA mobile & desktop)
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Atlas", body: event.data.text() };
  }

  const title = payload.title || "Atlas";
  const options = {
    body: payload.body || "Tienes una nueva actividad en Atlas.",
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    tag: payload.tag || "atlas-notification",
    renotify: true,
    data: {
      url: payload.url || "/social",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification && event.notification.data && event.notification.data.url) || "/social";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          return client.focus().then((focusedClient) => {
            if (focusedClient && "navigate" in focusedClient) {
              return focusedClient.navigate(targetUrl).catch(() => focusedClient);
            }
            return focusedClient;
          });
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
