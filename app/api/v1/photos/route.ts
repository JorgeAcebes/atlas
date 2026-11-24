import {
  corsPreflightResponse,
  jsonResponse,
  problemResponse,
} from "@/lib/api-http";
import { guardAuthenticatedApi, handleServiceRouteError } from "@/lib/api-route-utils";
import { listUserPhotos, uploadUserPhotoBuffer } from "@/lib/atlas-service";
import {
  MAX_DIRECT_BASE64_BYTES,
  MAX_PHOTO_UPLOAD_BYTES,
  parseBase64Image,
} from "@/lib/server-image";

export function OPTIONS() {
  return corsPreflightResponse();
}

export async function GET(request: Request) {
  const guard = await guardAuthenticatedApi(request, { requiredScope: "read" });
  if (!guard.ok) return guard.response;

  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const data = await listUserPhotos(guard.auth, {
      summit_id: searchParams.get("summit_id"),
      taken_on: searchParams.get("taken_on"),
      limit: limitParam ? Number(limitParam) : undefined,
      baseUrl: guard.baseUrl,
    });
    return jsonResponse(data, 200, guard.headers);
  } catch (err) {
    return handleServiceRouteError(err, guard.baseUrl, guard.headers);
  }
}

function parseOptionalNumber(val: unknown): number | null {
  if (val === undefined || val === null || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalBoolean(val: unknown, defaultVal: boolean): boolean {
  if (val === undefined || val === null || val === "") return defaultVal;
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    const lower = val.trim().toLowerCase();
    if (lower === "false" || lower === "0" || lower === "no") return false;
    if (lower === "true" || lower === "1" || lower === "yes") return true;
  }
  return defaultVal;
}

export async function POST(request: Request) {
  const guard = await guardAuthenticatedApi(request, { requiredScope: "photos:write" });
  if (!guard.ok) return guard.response;

  const contentType = (request.headers.get("content-type") || "").toLowerCase();

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData().catch(() => null);
      if (!formData) {
        return problemResponse({
          status: 400,
          code: "invalid_multipart",
          title: "Formulario multipart inválido",
          detail: "No se pudo leer el cuerpo multipart/form-data.",
          headers: guard.headers,
          baseUrl: guard.baseUrl,
        });
      }

      const fileEntry = formData.get("file");
      if (
        !fileEntry ||
        typeof fileEntry === "string" ||
        typeof (fileEntry as Blob).arrayBuffer !== "function"
      ) {
        return problemResponse({
          status: 400,
          code: "missing_file",
          title: "Archivo requerido",
          detail: "El campo multipart 'file' es obligatorio.",
          headers: guard.headers,
          baseUrl: guard.baseUrl,
        });
      }

      const fileBlob = fileEntry as File;
      if (fileBlob.size > MAX_PHOTO_UPLOAD_BYTES) {
        return problemResponse({
          status: 413,
          code: "payload_too_large",
          title: "Imagen demasiado grande",
          detail: "La imagen supera el máximo de 15 MB.",
          headers: guard.headers,
          baseUrl: guard.baseUrl,
        });
      }

      const buffer = Buffer.from(await fileBlob.arrayBuffer());
      const str = (key: string): string | null => {
        const v = formData.get(key);
        return typeof v === "string" ? v : null;
      };

      const fileName =
        str("file_name") || str("fileName") || fileBlob.name || "photo.jpg";
      const summitId = str("summit_id") || str("summitId") || "";

      const result = await uploadUserPhotoBuffer(guard.auth, {
        buffer,
        fileName,
        summit_id: summitId,
        sub_item_id: str("sub_item_id"),
        taken_on: str("taken_on") || str("takenOn"),
        date_unknown: parseOptionalBoolean(str("date_unknown"), false),
        caption: str("caption"),
        shot_at: str("shot_at"),
        auto_create_record: parseOptionalBoolean(str("auto_create_record"), true),
        notes: str("notes"),
        end_date: str("end_date"),
        link: str("link"),
        link_name: str("link_name"),
        link_2: str("link_2"),
        link_name_2: str("link_name_2"),
        lat: parseOptionalNumber(str("lat")),
        lng: parseOptionalNumber(str("lng")),
        location_name: str("location_name"),
        baseUrl: guard.baseUrl,
      });

      return jsonResponse(result, 201, guard.headers);
    }

    if (contentType.includes("application/json")) {
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

      const rawBase64 =
        typeof body?.image_base64 === "string"
          ? body.image_base64
          : typeof body?.data_url === "string"
            ? body.data_url
            : "";

      const parsed = parseBase64Image(rawBase64);
      if (!parsed) {
        return problemResponse({
          status: 400,
          code: "invalid_base64",
          title: "Imagen base64 inválida o ausente",
          detail:
            "Proporciona 'image_base64' o 'data_url' con una imagen válida en base64, o usa multipart/form-data.",
          headers: guard.headers,
          baseUrl: guard.baseUrl,
        });
      }

      if (parsed.buffer.length > MAX_DIRECT_BASE64_BYTES) {
        return problemResponse({
          status: 413,
          code: "payload_too_large",
          title: "Imagen demasiado grande para subida directa JSON",
          detail: `La imagen decodificada (${parsed.buffer.length} bytes) supera el límite directo de ${MAX_DIRECT_BASE64_BYTES} bytes.`,
          resolution:
            "Usa POST /api/v1/photos/upload-intent -> PUT a upload_url -> POST /api/v1/photos/confirm para subir archivos de hasta 15 MB.",
          headers: guard.headers,
          baseUrl: guard.baseUrl,
        });
      }

      const result = await uploadUserPhotoBuffer(guard.auth, {
        buffer: parsed.buffer,
        fileName:
          typeof body?.file_name === "string" && body.file_name.trim()
            ? body.file_name.trim()
            : "photo.jpg",
        summit_id: String(body?.summit_id || body?.summitId || ""),
        sub_item_id: typeof body?.sub_item_id === "string" ? body.sub_item_id : null,
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
        lat: parseOptionalNumber(body?.lat),
        lng: parseOptionalNumber(body?.lng),
        location_name:
          typeof body?.location_name === "string" ? body.location_name : null,
        baseUrl: guard.baseUrl,
      });

      return jsonResponse(result, 201, guard.headers);
    }

    return problemResponse({
      status: 415,
      code: "unsupported_media_type",
      title: "Content-Type no soportado",
      detail: "Envía multipart/form-data o application/json.",
      resolution:
        "Para archivos grandes (3.2-15 MB), usa POST /api/v1/photos/upload-intent.",
      headers: guard.headers,
      baseUrl: guard.baseUrl,
    });
  } catch (err) {
    return handleServiceRouteError(err, guard.baseUrl, guard.headers);
  }
}
