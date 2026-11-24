import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ApiScope = "read" | "photos:write" | "records:write";
export const VALID_API_SCOPES: ApiScope[] = ["read", "photos:write", "records:write"];
export const API_KEY_PREFIX = "atlas_live_";

export interface AuthenticatedApiContext {
  userId: string;
  authType: "api_key" | "supabase_jwt";
  keyId?: string;
  scopes: ApiScope[];
  supabase: SupabaseClient | any;
}

export interface ApiAuthFailure {
  ok: false;
  status: number;
  code: string;
  title: string;
  detail: string;
  resolution: string;
  headers?: Record<string, string>;
}

export type ApiAuthResult =
  | { ok: true; auth: AuthenticatedApiContext | null }
  | ApiAuthFailure;

export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey, "utf8").digest("hex");
}

export function generateApiKey(): {
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
} {
  const randomPart = crypto.randomBytes(32).toString("base64url");
  const rawKey = `${API_KEY_PREFIX}${randomPart}`;
  return {
    rawKey,
    keyPrefix: rawKey.slice(0, 18),
    keyHash: hashApiKey(rawKey),
  };
}

export function normalizeRequestedScopes(input: unknown): ApiScope[] {
  if (!Array.isArray(input) || input.length === 0) {
    return [...VALID_API_SCOPES];
  }
  const filtered = Array.from(
    new Set(
      input.filter(
        (s): s is ApiScope => typeof s === "string" && VALID_API_SCOPES.includes(s as ApiScope)
      )
    )
  );
  return filtered.length > 0 ? filtered : [...VALID_API_SCOPES];
}

export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization")?.trim();
  if (authHeader) {
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch && bearerMatch[1]?.trim()) {
      return bearerMatch[1].trim();
    }
  }

  const xApiKey = request.headers.get("X-API-Key")?.trim();
  if (xApiKey) {
    return xApiKey;
  }

  return null;
}

function getSupabaseEnv(): {
  url: string | undefined;
  serviceRoleKey: string | undefined;
  anonKey: string | undefined;
} {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    anonKey: (
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    )?.trim(),
  };
}

export function createServiceRoleClient(): SupabaseClient | null {
  const { url, serviceRoleKey } = getSupabaseEnv();
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function createScopedJwtClient(token: string): SupabaseClient | null {
  const { url, anonKey } = getSupabaseEnv();
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

export async function authenticateApiRequest(
  request: Request,
  options?: {
    requiredScope?: ApiScope;
    allowApiKey?: boolean;
    optional?: boolean;
    supabaseAdminOverride?: any;
  }
): Promise<ApiAuthResult> {
  const token = extractBearerToken(request);

  if (!token) {
    if (options?.optional) {
      return { ok: true, auth: null };
    }
    return {
      ok: false,
      status: 401,
      code: "unauthorized",
      title: "Autenticación requerida",
      detail:
        "Falta el token de autenticación. Envía 'Authorization: Bearer <token>' o 'X-API-Key: <atlas_live_...>'.",
      resolution:
        "Genera una API Key personal en /developers o inicia sesión vía POST /api/auth/username-login.",
      headers: {
        "WWW-Authenticate": 'Bearer realm="atlas-api"',
      },
    };
  }

  // Personal API Key path (`atlas_live_...`)
  if (token.startsWith(API_KEY_PREFIX)) {
    if (options?.allowApiKey === false) {
      return {
        ok: false,
        status: 403,
        code: "session_required",
        title: "Sesión de usuario requerida",
        detail:
          "Este endpoint solo admite un JWT de sesión de Supabase. Las API Keys no pueden crear ni revocar otras API Keys.",
        resolution:
          "Inicia sesión en la web (/developers) o envía el access_token obtenido desde Supabase Auth.",
      };
    }

    const supabaseAdmin = options?.supabaseAdminOverride ?? createServiceRoleClient();
    if (!supabaseAdmin) {
      return {
        ok: false,
        status: 503,
        code: "server_misconfigured",
        title: "Configuración del servidor incompleta",
        detail:
          "El servidor requiere SUPABASE_SERVICE_ROLE_KEY para validar claves personales de API.",
        resolution:
          "Configura SUPABASE_SERVICE_ROLE_KEY en el entorno o autentícate temporalmente con un JWT de Supabase.",
      };
    }

    const keyHash = hashApiKey(token);
    const { data: keyRow, error: keyErr } = await supabaseAdmin
      .from("api_keys")
      .select("id, user_id, scopes, expires_at, revoked_at")
      .eq("key_hash", keyHash)
      .maybeSingle();

    if (keyErr || !keyRow) {
      return {
        ok: false,
        status: 401,
        code: "invalid_api_key",
        title: "API Key inválida",
        detail: "La API Key proporcionada no existe o no es válida.",
        resolution: "Comprueba la clave o genera una nueva en /developers.",
        headers: { "WWW-Authenticate": 'Bearer realm="atlas-api", error="invalid_token"' },
      };
    }

    if (keyRow.revoked_at) {
      return {
        ok: false,
        status: 401,
        code: "invalid_api_key",
        title: "API Key revocada",
        detail: "Esta API Key ha sido revocada.",
        resolution: "Genera una nueva API Key personal en /developers.",
        headers: { "WWW-Authenticate": 'Bearer realm="atlas-api", error="invalid_token"' },
      };
    }

    if (keyRow.expires_at) {
      const expiresMs = new Date(keyRow.expires_at).getTime();
      if (!Number.isNaN(expiresMs) && expiresMs <= Date.now()) {
        return {
          ok: false,
          status: 401,
          code: "invalid_api_key",
          title: "API Key expirada",
          detail: "Esta API Key ha caducado.",
          resolution: "Genera una nueva API Key personal en /developers.",
          headers: { "WWW-Authenticate": 'Bearer realm="atlas-api", error="invalid_token"' },
        };
      }
    }

    const scopes: ApiScope[] = Array.isArray(keyRow.scopes)
      ? keyRow.scopes.filter((s: unknown): s is ApiScope =>
          typeof s === "string" && VALID_API_SCOPES.includes(s as ApiScope)
        )
      : [];

    if (options?.requiredScope && !scopes.includes(options.requiredScope)) {
      return {
        ok: false,
        status: 403,
        code: "insufficient_scope",
        title: "Permisos insuficientes",
        detail: `Esta API Key no incluye el permiso '${options.requiredScope}'.`,
        resolution: `Genera una API Key con el scope '${options.requiredScope}' en /developers.`,
      };
    }

    // Best-effort last_used_at audit update (never fail the request if this throws)
    try {
      const updatePromise = supabaseAdmin
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", keyRow.id);
      if (updatePromise && typeof updatePromise.then === "function") {
        void Promise.resolve(updatePromise).catch(() => {});
      }
    } catch {
      /* ignore non-critical timestamp update */
    }

    return {
      ok: true,
      auth: {
        userId: keyRow.user_id,
        authType: "api_key",
        keyId: keyRow.id,
        scopes,
        supabase: supabaseAdmin,
      },
    };
  }

  // Supabase JWT path
  const adminClient = options?.supabaseAdminOverride ?? createServiceRoleClient();
  const scopedClient = options?.supabaseAdminOverride ?? createScopedJwtClient(token);
  const authVerifierClient = adminClient || scopedClient;

  if (!authVerifierClient) {
    return {
      ok: false,
      status: 503,
      code: "server_misconfigured",
      title: "Configuración del servidor incompleta",
      detail: "Variables de Supabase no configuradas en el servidor.",
      resolution: "Configura NEXT_PUBLIC_SUPABASE_URL y las claves de Supabase.",
    };
  }

  const { data: userData, error: userErr } = await authVerifierClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return {
      ok: false,
      status: 401,
      code: "invalid_token",
      title: "Token inválido o expirado",
      detail: "El token JWT de Supabase es inválido o ha expirado.",
      resolution:
        "Renueva el token mediante POST /api/auth/username-login o usa una API Key personal en /developers.",
      headers: { "WWW-Authenticate": 'Bearer realm="atlas-api", error="invalid_token"' },
    };
  }

  const dbClient = adminClient || scopedClient || authVerifierClient;

  return {
    ok: true,
    auth: {
      userId: userData.user.id,
      authType: "supabase_jwt",
      scopes: [...VALID_API_SCOPES],
      supabase: dbClient,
    },
  };
}
