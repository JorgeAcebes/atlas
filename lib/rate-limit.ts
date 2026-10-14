/**
 * Utilidades de control de tasa (Rate Limiting) y extracción de IP para endpoints de la API.
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

  /**
   * Comprueba si una clave (normalmente la IP del cliente) tiene permitido realizar una petición.
   */
  public check(key: string): RateLimitResult {
    const now = Date.now();
    const timestamps = this.hits.get(key) || [];

    // Descartar marcas de tiempo que cayeron fuera de la ventana
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

  /**
   * Limpia el registro de una clave específica o de todas las claves (para pruebas).
   */
  public reset(key?: string): void {
    if (key) {
      this.hits.delete(key);
    } else {
      this.hits.clear();
    }
  }
}

/**
 * Extrae la dirección IP del cliente a partir de los encabezados de la petición HTTP.
 */
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

// ── Instancias de limitadores para rutas de API ──────────────────────────────

/**
 * Límite para app/api/auth/username-login:
 * 10 intentos por minuto por IP para mitigar ataques de fuerza bruta sobre contraseñas.
 */
export const authRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 10,
});

/**
 * Límite por cliente para app/api/geocoding:
 * Máximo 1 petición por segundo por IP cliente según directrices de Nominatim.
 */
export const geocodingClientRateLimiter = new RateLimiter({
  windowMs: 1000,
  max: 1,
});

// ── Serializador/Cola global para llamadas a Nominatim ───────────────────────
// La política de uso de Nominatim (OpenStreetMap) exige como máximo 1 petición por segundo
// desde la misma IP pública (Vercel). Para evitar que múltiples usuarios concurrentes
// saturen la IP saliente del servidor, encolamos y espaciamos las llamadas salientes.

let lastNominatimTimestamp = 0;
let nominatimChain: Promise<void> = Promise.resolve();

/**
 * Garantiza que transcurran al menos minIntervalMs milisegundos entre peticiones
 * consecutivas a Nominatim en el servidor.
 */
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
