"use client";

export const ATLAS_PHOTOS_CACHE_NAME = "atlas-photos-v14";

const preloadedImageUrls = new Set<string>();

export interface PreloadImagesOptions {
  maxConcurrent?: number;
  maxCount?: number;
  immediate?: boolean;
}

/**
 * Preloads and decodes a single image URL at most once per session without blocking rendering.
 */
export function preloadImage(url: string): Promise<void> {
  if (typeof window === "undefined" || !url) return Promise.resolve();
  if (preloadedImageUrls.has(url)) return Promise.resolve();
  preloadedImageUrls.add(url);

  return new Promise<void>((resolve) => {
    const img = new window.Image();
    img.decoding = "async";
    img.onload = () => {
      if (typeof img.decode === "function") {
        img.decode().catch(() => {}).finally(resolve);
      } else {
        resolve();
      }
    };
    img.onerror = () => resolve();
    img.src = url;
  });
}

/**
 * Writes a newly uploaded Blob directly into the Service Worker photo cache
 * so the client renders it instantaneously without re-downloading it from R2/Vercel.
 */
export async function seedPhotoServiceWorkerCache(url: string, blob: Blob): Promise<void> {
  if (typeof window === "undefined" || !url || !blob) return;
  preloadedImageUrls.add(url);
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(ATLAS_PHOTOS_CACHE_NAME);
    const absoluteUrl = new URL(url, window.location.origin).toString();
    const response = new Response(blob, {
      status: 200,
      statusText: "OK",
      headers: {
        "Content-Type": blob.type || "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
    await cache.put(absoluteUrl, response);
  } catch {
    /* ignore CacheStorage failures (private browsing / quota) */
  }
}

/**
 * Throttled idle image preloader: limits total count and max concurrent requests
 * so photo galleries and feeds never saturate /api/photos/view/* or browser sockets.
 */
export function preloadImages(
  urls: Array<string | null | undefined>,
  options: PreloadImagesOptions = {}
): void {
  if (typeof window === "undefined") return;
  const maxConcurrent = Math.max(1, options.maxConcurrent ?? 3);
  const maxCount = Math.max(1, options.maxCount ?? 12);

  const queue: string[] = [];
  for (const raw of urls) {
    if (!raw || typeof raw !== "string") continue;
    if (preloadedImageUrls.has(raw) || queue.includes(raw)) continue;
    queue.push(raw);
    if (queue.length >= maxCount) break;
  }

  if (queue.length === 0) return;

  const startQueue = () => {
    let cursor = 0;
    const runNext = () => {
      if (cursor >= queue.length) return;
      const nextUrl = queue[cursor++];
      preloadImage(nextUrl).finally(runNext);
    };

    const workers = Math.min(maxConcurrent, queue.length);
    for (let i = 0; i < workers; i++) {
      runNext();
    }
  };

  if (options.immediate) {
    startQueue();
    return;
  }

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(startQueue, { timeout: 1200 });
  } else {
    setTimeout(startQueue, 50);
  }
}
