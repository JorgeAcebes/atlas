import {
  corsPreflightResponse,
  jsonResponse,
  problemResponse,
} from "@/lib/api-http";
import { guardAuthenticatedApi, handleServiceRouteError } from "@/lib/api-route-utils";
import { deleteUserPhoto, updateUserPhotoCaption } from "@/lib/atlas-service";

export function OPTIONS() {
  return corsPreflightResponse();
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const guard = await guardAuthenticatedApi(request, { requiredScope: "photos:write" });
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
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

  if (!body || !("caption" in body)) {
    return problemResponse({
      status: 400,
      code: "missing_caption",
      title: "Campo 'caption' requerido",
      detail: "Envía { \"caption\": \"...\" } o { \"caption\": null } para borrarlo.",
      headers: guard.headers,
      baseUrl: guard.baseUrl,
    });
  }

  try {
    const result = await updateUserPhotoCaption(guard.auth, {
      photo_id: id,
      caption: body.caption === null ? null : String(body.caption || ""),
      baseUrl: guard.baseUrl,
    });
    return jsonResponse(result, 200, guard.headers);
  } catch (err) {
    return handleServiceRouteError(err, guard.baseUrl, guard.headers);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const guard = await guardAuthenticatedApi(request, { requiredScope: "photos:write" });
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  try {
    const result = await deleteUserPhoto(guard.auth, { photo_id: id });
    return jsonResponse(result, 200, guard.headers);
  } catch (err) {
    return handleServiceRouteError(err, guard.baseUrl, guard.headers);
  }
}
