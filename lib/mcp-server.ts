import { NextResponse } from "next/server";
import { authenticateApiRequest, type ApiScope } from "@/lib/api-auth";
import {
  API_CORS_HEADERS,
  buildRateLimitHeaders,
  corsPreflightResponse,
  getAppBaseUrl,
  jsonResponse,
} from "@/lib/api-http";
import {
  AtlasServiceError,
  confirmPhotoUploadIntent,
  createPhotoUploadIntent,
  deleteUserPhoto,
  getAuthenticatedUserSummary,
  listUserPhotos,
  listUserRecords,
  searchCountries,
  searchExperiences,
  searchPeaks,
  updateUserPhotoCaption,
  uploadUserPhotoBuffer,
  upsertUserRecord,
} from "@/lib/atlas-service";
import { buildLlmsFullTxt, buildLlmsTxt } from "@/lib/llms-docs";
import { getClientIp, mcpRateLimiter } from "@/lib/rate-limit";
import {
  MAX_DIRECT_BASE64_BYTES,
  MAX_PHOTO_UPLOAD_BYTES,
  parseBase64Image,
} from "@/lib/server-image";

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, any>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
}

const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: "search_catalog",
    title: "Search Atlas Catalog",
    description:
      "Search Atlas destinations and achievements (196 world countries, 47 unique Spanish provincial peaks across 52 demarcations, or experiences) to find exact `summit_id` and `sub_item_id` values before logging records or uploading photos.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["all", "countries", "peaks", "experiences"],
          default: "all",
          description: "Which catalog section to search.",
        },
        q: {
          type: "string",
          description: "Diacritic-insensitive search term (e.g. 'japon', 'mulhacen', 'aurora').",
        },
        continent: {
          type: "string",
          description: "Optional continent filter for countries (e.g. 'Europa', 'Asia').",
        },
        province: {
          type: "string",
          description: "Optional Spanish province filter for peaks (e.g. 'Granada', 'Asturias').",
        },
        category: {
          type: "string",
          description: "Optional experience category ID or name filter.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 250,
          default: 25,
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "get_my_profile",
    title: "Get My Atlas Profile",
    description:
      "Retrieve the authenticated user's profile settings, enabled modalities (peaks, countries, experiences), and completion progress (peaks out of 47, countries out of 196, experiences, and total photos).",
    inputSchema: {
      type: "object",
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "list_my_records",
    title: "List My Travel Records",
    description:
      "List the authenticated user's logged country visits, peak ascents, and experience records along with their attached photos.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["all", "country", "peak", "experience"],
          default: "all",
        },
        summit_id: {
          type: "string",
          description: "Optional filter for a specific country, peak, or experience ID.",
        },
        include_wishlist: {
          type: "boolean",
          default: false,
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "upsert_record",
    title: "Create or Update Travel Record",
    description:
      "Create or update a country visit, Spanish peak ascent, or experience record for the authenticated user.",
    inputSchema: {
      type: "object",
      required: ["summit_id"],
      properties: {
        summit_id: {
          type: "string",
          description: "Catalog ID (e.g. 'country-jp', 'granada', 'exp-aurora', or 'exp-big-five-land::lion').",
        },
        sub_item_id: {
          type: "string",
          description: "Sub-item ID for multi-step experiences (e.g. 'lion').",
        },
        achieved_on: {
          type: "string",
          description: "Start/achievement date in YYYY-MM-DD format (defaults to today UTC).",
        },
        date_unknown: {
          type: "boolean",
          description: "Set true when exact date is unknown (stores '1900-01-01').",
        },
        end_date: {
          type: "string",
          description: "Optional trip end date (YYYY-MM-DD) for countries/peaks.",
        },
        notes: { type: "string" },
        link: { type: "string", description: "Optional HTTP/HTTPS URL (route track, restaurant, guide...)." },
        link_name: { type: "string" },
        link_2: { type: "string" },
        link_name_2: { type: "string" },
        is_wishlist: { type: "boolean", default: false },
        lat: {
          type: "number",
          description: "Latitude (-90..90). Required for non-wishlist experience records.",
        },
        lng: {
          type: "number",
          description: "Longitude (-180..180). Required for non-wishlist experience records.",
        },
        location_name: { type: "string" },
        record_id: {
          type: "string",
          description: "Existing experience record UUID when updating an experience record.",
        },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "list_my_photos",
    title: "List My Photos",
    description:
      "List the authenticated user's uploaded photos with captions, dates, file sizes, and display URLs.",
    inputSchema: {
      type: "object",
      properties: {
        summit_id: { type: "string" },
        taken_on: { type: "string", description: "Filter by YYYY-MM-DD." },
        limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "upload_photo",
    title: "Upload Photo (Base64)",
    description:
      "Upload a photo (base64 or data URL, up to ~3.2 MB decoded) directly to a country, peak, or experience record. Validates magic bytes, strips EXIF, optimizes with Sharp (<=1600px WebP), stores in Cloudflare R2, enforces 4 photos/record and the 9.5 GB cap, and optionally auto-creates the visit/ascent record. For larger files (3.2-15 MB), use `create_photo_upload_intent` + HTTP PUT + `confirm_photo_upload`.",
    inputSchema: {
      type: "object",
      required: ["summit_id", "image_base64"],
      properties: {
        summit_id: {
          type: "string",
          description: "Target catalog ID (e.g. 'country-jp', 'granada', 'exp-aurora').",
        },
        sub_item_id: { type: "string" },
        image_base64: {
          type: "string",
          description: "Raw base64 string or `data:image/...;base64,...` data URL.",
        },
        file_name: { type: "string", default: "photo.jpg" },
        taken_on: { type: "string", description: "YYYY-MM-DD (defaults to today UTC)." },
        date_unknown: { type: "boolean" },
        caption: { type: "string" },
        shot_at: { type: "string", description: "Optional ISO-8601 timestamp." },
        auto_create_record: {
          type: "boolean",
          default: true,
          description: "Auto-create the country/peak record (or experience record when lat/lng provided) if not already logged.",
        },
        notes: { type: "string" },
        end_date: { type: "string" },
        link: { type: "string" },
        link_name: { type: "string" },
        link_2: { type: "string" },
        link_name_2: { type: "string" },
        lat: { type: "number" },
        lng: { type: "number" },
        location_name: { type: "string" },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "create_photo_upload_intent",
    title: "Create Presigned Photo Upload Intent",
    description:
      "Generate a short-lived presigned Cloudflare R2 PUT URL and signed `upload_token` for uploading large photos (up to 15 MB) past serverless body limits. After PUTting the raw bytes to `upload_url`, call `confirm_photo_upload`.",
    inputSchema: {
      type: "object",
      required: ["summit_id", "file_name", "content_type", "file_size"],
      properties: {
        summit_id: { type: "string" },
        sub_item_id: { type: "string" },
        file_name: { type: "string" },
        content_type: {
          type: "string",
          enum: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"],
        },
        file_size: { type: "integer", minimum: 1, maximum: MAX_PHOTO_UPLOAD_BYTES },
        taken_on: { type: "string" },
        date_unknown: { type: "boolean" },
        caption: { type: "string" },
        shot_at: { type: "string" },
        auto_create_record: { type: "boolean", default: true },
        notes: { type: "string" },
        end_date: { type: "string" },
        link: { type: "string" },
        link_name: { type: "string" },
        link_2: { type: "string" },
        link_name_2: { type: "string" },
        lat: { type: "number" },
        lng: { type: "number" },
        location_name: { type: "string" },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "confirm_photo_upload",
    title: "Confirm Presigned Photo Upload",
    description:
      "Verify magic bytes, optimize via Sharp, and register a photo that was uploaded to Cloudflare R2 using `create_photo_upload_intent`.",
    inputSchema: {
      type: "object",
      required: ["upload_token"],
      properties: {
        upload_token: {
          type: "string",
          description: "The signed upload_token returned by `create_photo_upload_intent`.",
        },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "update_photo_caption",
    title: "Update Photo Caption",
    description: "Update or clear the caption on an existing photo owned by the authenticated user.",
    inputSchema: {
      type: "object",
      required: ["photo_id", "caption"],
      properties: {
        photo_id: { type: "string" },
        caption: { type: ["string", "null"] },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "delete_photo",
    title: "Delete Photo",
    description:
      "Permanently delete a photo owned by the authenticated user from Cloudflare R2 and PostgreSQL.",
    inputSchema: {
      type: "object",
      required: ["photo_id"],
      properties: {
        photo_id: { type: "string" },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
];

const MCP_RESOURCES = [
  {
    uri: "atlas://docs/quickstart",
    name: "Atlas MCP & API Quickstart",
    description: "Authentication, upload flows, target ID formats, and photo rules for Atlas.",
    mimeType: "text/markdown",
  },
  {
    uri: "atlas://catalog/countries",
    name: "World Countries Catalog (196)",
    description: "Full JSON catalog of 196 world countries with `country-*` IDs and capitals.",
    mimeType: "application/json",
  },
  {
    uri: "atlas://catalog/peaks",
    name: "Spanish Provincial Peaks Catalog (47 unique peaks)",
    description: "Full JSON catalog of Spain's 47 physical highest provincial peaks (52 demarcations).",
    mimeType: "application/json",
  },
  {
    uri: "atlas://catalog/experiences",
    name: "Predefined Experiences Catalog",
    description: "Predefined adventure experiences and sub-items.",
    mimeType: "application/json",
  },
];

const MCP_PROMPTS = [
  {
    name: "upload-travel-photos",
    description: "Guide an agent step-by-step to upload travel or summit photos to Atlas.",
    arguments: [
      {
        name: "destination",
        description: "Country, peak, or experience name (e.g. 'Japón', 'Mulhacén', 'Auroras boreales').",
        required: true,
      },
      {
        name: "date",
        description: "Date of visit/ascent in YYYY-MM-DD format.",
        required: false,
      },
    ],
  },
  {
    name: "log-trip-summary",
    description: "Prepare and log a complete Atlas trip record with notes, links, and photos.",
    arguments: [
      {
        name: "destination",
        description: "Destination or peak name.",
        required: true,
      },
    ],
  },
];

function toolSuccess(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
  };
}

function toolError(payload: {
  code: string;
  title: string;
  detail: string;
  resolution?: string;
  extra?: Record<string, unknown>;
}) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

async function executeToolCall(
  name: string,
  args: Record<string, any>,
  request: Request,
  baseUrl: string,
  supabaseAdminOverride?: any
) {
  try {
    if (name === "search_catalog") {
      const optAuth = await authenticateApiRequest(request, {
        optional: true,
        supabaseAdminOverride,
      });
      const auth = optAuth.ok ? optAuth.auth : null;
      const type = String(args.type || "all").toLowerCase();
      const q = typeof args.q === "string" ? args.q : undefined;
      const limit = typeof args.limit === "number" ? args.limit : 25;

      const out: Record<string, unknown> = {};
      if (type === "all" || type === "countries") {
        out.countries = searchCountries({
          q,
          continent: typeof args.continent === "string" ? args.continent : undefined,
          limit,
        });
      }
      if (type === "all" || type === "peaks") {
        out.peaks = searchPeaks({
          q,
          province: typeof args.province === "string" ? args.province : undefined,
          limit,
        });
      }
      if (type === "all" || type === "experiences") {
        out.experiences = await searchExperiences(
          {
            q,
            category: typeof args.category === "string" ? args.category : undefined,
            limit,
          },
          auth
        );
      }
      if (!out.countries && !out.peaks && !out.experiences) {
        return toolError({
          code: "invalid_arguments",
          title: "Tipo de catálogo inválido",
          detail: "type debe ser 'all', 'countries', 'peaks' o 'experiences'.",
        });
      }
      return toolSuccess(out);
    }

    const scopeMap: Record<string, ApiScope> = {
      get_my_profile: "read",
      list_my_records: "read",
      list_my_photos: "read",
      upsert_record: "records:write",
      upload_photo: "photos:write",
      create_photo_upload_intent: "photos:write",
      confirm_photo_upload: "photos:write",
      update_photo_caption: "photos:write",
      delete_photo: "photos:write",
    };

    const requiredScope = scopeMap[name];
    if (!requiredScope) {
      return toolError({
        code: "unknown_tool",
        title: "Herramienta no encontrada",
        detail: `La herramienta MCP '${name}' no existe.`,
      });
    }

    const authRes = await authenticateApiRequest(request, {
      requiredScope,
      supabaseAdminOverride,
    });
    if (!authRes.ok || !authRes.auth) {
      const fail = !authRes.ok
        ? authRes
        : {
            code: "unauthorized",
            title: "Autenticación requerida",
            detail: "Falta token de autenticación.",
            resolution: `Configura Authorization: Bearer atlas_live_... desde ${baseUrl}/developers.`,
          };
      return toolError({
        code: fail.code,
        title: fail.title,
        detail: fail.detail,
        resolution: fail.resolution,
      });
    }

    const auth = authRes.auth;

    switch (name) {
      case "get_my_profile": {
        const data = await getAuthenticatedUserSummary(auth, baseUrl);
        return toolSuccess(data);
      }
      case "list_my_records": {
        const typeArg = String(args.type || "all") as
          | "all"
          | "country"
          | "peak"
          | "experience";
        const data = await listUserRecords(auth, {
          type: ["all", "country", "peak", "experience"].includes(typeArg)
            ? typeArg
            : "all",
          summit_id: typeof args.summit_id === "string" ? args.summit_id : null,
          include_wishlist: Boolean(args.include_wishlist),
          baseUrl,
        });
        return toolSuccess(data);
      }
      case "upsert_record": {
        const data = await upsertUserRecord(auth, {
          summit_id: String(args.summit_id || ""),
          sub_item_id: typeof args.sub_item_id === "string" ? args.sub_item_id : null,
          achieved_on: typeof args.achieved_on === "string" ? args.achieved_on : null,
          date_unknown: Boolean(args.date_unknown),
          end_date: typeof args.end_date === "string" ? args.end_date : null,
          notes: typeof args.notes === "string" ? args.notes : null,
          link: typeof args.link === "string" ? args.link : null,
          link_name: typeof args.link_name === "string" ? args.link_name : null,
          link_2: typeof args.link_2 === "string" ? args.link_2 : null,
          link_name_2: typeof args.link_name_2 === "string" ? args.link_name_2 : null,
          is_wishlist: Boolean(args.is_wishlist),
          lat: args.lat !== undefined ? Number(args.lat) : null,
          lng: args.lng !== undefined ? Number(args.lng) : null,
          location_name:
            typeof args.location_name === "string" ? args.location_name : null,
          record_id: typeof args.record_id === "string" ? args.record_id : null,
        });
        return toolSuccess(data);
      }
      case "list_my_photos": {
        const data = await listUserPhotos(auth, {
          summit_id: typeof args.summit_id === "string" ? args.summit_id : null,
          taken_on: typeof args.taken_on === "string" ? args.taken_on : null,
          limit: typeof args.limit === "number" ? args.limit : 100,
          baseUrl,
        });
        return toolSuccess(data);
      }
      case "upload_photo": {
        const parsed = parseBase64Image(String(args.image_base64 || ""));
        if (!parsed) {
          return toolError({
            code: "invalid_base64",
            title: "Imagen base64 inválida",
            detail:
              "image_base64 debe ser una cadena base64 válida o un data URL (`data:image/...;base64,...`).",
          });
        }
        if (parsed.buffer.length > MAX_DIRECT_BASE64_BYTES) {
          return toolError({
            code: "payload_too_large",
            title: "Imagen demasiado grande para subida directa",
            detail: `La imagen decodificada (${parsed.buffer.length} bytes) supera el límite directo de ${MAX_DIRECT_BASE64_BYTES} bytes.`,
            resolution:
              "Usa create_photo_upload_intent -> HTTP PUT a upload_url -> confirm_photo_upload para imágenes de hasta 15 MB.",
          });
        }
        const data = await uploadUserPhotoBuffer(auth, {
          buffer: parsed.buffer,
          fileName:
            typeof args.file_name === "string" && args.file_name.trim()
              ? args.file_name.trim()
              : "photo.jpg",
          summit_id: String(args.summit_id || ""),
          sub_item_id: typeof args.sub_item_id === "string" ? args.sub_item_id : null,
          taken_on: typeof args.taken_on === "string" ? args.taken_on : null,
          date_unknown: Boolean(args.date_unknown),
          caption: typeof args.caption === "string" ? args.caption : null,
          shot_at: typeof args.shot_at === "string" ? args.shot_at : null,
          auto_create_record:
            args.auto_create_record === undefined ? true : Boolean(args.auto_create_record),
          notes: typeof args.notes === "string" ? args.notes : null,
          end_date: typeof args.end_date === "string" ? args.end_date : null,
          link: typeof args.link === "string" ? args.link : null,
          link_name: typeof args.link_name === "string" ? args.link_name : null,
          link_2: typeof args.link_2 === "string" ? args.link_2 : null,
          link_name_2: typeof args.link_name_2 === "string" ? args.link_name_2 : null,
          lat: args.lat !== undefined ? Number(args.lat) : null,
          lng: args.lng !== undefined ? Number(args.lng) : null,
          location_name:
            typeof args.location_name === "string" ? args.location_name : null,
          baseUrl,
        });
        return toolSuccess(data);
      }
      case "create_photo_upload_intent": {
        const data = await createPhotoUploadIntent(auth, {
          summit_id: String(args.summit_id || ""),
          sub_item_id: typeof args.sub_item_id === "string" ? args.sub_item_id : null,
          file_name: String(args.file_name || "photo.jpg"),
          content_type: String(args.content_type || ""),
          file_size: Number(args.file_size || 0),
          taken_on: typeof args.taken_on === "string" ? args.taken_on : null,
          date_unknown: Boolean(args.date_unknown),
          caption: typeof args.caption === "string" ? args.caption : null,
          shot_at: typeof args.shot_at === "string" ? args.shot_at : null,
          auto_create_record:
            args.auto_create_record === undefined ? true : Boolean(args.auto_create_record),
          notes: typeof args.notes === "string" ? args.notes : null,
          end_date: typeof args.end_date === "string" ? args.end_date : null,
          link: typeof args.link === "string" ? args.link : null,
          link_name: typeof args.link_name === "string" ? args.link_name : null,
          link_2: typeof args.link_2 === "string" ? args.link_2 : null,
          link_name_2: typeof args.link_name_2 === "string" ? args.link_name_2 : null,
          lat: args.lat !== undefined ? Number(args.lat) : null,
          lng: args.lng !== undefined ? Number(args.lng) : null,
          location_name:
            typeof args.location_name === "string" ? args.location_name : null,
        });
        return toolSuccess(data);
      }
      case "confirm_photo_upload": {
        const data = await confirmPhotoUploadIntent(auth, {
          upload_token: String(args.upload_token || ""),
          baseUrl,
        });
        return toolSuccess(data);
      }
      case "update_photo_caption": {
        const data = await updateUserPhotoCaption(auth, {
          photo_id: String(args.photo_id || ""),
          caption: args.caption === null ? null : String(args.caption || ""),
          baseUrl,
        });
        return toolSuccess(data);
      }
      case "delete_photo": {
        const data = await deleteUserPhoto(auth, {
          photo_id: String(args.photo_id || ""),
        });
        return toolSuccess(data);
      }
      default:
        return toolError({
          code: "unknown_tool",
          title: "Herramienta no encontrada",
          detail: `Herramienta desconocida: ${name}`,
        });
    }
  } catch (err: any) {
    if (err instanceof AtlasServiceError) {
      return toolError({
        code: err.code,
        title: err.title,
        detail: err.message,
        resolution: err.resolution,
        extra: err.extra,
      });
    }
    return toolError({
      code: "internal_error",
      title: "Error interno ejecutando herramienta MCP",
      detail: err?.message || "Error inesperado.",
    });
  }
}

async function processSingleRpcMessage(
  msg: JsonRpcRequest,
  request: Request,
  baseUrl: string,
  supabaseAdminOverride?: any
): Promise<JsonRpcResponse | null> {
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return {
      jsonrpc: "2.0",
      id: msg && (typeof msg.id === "string" || typeof msg.id === "number") ? msg.id : null,
      error: { code: -32600, message: "Invalid Request: expected JSON-RPC 2.0 object." },
    };
  }

  const isNotification = msg.id === undefined;
  const id = msg.id ?? null;
  const params = msg.params && typeof msg.params === "object" ? msg.params : {};

  if (isNotification) {
    return null;
  }

  switch (msg.method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
        ? requested
        : SUPPORTED_PROTOCOL_VERSIONS[0];
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
            prompts: { listChanged: false },
          },
          serverInfo: {
            name: "atlas-mcp",
            version: "1.0.0",
          },
          instructions:
            "Use `search_catalog` to find exact country (`country-*`), Spanish peak, or experience IDs. Authenticate with `Authorization: Bearer atlas_live_...` (created at /developers) or a Supabase JWT, then call `upload_photo` (<=3.2 MB base64) or `create_photo_upload_intent` + PUT + `confirm_photo_upload` (up to 15 MB).",
        },
      };
    }

    case "ping": {
      return { jsonrpc: "2.0", id, result: {} };
    }

    case "tools/list": {
      return { jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } };
    }

    case "tools/call": {
      const toolName = typeof params.name === "string" ? params.name : "";
      if (!toolName) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "Missing required parameter 'name'." },
        };
      }
      const args =
        params.arguments && typeof params.arguments === "object" ? params.arguments : {};
      const result = await executeToolCall(
        toolName,
        args,
        request,
        baseUrl,
        supabaseAdminOverride
      );
      return { jsonrpc: "2.0", id, result };
    }

    case "resources/list": {
      return { jsonrpc: "2.0", id, result: { resources: MCP_RESOURCES } };
    }

    case "resources/read": {
      const uri = typeof params.uri === "string" ? params.uri : "";
      if (uri === "atlas://docs/quickstart") {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: "text/markdown",
                text: buildLlmsFullTxt(baseUrl),
              },
            ],
          },
        };
      }
      if (uri === "atlas://catalog/countries") {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(searchCountries({ limit: 250 }), null, 2),
              },
            ],
          },
        };
      }
      if (uri === "atlas://catalog/peaks") {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(searchPeaks({ limit: 100 }), null, 2),
              },
            ],
          },
        };
      }
      if (uri === "atlas://catalog/experiences") {
        const expData = await searchExperiences({ limit: 250 }, null);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(expData, null, 2),
              },
            ],
          },
        };
      }
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32002, message: `Resource not found: ${uri}` },
      };
    }

    case "prompts/list": {
      return { jsonrpc: "2.0", id, result: { prompts: MCP_PROMPTS } };
    }

    case "prompts/get": {
      const promptName = typeof params.name === "string" ? params.name : "";
      const promptArgs = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
      if (promptName === "upload-travel-photos") {
        const dest = String(promptArgs.destination || "<destination>");
        const dateText = promptArgs.date ? ` on ${promptArgs.date}` : "";
        return {
          jsonrpc: "2.0",
          id,
          result: {
            description: "Step-by-step instructions to upload photos to Atlas",
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Upload photos for destination "${dest}"${dateText} in Atlas:\n1. Call \`search_catalog\` with \`q: "${dest}"\` to resolve the exact \`summit_id\` (and \`sub_item_id\` if applicable).\n2. If the image is <= 3.2 MB, call \`upload_photo\` with \`summit_id\`, \`image_base64\`, \`taken_on\`, and \`caption\`. For larger images (up to 15 MB), call \`create_photo_upload_intent\`, HTTP PUT the raw image bytes to \`upload_url\`, then call \`confirm_photo_upload\` with \`upload_token\`.`,
                },
              },
            ],
          },
        };
      }
      if (promptName === "log-trip-summary") {
        const dest = String(promptArgs.destination || "<destination>");
        return {
          jsonrpc: "2.0",
          id,
          result: {
            description: "Create a structured travel or summit log entry",
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Search \`search_catalog\` for "${dest}", then call \`upsert_record\` with dates, notes, and helpful links, followed by \`upload_photo\` (max 4 photos per record).`,
                },
              },
            ],
          },
        };
      }
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: `Prompt not found: ${promptName}` },
      };
    }

    default:
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${msg.method}` },
      };
  }
}

export async function handleMcpPost(
  request: Request,
  options?: { supabaseAdminOverride?: any }
): Promise<NextResponse> {
  const baseUrl = getAppBaseUrl(request);
  const ip = getClientIp(request);
  const rate = mcpRateLimiter.check(ip);
  const rateHeaders = buildRateLimitHeaders(rate);

  if (!rate.success) {
    return jsonResponse(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32029,
          message: "Rate limit exceeded. Honor Retry-After before retrying.",
        },
      },
      429,
      rateHeaders
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return jsonResponse(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error: invalid JSON body." },
      },
      400,
      rateHeaders
    );
  }

  if (Array.isArray(parsedBody)) {
    if (parsedBody.length === 0) {
      return jsonResponse(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32600, message: "Invalid Request: empty JSON-RPC batch." },
        },
        400,
        rateHeaders
      );
    }

    const responses = (
      await Promise.all(
        parsedBody.map((item) =>
          processSingleRpcMessage(
            item as JsonRpcRequest,
            request,
            baseUrl,
            options?.supabaseAdminOverride
          )
        )
      )
    ).filter((r): r is JsonRpcResponse => r !== null);

    if (responses.length === 0) {
      return new NextResponse(null, {
        status: 202,
        headers: { ...API_CORS_HEADERS, ...rateHeaders },
      });
    }

    return jsonResponse(responses, 200, rateHeaders);
  }

  const singleRes = await processSingleRpcMessage(
    parsedBody as JsonRpcRequest,
    request,
    baseUrl,
    options?.supabaseAdminOverride
  );

  if (singleRes === null) {
    return new NextResponse(null, {
      status: 202,
      headers: { ...API_CORS_HEADERS, ...rateHeaders },
    });
  }

  return jsonResponse(singleRes, 200, rateHeaders);
}

export async function handleMcpGet(request: Request): Promise<NextResponse> {
  const baseUrl = getAppBaseUrl(request);
  const accept = (request.headers.get("Accept") || "").toLowerCase();

  if (accept.includes("text/event-stream") && !accept.includes("application/json")) {
    return new NextResponse(
      JSON.stringify({
        error: "SSE GET stream is not supported on this stateless Streamable HTTP MCP server. Use HTTP POST.",
      }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          Allow: "POST, OPTIONS",
          ...API_CORS_HEADERS,
        },
      }
    );
  }

  if (accept.includes("text/markdown")) {
    return new NextResponse(buildLlmsTxt(baseUrl), {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        ...API_CORS_HEADERS,
      },
    });
  }

  return jsonResponse({
    name: "atlas-mcp",
    version: "1.0.0",
    transport: "streamable-http",
    endpoint: `${baseUrl}/mcp`,
    protocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
    authentication: {
      schemes: ["bearer (atlas_live_... API Key)", "bearer (Supabase JWT)"],
      createKeyUrl: `${baseUrl}/developers`,
    },
    serverCard: `${baseUrl}/.well-known/mcp/server-card.json`,
    openApiSpec: `${baseUrl}/openapi.json`,
    docs: `${baseUrl}/llms.txt`,
    tools: MCP_TOOLS.map((t) => t.name),
  });
}

export function handleMcpDelete(): NextResponse {
  return new NextResponse(null, {
    status: 405,
    headers: {
      Allow: "POST, GET, OPTIONS",
      ...API_CORS_HEADERS,
    },
  });
}

export function handleMcpOptions(): NextResponse {
  return corsPreflightResponse();
}
