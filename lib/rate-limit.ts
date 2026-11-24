/**
 * Rate limiting & client IP extraction utilities for API endpoints.
 */

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
}

export class RateLimiter {
  private windowMs: number;
  private max: number;
  private hits: Map<string, number[]> = new Map();

  constructor(options: RateLimiterOptions) {
    this.windowMs = options.windowMs;
    this.max = options.max;
  }

  private pruneExpired(now: number): void {
    const windowStart = now - this.windowMs;
    for (const [k, ts] of this.hits.entries()) {
      const active = ts.filter((t) => t > windowStart);
      if (active.length === 0) {
        this.hits.delete(k);
      } else if (active.length !== ts.length) {
        this.hits.set(k, active);
      }
    }
  }

  public check(key: string): RateLimitResult {
    const now = Date.now();
    if (this.hits.size > 1000) {
      this.pruneExpired(now);
    }

    const timestamps = this.hits.get(key) || [];
    const windowStart = now - this.windowMs;
    const validTimestamps = timestamps.filter((t) => t > windowStart);

    if (validTimestamps.length >= this.max) {
      const oldest = validTimestamps[0];
      const resetMs = Math.max(0, oldest + this.windowMs - now);
      this.hits.set(key, validTimestamps);
      return {
        success: false,
        limit: this.max,
        remaining: 0,
        resetMs,
      };
    }

    validTimestamps.push(now);
    this.hits.set(key, validTimestamps);

    return {
      success: true,
      limit: this.max,
      remaining: this.max - validTimestamps.length,
      resetMs: this.windowMs,
    };
  }

  public reset(key?: string): void {
    if (key) {
      this.hits.delete(key);
    } else {
      this.hits.clear();
    }
  }
}

export function getClientIp(request: Request): string {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(",")[0].trim();
    if (firstIp) return firstIp;
  }

  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp && xRealIp.trim()) {
    return xRealIp.trim();
  }

  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp && cfConnectingIp.trim()) {
    return cfConnectingIp.trim();
  }

  return "127.0.0.1";
}

export const authRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 10,
});

export const uploadRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 30,
});

export const apiRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 120,
});

export const mcpRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 120,
});

export const geocodingClientRateLimiter = new RateLimiter({
  windowMs: 1000,
  max: 1,
});

let lastNominatimTimestamp = 0;
let nominatimChain: Promise<void> = Promise.resolve();

export async function throttleNominatim(minIntervalMs = 1000): Promise<void> {
  const prevChain = nominatimChain;
  let release: () => void;
  nominatimChain = new Promise<void>((resolve) => {
    release = resolve;
  });

  await prevChain;

  const now = Date.now();
  const elapsed = now - lastNominatimTimestamp;
  const waitMs = Math.max(0, minIntervalMs - elapsed);

  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  lastNominatimTimestamp = Date.now();
  release!();
}

export function resetNominatimThrottle(): void {
  lastNominatimTimestamp = 0;
  nominatimChain = Promise.resolve();
}
