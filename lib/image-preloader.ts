"use client";

const preloadedImageUrls = new Set<string>();

export interface PreloadImagesOptions {
  maxConcurrent?: number;
  maxCount?: number;
}

/**
 * Preloads a single image URL at most once per session without blocking rendering.
 */
export function preloadImage(url: string): Promise<void> {
  if (typeof window === "undefined" || !url) return Promise.resolve();
  if (preloadedImageUrls.has(url)) return Promise.resolve();
  preloadedImageUrls.add(url);

  return new Promise<void>((resolve) => {
    const img = new window.Image();
    img.decoding = "async";
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
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

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(startQueue, { timeout: 1200 });
  } else {
    setTimeout(startQueue, 50);
  }
}
