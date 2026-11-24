export function buildOpenApiSpec(baseUrl: string) {
  const cleanBase = baseUrl.replace(/\/+$/, "");

  return {
    openapi: "3.1.0",
    info: {
      title: "Atlas Travel-Log & Photo API",
      version: "1.0.0",
      description:
        "Machine-readable REST API for Atlas (47 Spanish Provincial Peaks, 196 Countries & Experiences). Supports Personal API Keys (`atlas_live_...`) and Supabase Bearer JWTs to search destinations, log records, and upload/optimize photos directly into Cloudflare R2.",
      contact: {
        name: "Atlas",
        url: `${cleanBase}/developers`,
        email: "atlas.maplog@gmail.com",
      },
    },
    servers: [
      {
        url: cleanBase,
        description: "Atlas Production / Active Deployment",
      },
    ],
    security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "Atlas API Key (atlas_live_...) or Supabase JWT",
          description:
            "Send 'Authorization: Bearer atlas_live_...' (created at /developers) or a Supabase user access token.",
        },
        apiKeyHeader: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "Alternative header accepting a Personal API Key ('atlas_live_...').",
        },
      },
      schemas: {
        ProblemDetails: {
          type: "object",
          required: ["type", "title", "status", "code", "detail"],
          properties: {
            type: { type: "string", format: "uri" },
            title: { type: "string" },
            status: { type: "integer" },
            code: { type: "string" },
            detail: { type: "string" },
            resolution: { type: "string" },
          },
        },
        Photo: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            summit_id: { type: "string", example: "country-jp" },
            storage_path: { type: "string" },
            public_url: { type: "string" },
            display_url: { type: "string", format: "uri" },
            taken_on: { type: "string", format: "date" },
            shot_at: { type: "string", format: "date-time", nullable: true },
            caption: { type: "string", nullable: true },
            file_size: { type: "integer" },
            created_at: { type: "string", format: "date-time" },
          },
        },
      },
    },
    paths: {
      "/api/v1/catalog/countries": {
        get: {
          summary: "Search the 196 world countries catalog",
          security: [],
          parameters: [
            { name: "q", in: "query", schema: { type: "string" }, description: "Diacritic-insensitive search across name, capital, iso_a2, or ID." },
            { name: "continent", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 250 } },
          ],
          responses: {
            "200": { description: "Countries matching query" },
          },
        },
      },
      "/api/v1/catalog/peaks": {
        get: {
          summary: "Search the 47 unique physical Spanish provincial peaks (52 demarcations)",
          security: [],
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "province", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          ],
          responses: {
            "200": { description: "Unique peaks matching query" },
          },
        },
      },
      "/api/v1/catalog/experiences": {
        get: {
          summary: "Search predefined (and if authenticated, custom) experiences",
          security: [{}, { bearerAuth: [] }, { apiKeyHeader: [] }],
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 250 } },
          ],
          responses: {
            "200": { description: "Experiences matching query" },
          },
        },
      },
      "/api/v1/me": {
        get: {
          summary: "Get authenticated user profile and progress summary",
          responses: {
            "200": { description: "Profile & counts (peaks/47, countries/196, experiences, photos)" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/v1/records": {
        get: {
          summary: "List authenticated user's visits, peak ascents, and experiences with attached photos",
          parameters: [
            { name: "type", in: "query", schema: { type: "string", enum: ["all", "country", "peak", "experience"] } },
            { name: "summit_id", in: "query", schema: { type: "string" } },
            { name: "include_wishlist", in: "query", schema: { type: "boolean" } },
          ],
          responses: { "200": { description: "User records list" } },
        },
        post: {
          summary: "Create or update a country visit, peak ascent, or experience record",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["summit_id"],
                  properties: {
                    summit_id: { type: "string", example: "country-jp" },
                    sub_item_id: { type: "string", nullable: true },
                    achieved_on: { type: "string", format: "date" },
                    date_unknown: { type: "boolean" },
                    end_date: { type: "string", format: "date", nullable: true },
                    notes: { type: "string", nullable: true },
                    link: { type: "string", format: "uri", nullable: true },
                    link_name: { type: "string", nullable: true },
                    link_2: { type: "string", format: "uri", nullable: true },
                    link_name_2: { type: "string", nullable: true },
                    is_wishlist: { type: "boolean" },
                    lat: { type: "number", nullable: true },
                    lng: { type: "number", nullable: true },
                    location_name: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Upserted record" } },
        },
      },
      "/api/v1/photos": {
        get: {
          summary: "List authenticated user's uploaded photos",
          parameters: [
            { name: "summit_id", in: "query", schema: { type: "string" } },
            { name: "taken_on", in: "query", schema: { type: "string", format: "date" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
          ],
          responses: { "200": { description: "Photos array" } },
        },
        post: {
          summary: "Upload a photo directly via multipart/form-data or JSON base64 (optimized with Sharp)",
          description:
            "Accepts files up to ~3.2 MB directly in Vercel serverless requests (for files 3.2-15 MB, use /api/v1/photos/upload-intent + /confirm). Automatically validates magic bytes, strips EXIF, resizes <=1600px, converts to WebP, enforces max 4 photos per record and the 9.5 GB R2 cap, and optionally auto-creates the target visit/ascent record.",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["summit_id", "file"],
                  properties: {
                    summit_id: { type: "string", example: "country-jp" },
                    sub_item_id: { type: "string" },
                    taken_on: { type: "string", format: "date" },
                    date_unknown: { type: "boolean" },
                    caption: { type: "string" },
                    shot_at: { type: "string", format: "date-time" },
                    auto_create_record: { type: "boolean", default: true },
                    file: { type: "string", format: "binary" },
                  },
                },
              },
              "application/json": {
                schema: {
                  type: "object",
                  required: ["summit_id", "image_base64"],
                  properties: {
                    summit_id: { type: "string", example: "country-jp" },
                    sub_item_id: { type: "string", nullable: true },
                    image_base64: { type: "string", description: "Base64 or data:image/...;base64,... string" },
                    file_name: { type: "string", example: "fuji.jpg" },
                    taken_on: { type: "string", format: "date" },
                    date_unknown: { type: "boolean" },
                    caption: { type: "string", nullable: true },
                    shot_at: { type: "string", format: "date-time" },
                    auto_create_record: { type: "boolean", default: true },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Photo uploaded & registered" },
            "409": { description: "Maximum 4 photos per record reached" },
            "507": { description: "9.5 GB R2 free-tier storage cap reached" },
          },
        },
      },
      "/api/v1/photos/upload-intent": {
        post: {
          summary: "Request a presigned Cloudflare R2 PUT URL for large photos (up to 15 MB)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["summit_id", "file_name", "content_type", "file_size"],
                  properties: {
                    summit_id: { type: "string" },
                    sub_item_id: { type: "string", nullable: true },
                    file_name: { type: "string" },
                    content_type: { type: "string", enum: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"] },
                    file_size: { type: "integer", minimum: 1, maximum: 15728640 },
                    taken_on: { type: "string", format: "date" },
                    caption: { type: "string", nullable: true },
                    auto_create_record: { type: "boolean", default: true },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Presigned PUT URL and signed upload_token" } },
        },
      },
      "/api/v1/photos/confirm": {
        post: {
          summary: "Verify, optimize with Sharp, and register a photo uploaded via presigned URL",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["upload_token"],
                  properties: {
                    upload_token: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { "201": { description: "Confirmed and optimized photo metadata" } },
        },
      },
      "/api/v1/photos/{id}": {
        patch: {
          summary: "Update a photo caption",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    caption: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Updated photo" } },
        },
        delete: {
          summary: "Delete a photo from Cloudflare R2 and PostgreSQL",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Photo deleted" } },
        },
      },
      "/api/v1/keys": {
        get: {
          summary: "List user's personal API keys (requires Supabase user session JWT)",
          responses: { "200": { description: "API keys metadata" } },
        },
        post: {
          summary: "Create a new Personal API Key (`atlas_live_...`, requires Supabase user session JWT)",
          responses: { "201": { description: "Newly created API key (secret returned once)" } },
        },
      },
      "/api/v1/keys/{id}": {
        delete: {
          summary: "Revoke a Personal API Key (requires Supabase user session JWT)",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "API key revoked" } },
        },
      },
    },
  };
}
