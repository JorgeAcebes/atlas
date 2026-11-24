import { generateApiKey, normalizeRequestedScopes } from "@/lib/api-auth";
import {
  corsPreflightResponse,
  jsonResponse,
  problemResponse,
} from "@/lib/api-http";
import { guardAuthenticatedApi } from "@/lib/api-route-utils";

const MAX_ACTIVE_API_KEYS_PER_USER = 10;

export function OPTIONS() {
  return corsPreflightResponse();
}

export async function GET(request: Request) {
  const guard = await guardAuthenticatedApi(request, { allowApiKey: false });
  if (!guard.ok) return guard.response;

  const { data, error } = await guard.auth.supabase
    .from("api_keys")
    .select("id, name, key_prefix, scopes, last_used_at, expires_at, revoked_at, created_at")
    .eq("user_id", guard.auth.userId)
    .order("created_at", { ascending: false });

  if (error) {
    return problemResponse({
      status: 500,
      code: "database_error",
      title: "Error al listar API Keys",
      detail: error.message,
      headers: guard.headers,
      baseUrl: guard.baseUrl,
    });
  }

  return jsonResponse({ keys: data || [] }, 200, guard.headers);
}

export async function POST(request: Request) {
  const guard = await guardAuthenticatedApi(request, { allowApiKey: false });
  if (!guard.ok) return guard.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return problemResponse({
      status: 400,
      code: "invalid_json",
      title: "JSON inválido",
      detail: "El cuerpo de la petición debe ser JSON válido.",
      headers: guard.headers,
      baseUrl: guard.baseUrl,
    });
  }

  const trimmedName = typeof body?.name === "string" ? body.name.trim() : "";
  if (trimmedName.length < 1 || trimmedName.length > 80) {
    return problemResponse({
      status: 400,
      code: "invalid_key_name",
      title: "Nombre de clave inválido",
      detail: "El nombre de la API Key debe tener entre 1 y 80 caracteres.",
      headers: guard.headers,
      baseUrl: guard.baseUrl,
    });
  }

  const scopes = normalizeRequestedScopes(body?.scopes);

  let expiresAt: string | null = null;
  if (body?.expires_in_days !== undefined && body?.expires_in_days !== null && body?.expires_in_days !== "") {
    const days = Number(body.expires_in_days);
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      return problemResponse({
        status: 400,
        code: "invalid_expiration",
        title: "Expiración inválida",
        detail: "expires_in_days debe estar entre 1 y 3650 días (o null para no expirar).",
        headers: guard.headers,
        baseUrl: guard.baseUrl,
      });
    }
    expiresAt = new Date(Date.now() + Math.floor(days) * 86_400_000).toISOString();
  }

  const { count: activeCount, error: countErr } = await guard.auth.supabase
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("user_id", guard.auth.userId)
    .is("revoked_at", null);

  if (countErr) {
    return problemResponse({
      status: 500,
      code: "database_error",
      title: "Error al comprobar límite de claves",
      detail: countErr.message,
      headers: guard.headers,
      baseUrl: guard.baseUrl,
    });
  }

  if ((activeCount ?? 0) >= MAX_ACTIVE_API_KEYS_PER_USER) {
    return problemResponse({
      status: 409,
      code: "api_key_limit_exceeded",
      title: "Límite de API Keys activas alcanzado",
      detail: `Puedes tener como máximo ${MAX_ACTIVE_API_KEYS_PER_USER} API Keys activas simultáneamente.`,
      resolution: "Revoca una clave existente antes de crear otra.",
      headers: guard.headers,
      baseUrl: guard.baseUrl,
    });
  }

  const { rawKey, keyPrefix, keyHash } = generateApiKey();

  const { data: inserted, error: insertErr } = await guard.auth.supabase
    .from("api_keys")
    .insert({
      user_id: guard.auth.userId,
      name: trimmedName,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      scopes,
      expires_at: expiresAt,
    })
    .select("id, name, key_prefix, scopes, last_used_at, expires_at, revoked_at, created_at")
    .single();

  if (insertErr || !inserted) {
    return problemResponse({
      status: 500,
      code: "database_error",
      title: "Error al crear API Key",
      detail: insertErr?.message || "No se pudo guardar la clave.",
      headers: guard.headers,
      baseUrl: guard.baseUrl,
    });
  }

  return jsonResponse(
    {
      api_key: rawKey,
      key: inserted,
    },
    201,
    guard.headers
  );
}
