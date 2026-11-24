const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();
const inFlightRequests = new Map<string, Promise<unknown>>();

export function readJsonCache<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Coalesces rapid state mutations into a single deferred localStorage JSON write
 * so fast clicks or typing never stutter on synchronous serialization.
 */
export function scheduleLocalCacheWrite(key: string, value: unknown, delayMs = 300): void {
  if (typeof window === "undefined") return;
  const existing = pendingWrites.get(key);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    pendingWrites.delete(key);
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota exceeded */
    }
  }, delayMs);

  pendingWrites.set(key, timer);
}

/**
 * Lightweight O(1) fingerprint replacing full JSON.stringify array comparisons.
 */
export function computeRecordsFingerprint(
  items: ReadonlyArray<Record<string, any>>
): string {
  const len = items.length;
  if (len === 0) return "0";
  const first = items[0];
  const last = items[len - 1];
  const fId = first?.id || first?.summit_id || first?.experience_id || "";
  const fTs = first?.updated_at || first?.created_at || first?.achieved_on || "";
  const lId = last?.id || last?.summit_id || last?.experience_id || "";
  const lTs = last?.updated_at || last?.created_at || last?.achieved_on || "";
  return `${len}:${fId}:${fTs}:${lId}:${lTs}`;
}

/**
 * Deduplicates concurrent identical async fetches in memory.
 */
export function dedupInFlight<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inFlightRequests.get(key);
  if (existing) return existing as Promise<T>;

  const promise = factory().finally(() => {
    inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, promise);
  return promise;
}
