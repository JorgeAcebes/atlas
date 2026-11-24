import {
  corsPreflightResponse,
  jsonResponse,
  problemResponse,
} from "@/lib/api-http";
import { guardAuthenticatedApi } from "@/lib/api-route-utils";

export function OPTIONS() {
  return corsPreflightResponse();
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const guard = await guardAuthenticatedApi(request, { allowApiKey: false });
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const revokedAt = new Date().toISOString();

  const { data, error } = await guard.auth.supabase
    .from("api_keys")
    .update({ revoked_at: revokedAt })
    .eq("id", id)
    .eq("user_id", guard.auth.userId)
    .is("revoked_at", null)
    .select("id, name, key_prefix, revoked_at")
    .maybeSingle();

  if (error) {
    return problemResponse({
      status: 500,
      code: "database_error",
      title: "Error al revocar API Key",
      detail: error.message,
      headers: guard.headers,
      baseUrl: guard.baseUrl,
    });
  }

  if (!data) {
    return problemResponse({
      status: 404,
      code: "api_key_not_found",
      title: "API Key no encontrada",
      detail: "No existe ninguna API Key activa con ese ID para este usuario.",
      headers: guard.headers,
      baseUrl: guard.baseUrl,
    });
  }

  return jsonResponse({ revoked: true, key: data }, 200, guard.headers);
}
