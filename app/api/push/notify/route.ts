import {
  corsPreflightResponse,
  jsonResponse,
  problemResponse,
} from "@/lib/api-http";
import { guardAuthenticatedApi } from "@/lib/api-route-utils";
import {
  isPushConfigured,
  notifyCompanionsOfSharedRecord,
  notifyFollowersOfNewPost,
  type PushItemKind,
} from "@/lib/push-notifications";

export function OPTIONS() {
  return corsPreflightResponse();
}

function normalizeKind(raw: unknown): PushItemKind {
  if (raw === "peak" || raw === "peaks") return "peak";
  if (raw === "experience" || raw === "experiences") return "experience";
  return "country";
}

export async function POST(request: Request) {
  const guard = await guardAuthenticatedApi(request, { allowApiKey: false });
  if (!guard.ok) return guard.response;

  if (!isPushConfigured()) {
    return jsonResponse({ ok: true, skipped: true }, 200, guard.headers);
  }

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

  const event = typeof body?.event === "string" ? body.event : "";
  const itemId = typeof body?.item_id === "string" ? body.item_id.trim() : "";
  const subItemId =
    typeof body?.sub_item_id === "string" && body.sub_item_id.trim()
      ? body.sub_item_id.trim()
      : null;
  const itemKind = normalizeKind(body?.item_type);
  const title = typeof body?.title === "string" ? body.title.trim() : null;

  if (!itemId) {
    return problemResponse({
      status: 400,
      code: "missing_item_id",
      title: "item_id requerido",
      detail: "Debes indicar item_id.",
      headers: guard.headers,
      baseUrl: guard.baseUrl,
    });
  }

  if (event === "new_post") {
    // Verify the authenticated user actually owns a non-wishlist record for this item
    if (itemKind === "experience") {
      const { data: expRow } = await guard.auth.supabase
        .from("experience_records")
        .select("id")
        .eq("user_id", guard.auth.userId)
        .eq("experience_id", itemId)
        .eq("is_wishlist", false)
        .limit(1)
        .maybeSingle();
      if (!expRow) {
        return jsonResponse({ ok: true, skipped: true }, 200, guard.headers);
      }
    } else {
      const { data: ascentRow } = await guard.auth.supabase
        .from("ascents")
        .select("id")
        .eq("user_id", guard.auth.userId)
        .eq("summit_id", itemId)
        .eq("is_wishlist", false)
        .limit(1)
        .maybeSingle();
      if (!ascentRow) {
        return jsonResponse({ ok: true, skipped: true }, 200, guard.headers);
      }
    }

    const res = await notifyFollowersOfNewPost(guard.auth.supabase, {
      actorUserId: guard.auth.userId,
      itemKind,
      itemId,
      subItemId,
      title,
    });

    return jsonResponse({ ok: true, ...res }, 200, guard.headers);
  }

  if (event === "shared_record") {
    const companionIds = Array.isArray(body?.companion_ids)
      ? body.companion_ids.filter((id: unknown): id is string => typeof id === "string")
      : [];

    const res = await notifyCompanionsOfSharedRecord(guard.auth.supabase, {
      actorUserId: guard.auth.userId,
      companionUserIds: companionIds,
      itemKind,
      itemId,
      title,
    });

    return jsonResponse({ ok: true, ...res }, 200, guard.headers);
  }

  return problemResponse({
    status: 400,
    code: "invalid_event",
    title: "Evento inválido",
    detail: "event debe ser 'new_post' o 'shared_record'.",
    headers: guard.headers,
    baseUrl: guard.baseUrl,
  });
}
