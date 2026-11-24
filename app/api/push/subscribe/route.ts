import {
  corsPreflightResponse,
  jsonResponse,
  problemResponse,
} from "@/lib/api-http";
import { guardAuthenticatedApi } from "@/lib/api-route-utils";

export function OPTIONS() {
  return corsPreflightResponse();
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

  const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh.trim() : "";
  const authSecret = typeof body?.keys?.auth === "string" ? body.keys.auth.trim() : "";

  if (!endpoint.startsWith("https://") || !p256dh || !authSecret) {
    return problemResponse({
      status: 400,
      code: "invalid_push_subscription",
      title: "Suscripción push inválida",
      detail: "Se requiere un endpoint HTTPS válido junto con keys.p256dh y keys.auth.",
      headers: guard.headers,
      baseUrl: guard.baseUrl,
    });
  }

  const userAgent = request.headers.get("user-agent")?.slice(0, 300) || null;
  const { error } = await guard.auth.supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: guard.auth.userId,
        endpoint,
        p256dh,
        auth: authSecret,
        user_agent: userAgent,
        notify_following_posts:
          body?.notify_following_posts === undefined
            ? true
            : Boolean(body.notify_following_posts),
        notify_shared_records:
          body?.notify_shared_records === undefined
            ? true
            : Boolean(body.notify_shared_records),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

  if (error) {
    return problemResponse({
      status: 500,
      code: "database_error",
      title: "Error al guardar suscripción push",
      detail: error.message,
      headers: guard.headers,
      baseUrl: guard.baseUrl,
    });
  }

  return jsonResponse({ subscribed: true }, 200, guard.headers);
}

export async function DELETE(request: Request) {
  const guard = await guardAuthenticatedApi(request, { allowApiKey: false });
  if (!guard.ok) return guard.response;

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
  const removeAll = Boolean(body?.all);

  if (!endpoint && !removeAll) {
    return problemResponse({
      status: 400,
      code: "missing_endpoint",
      title: "Endpoint requerido",
      detail: "Proporciona el endpoint a eliminar o { \"all\": true }.",
      headers: guard.headers,
      baseUrl: guard.baseUrl,
    });
  }

  let query = guard.auth.supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", guard.auth.userId);

  if (!removeAll && endpoint) {
    query = query.eq("endpoint", endpoint);
  }

  const { error } = await query;
  if (error) {
    return problemResponse({
      status: 500,
      code: "database_error",
      title: "Error al eliminar suscripción push",
      detail: error.message,
      headers: guard.headers,
      baseUrl: guard.baseUrl,
    });
  }

  return jsonResponse({ unsubscribed: true }, 200, guard.headers);
}
