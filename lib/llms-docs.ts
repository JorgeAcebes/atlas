export function buildLlmsTxt(baseUrl: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  return `# Atlas

> Social & cartographic travel log for Spain's 47 unique physical provincial peaks (52 provincial demarcations), 196 world countries, and adventure experiences. AI agents can search the catalog, log visits/ascents, and upload photos directly via MCP (Streamable HTTP) or the v1 REST API.

## MCP Server

- Streamable HTTP Endpoint: ${cleanBase}/mcp
- Alternate Endpoint Alias: ${cleanBase}/api/mcp
- MCP Server Card: ${cleanBase}/.well-known/mcp/server-card.json
- Authentication: \`Authorization: Bearer atlas_live_...\` (Personal API Key from ${cleanBase}/developers) or a Supabase user JWT.

## REST API v1

- OpenAPI 3.1 Spec: ${cleanBase}/openapi.json
- Direct Photo Upload (multipart/form-data or JSON base64): \`POST ${cleanBase}/api/v1/photos\`
- Large Photo Presigned Upload (>3.2 MB up to 15 MB): \`POST ${cleanBase}/api/v1/photos/upload-intent\` -> HTTP \`PUT\` to \`upload_url\` -> \`POST ${cleanBase}/api/v1/photos/confirm\`
- Catalog Search: \`GET ${cleanBase}/api/v1/catalog/countries\`, \`GET ${cleanBase}/api/v1/catalog/peaks\`, \`GET ${cleanBase}/api/v1/catalog/experiences\`
- Records & Progress: \`GET ${cleanBase}/api/v1/me\`, \`GET|POST ${cleanBase}/api/v1/records\`
- Photo Management: \`GET ${cleanBase}/api/v1/photos\`, \`PATCH|DELETE ${cleanBase}/api/v1/photos/{id}\`

## Discovery & Documentation

- [Developer Portal & API Key Manager](${cleanBase}/developers): Generate and revoke \`atlas_live_...\` keys and view copy-paste MCP client configs.
- [Complete Agent Reference](${cleanBase}/llms-full.txt): Detailed schemas, MCP tool definitions, ID conventions, and curl examples.
- [AI Catalog](${cleanBase}/.well-known/ai-catalog.json): Machine-readable AI service catalog.
- [API Catalog](${cleanBase}/.well-known/api-catalog): RFC 9727 linkset for API discovery.

## Photo Upload Rules

- Accepted raster formats: JPEG, PNG, WebP, GIF, AVIF (validated by magic bytes; SVG/HTML rejected).
- Maximum input size: 15 MB; direct JSON/multipart recommended up to 3.2 MB, presigned R2 PUT for 3.2-15 MB.
- Server automatically strips EXIF metadata, resizes images to <= 1600px, and converts to WebP (q82) where smaller.
- Maximum 4 photos per destination/date record; global 9.5 GB Cloudflare R2 storage safety cap enforced.
`;
}

export function buildLlmsFullTxt(baseUrl: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  return `# Atlas · Complete MCP & REST API Reference for AI Agents

Base URL: ${cleanBase}
Developer Portal & API Keys: ${cleanBase}/developers

---

## 1. Authentication

Atlas supports two Bearer token formats on both \`/mcp\` and \`/api/v1/*\`:

1. **Personal API Keys (Recommended for AI Agents)**:
   - Format: \`atlas_live_<token>\`
   - Generate or revoke keys in the browser at ${cleanBase}/developers (requires signing in to Atlas).
   - Scopes: \`read\`, \`photos:write\`, \`records:write\`.
   - Pass via \`Authorization: Bearer atlas_live_...\` or \`X-API-Key: atlas_live_...\`.
2. **Supabase User Access JWT**:
   - Obtain via \`POST ${cleanBase}/api/auth/username-login\` with JSON \`{"username":"...","password":"..."}\`.
   - Pass \`session.access_token\` in \`Authorization: Bearer <jwt>\`.

---

## 2. MCP Server (Streamable HTTP)

Endpoint: \`${cleanBase}/mcp\` (JSON-RPC 2.0 over HTTP POST)

### Client Configuration (Claude Desktop, Cursor, Antigravity, etc.)

\`\`\`json
{
  "mcpServers": {
    "atlas": {
      "type": "http",
      "url": "${cleanBase}/mcp",
      "headers": {
        "Authorization": "Bearer atlas_live_YOUR_API_KEY"
      }
    }
  }
}
\`\`\`

### Available MCP Tools

| Tool | Auth / Scope | Purpose |
| :--- | :--- | :--- |
| \`search_catalog\` | Public (optional auth for custom experiences) | Search countries (\`196\`), Spanish provincial peaks (\`47\` unique peaks / \`52\` demarcations), or experiences. |
| \`get_my_profile\` | \`read\` | Get authenticated user profile, modality flags, and progress counts. |
| \`list_my_records\` | \`read\` | List logged country visits, peak ascents, and experiences with attached photos. |
| \`upsert_record\` | \`records:write\` | Create or update a country visit, peak ascent, or experience record. |
| \`list_my_photos\` | \`read\` | List uploaded photos, captions, and URLs. |
| \`upload_photo\` | \`photos:write\` | Upload a base64 / data URL photo (<=3.2 MB), optimize via Sharp, store in R2, and optionally auto-create the record. |
| \`create_photo_upload_intent\` | \`photos:write\` | Mint a 10-minute presigned R2 PUT URL + \`upload_token\` for photos up to 15 MB. |
| \`confirm_photo_upload\` | \`photos:write\` | Validate magic bytes, optimize via Sharp, and register a presigned upload in \`summit_photos\`. |
| \`update_photo_caption\` | \`photos:write\` | Update or clear a photo caption. |
| \`delete_photo\` | \`photos:write\` | Delete a photo from Cloudflare R2 and PostgreSQL. |

### Target ID Conventions (\`summit_id\`)

- **Countries**: \`country-<iso_a2_lower>\` (e.g. \`country-jp\`, \`country-es\`, \`country-fr\`).
- **Peaks**: peak ID (e.g. \`granada\` for Mulhacén, \`santa-cruz-tenerife\` for Teide, \`gorbea\`, \`cerredo\`, \`penalara\`, \`trevinca\`, \`moncayo\`).
- **Experiences**: predefined ID (e.g. \`exp-aurora\`, \`exp-big-five-land\`) or user custom experience UUID.
  - Experiences with sub-items require \`sub_item_id\` (e.g. \`summit_id: "exp-big-five-land", sub_item_id: "lion"\`, or \`"exp-big-five-land::lion"\`).
  - Logging an experience requires \`lat\` and \`lng\` coordinates when \`auto_create_record\` is enabled.

---

## 3. REST API v1 Quick Examples

### A. Search Catalog (No Auth Required)

\`\`\`bash
curl "${cleanBase}/api/v1/catalog/countries?q=japon"
curl "${cleanBase}/api/v1/catalog/peaks?q=mulhacen"
curl "${cleanBase}/api/v1/catalog/experiences?q=aurora"
\`\`\`

### B. Direct Multipart Photo Upload (<= 3.2 MB)

\`\`\`bash
curl -X POST "${cleanBase}/api/v1/photos" \\
  -H "Authorization: Bearer atlas_live_YOUR_API_KEY" \\
  -F "summit_id=country-jp" \\
  -F "taken_on=2025-04-12" \\
  -F "caption=Monte Fuji al amanecer" \\
  -F "auto_create_record=true" \\
  -F "file=@./fuji.jpg"
\`\`\`

### C. Direct JSON Base64 Photo Upload (<= 3.2 MB)

\`\`\`bash
curl -X POST "${cleanBase}/api/v1/photos" \\
  -H "Authorization: Bearer atlas_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "summit_id": "granada",
    "taken_on": "2025-07-20",
    "caption": "Cumbre del Mulhacén",
    "file_name": "mulhacen.jpg",
    "image_base64": "data:image/jpeg;base64,/9j/4AAQ..."
  }'
\`\`\`

### D. Large Photo Upload via Presigned Cloudflare R2 URL (3.2 MB - 15 MB)

\`\`\`bash
# 1. Request presigned PUT URL + upload_token
INTENT=$(curl -s -X POST "${cleanBase}/api/v1/photos/upload-intent" \\
  -H "Authorization: Bearer atlas_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "summit_id": "country-is",
    "file_name": "aurora-raw.jpg",
    "content_type": "image/jpeg",
    "file_size": 6291456,
    "taken_on": "2025-11-04",
    "caption": "Auroras en Vik"
  }')

# 2. PUT raw bytes directly to upload_url
curl -X PUT "$(echo $INTENT | jq -r .upload_url)" \\
  -H "Content-Type: image/jpeg" \\
  --data-binary @./aurora-raw.jpg

# 3. Confirm, optimize & register photo in Atlas
curl -X POST "${cleanBase}/api/v1/photos/confirm" \\
  -H "Authorization: Bearer atlas_live_YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{\\"upload_token\\": \\"$(echo $INTENT | jq -r .upload_token)\\"}"
\`\`\`

---

## 4. Error Format (RFC 9457)

All REST API errors return \`application/problem+json\` with \`status\`, \`code\`, \`title\`, \`detail\`, and \`resolution\`:
- \`unauthorized\` (401) / \`invalid_api_key\` (401) / \`invalid_token\` (401)
- \`insufficient_scope\` (403) / \`session_required\` (403)
- \`invalid_target\` (400) / \`coordinates_required\` (400) / \`unsupported_image_format\` (400)
- \`photo_limit_exceeded\` (409): Record already has 4 photos
- \`payload_too_large\` (413): Exceeds 15 MB file limit or 3.2 MB direct JSON limit
- \`rate_limit_exceeded\` (429): Honor \`Retry-After\` header
- \`storage_limit_exceeded\` (507): Global 9.5 GB Cloudflare R2 free-tier guard triggered
`;
}
