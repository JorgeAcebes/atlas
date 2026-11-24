import { corsPreflightResponse, jsonResponse, problemResponse } from "@/lib/api-http";
import { guardAuthenticatedApi, handleServiceRouteError } from "@/lib/api-route-utils";
import { listUserRecords, upsertUserRecord } from "@/lib/atlas-service";

export function OPTIONS() {
  return corsPreflightResponse();
}

export async function GET(request: Request) {
  const guard = await guardAuthenticatedApi(request, { requiredScope: "read" });
  if (!guard.ok) return guard.response;

  try {
    const { searchParams } = new URL(request.url);
    const rawType = (searchParams.get("type") || "all").toLowerCase();
    const type = (["all", "country", "peak", "experience"].includes(rawType)
      ? rawType
      : "all") as "all" | "country" | "peak" | "experience";

    const data = await listUserRecords(guard.auth, {
      type,
      summit_id: searchParams.get("summit_id"),
      include_wishlist: searchParams.get("include_wishlist") === "true",
      baseUrl: guard.baseUrl,
    });

    return jsonResponse(data, 200, guard.headers);
  } catch (err) {
    return handleServiceRouteError(err, guard.baseUrl, guard.headers);
  }
}

export async function POST(request: Request) {
  const guard = await guardAuthenticatedApi(request, { requiredScope: "records:write" });
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

  try {
    const result = await upsertUserRecord(guard.auth, {
      summit_id: body?.summit_id,
      sub_item_id: body?.sub_item_id,
      achieved_on: body?.achieved_on,
      date_unknown: body?.date_unknown,
      end_date: body?.end_date,
      notes: body?.notes,
      link: body?.link,
      link_name: body?.link_name,
      link_2: body?.link_2,
      link_name_2: body?.link_name_2,
      is_wishlist: body?.is_wishlist,
      lat: body?.lat,
      lng: body?.lng,
      location_name: body?.location_name,
      record_id: body?.record_id,
    });

    return jsonResponse(result, 200, guard.headers);
  } catch (err) {
    return handleServiceRouteError(err, guard.baseUrl, guard.headers);
  }
}
