import {
  corsPreflightResponse,
  jsonResponse,
  problemResponse,
} from "@/lib/api-http";
import { guardAuthenticatedApi, handleServiceRouteError } from "@/lib/api-route-utils";
import { confirmPhotoUploadIntent } from "@/lib/atlas-service";

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
    const result = await confirmPhotoUploadIntent(guard.auth, {
      upload_token: String(body?.upload_token || ""),
      baseUrl: guard.baseUrl,
    });
    return jsonResponse(result, 201, guard.headers);
  } catch (err) {
    return handleServiceRouteError(err, guard.baseUrl, guard.headers);
  }
}
