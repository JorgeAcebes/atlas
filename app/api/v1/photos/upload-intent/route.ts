import {
  corsPreflightResponse,
  jsonResponse,
  problemResponse,
} from "@/lib/api-http";
import { guardAuthenticatedApi, handleServiceRouteError } from "@/lib/api-route-utils";
import { createPhotoUploadIntent } from "@/lib/atlas-service";

export function OPTIONS() {
  return corsPreflightResponse();
}

export async function POST(request: Request) {
  const guard = await guardAuthenticatedApi(request, { requiredScope: "photos:write" });
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
    const intent = await createPhotoUploadIntent(guard.auth, {
      summit_id: String(body?.summit_id || ""),
      sub_item_id: typeof body?.sub_item_id === "string" ? body.sub_item_id : null,
      file_name: String(body?.file_name || "photo.jpg"),
      content_type: String(body?.content_type || ""),
      file_size: Number(body?.file_size || 0),
      taken_on: typeof body?.taken_on === "string" ? body.taken_on : null,
      date_unknown: Boolean(body?.date_unknown),
      caption: typeof body?.caption === "string" ? body.caption : null,
      shot_at: typeof body?.shot_at === "string" ? body.shot_at : null,
      auto_create_record:
        body?.auto_create_record === undefined ? true : Boolean(body.auto_create_record),
      notes: typeof body?.notes === "string" ? body.notes : null,
      end_date: typeof body?.end_date === "string" ? body.end_date : null,
      link: typeof body?.link === "string" ? body.link : null,
      link_name: typeof body?.link_name === "string" ? body.link_name : null,
      link_2: typeof body?.link_2 === "string" ? body.link_2 : null,
      link_name_2: typeof body?.link_name_2 === "string" ? body.link_name_2 : null,
      lat: body?.lat !== undefined && body?.lat !== null ? Number(body.lat) : null,
      lng: body?.lng !== undefined && body?.lng !== null ? Number(body.lng) : null,
      location_name:
        typeof body?.location_name === "string" ? body.location_name : null,
    });

    return jsonResponse(intent, 200, guard.headers);
  } catch (err) {
    return handleServiceRouteError(err, guard.baseUrl, guard.headers);
  }
}
