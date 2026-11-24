import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { apiRateLimiter, mcpRateLimiter } from "@/lib/rate-limit";

const r2Mocks = vi.hoisted(() => ({
  uploadedObjects: new Map<string, { buffer: Buffer; contentType: string }>(),
  deletedKeys: [] as string[],
  storageBytesUsed: 1024,
  r2Configured: true,
}));

vi.mock("@/lib/r2-storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/r2-storage")>("@/lib/r2-storage");
  return {
    ...actual,
    isR2Configured: () => r2Mocks.r2Configured,
    checkStorageLimit: async (additionalBytes: number) => {
      const maxBytes = actual.getMaxStorageBytes();
      const projected = r2Mocks.storageBytesUsed + Math.max(0, additionalBytes);
      const allowed = projected <= maxBytes;
      return {
        allowed,
        currentBytes: r2Mocks.storageBytesUsed,
        maxBytes,
        remainingBytes: allowed ? maxBytes - projected : 0,
        reason: allowed ? ("OK" as const) : ("STORAGE_LIMIT_EXCEEDED" as const),
      };
    },
    uploadR2Object: async (opts: { key: string; buffer: Buffer | Uint8Array; contentType: string }) => {
      const buf = Buffer.isBuffer(opts.buffer) ? opts.buffer : Buffer.from(opts.buffer);
      r2Mocks.uploadedObjects.set(opts.key, { buffer: buf, contentType: opts.contentType });
      return {
        publicUrl: `/api/photos/view/${opts.key}`,
        storagePath: opts.key,
      };
    },
    createPresignedR2UploadUrl: async (opts: {
      key: string;
      contentType: string;
      contentLength: number;
    }) => ({
      uploadUrl: `https://r2.example.test/presigned/${encodeURIComponent(opts.key)}`,
      publicUrl: `/api/photos/view/${opts.key}`,
      storagePath: opts.key,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    }),
    getR2ObjectBuffer: async (key: string) => {
      const entry = r2Mocks.uploadedObjects.get(key);
      if (!entry) return null;
      return {
        buffer: entry.buffer,
        contentType: entry.contentType,
        contentLength: entry.buffer.length,
      };
    },
    deleteR2Object: async (key: string) => {
      r2Mocks.deletedKeys.push(key);
      r2Mocks.uploadedObjects.delete(key);
      return true;
    },
    deleteR2Objects: async (keys: string[]) => {
      for (const k of keys) {
        r2Mocks.deletedKeys.push(k);
        r2Mocks.uploadedObjects.delete(k);
      }
      return true;
    },
  };
});

const authMocks = vi.hoisted(() => ({
  mockAuthContext: null as any,
}));

vi.mock("@/lib/api-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-auth")>("@/lib/api-auth");
  return {
    ...actual,
    authenticateApiRequest: async (request: Request, options?: any) => {
      const token = actual.extractBearerToken(request);
      if (!token) {
        if (options?.optional) return { ok: true, auth: null };
        return {
          ok: false,
          status: 401,
          code: "unauthorized",
          title: "Autenticación requerida",
          detail: "Falta token.",
          resolution: "Genera una API Key en /developers.",
        };
      }
      if (authMocks.mockAuthContext) {
        if (options?.requiredScope && !authMocks.mockAuthContext.scopes.includes(options.requiredScope)) {
          return {
            ok: false,
            status: 403,
            code: "insufficient_scope",
            title: "Permisos insuficientes",
            detail: "Scope insuficiente.",
            resolution: "Actualiza scopes.",
          };
        }
        return { ok: true, auth: authMocks.mockAuthContext };
      }
      return actual.authenticateApiRequest(request, options);
    },
  };
});

import { handleMcpGet, handleMcpPost } from "@/lib/mcp-server";
import { GET as getOpenApi } from "@/app/openapi.json/route";
import { GET as getLlmsTxt } from "@/app/llms.txt/route";
import { GET as getLlmsFullTxt } from "@/app/llms-full.txt/route";
import { GET as getServerCard } from "@/app/.well-known/mcp/server-card.json/route";
import { GET as getAiCatalog } from "@/app/.well-known/ai-catalog.json/route";
import { GET as getApiCatalog } from "@/app/.well-known/api-catalog/route";
import { POST as postPhotos } from "@/app/api/v1/photos/route";
import { POST as postUploadIntent } from "@/app/api/v1/photos/upload-intent/route";
import { POST as postConfirm } from "@/app/api/v1/photos/confirm/route";

function createInMemorySupabase(options?: { failPhotoInsert?: boolean }) {
  const tables: Record<string, Array<Record<string, any>>> = {
    profiles: [{ id: "user-1", username: "explorer", is_public: true }],
    ascents: [],
    experience_records: [],
    summit_photos: [],
    custom_experiences: [],
    custom_experience_categories: [],
    hidden_items: [],
  };

  const makeBuilder = (table: string) => {
    const filters: Array<(r: Record<string, any>) => boolean> = [];
    let pendingInsert: any = null;
    let pendingUpsert: any = null;
    let pendingUpdate: any = null;
    let isDelete = false;
    let isSingle = false;
    let isMaybeSingle = false;

    const builder: any = {
      select: () => builder,
      eq: (col: string, val: any) => {
        filters.push((r) => r[col] === val);
        return builder;
      },
      match: (criteria: Record<string, any>) => {
        for (const [k, v] of Object.entries(criteria)) {
          filters.push((r) => r[k] === v);
        }
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      single: () => {
        isSingle = true;
        return builder;
      },
      maybeSingle: () => {
        isMaybeSingle = true;
        return builder;
      },
      insert: (row: any) => {
        pendingInsert = row;
        return builder;
      },
      upsert: (row: any) => {
        pendingUpsert = row;
        return builder;
      },
      update: (patch: any) => {
        pendingUpdate = patch;
        return builder;
      },
      delete: () => {
        isDelete = true;
        return builder;
      },
      then: (resolve: any) => {
        const rows = tables[table] || [];
        if (pendingInsert) {
          if (table === "summit_photos" && options?.failPhotoInsert) {
            return Promise.resolve({
              data: null,
              error: { message: "Simulated DB insert error" },
            }).then(resolve);
          }
          const items = Array.isArray(pendingInsert) ? pendingInsert : [pendingInsert];
          const created = items.map((item, idx) => ({
            id: item.id || `${table}-${rows.length + idx + 1}`,
            created_at: new Date().toISOString(),
            ...item,
          }));
          rows.push(...created);
          return Promise.resolve({
            data: isSingle ? created[0] : created,
            error: null,
          }).then(resolve);
        }
        if (pendingUpsert) {
          const item = {
            id: pendingUpsert.id || `${table}-${rows.length + 1}`,
            created_at: new Date().toISOString(),
            ...pendingUpsert,
          };
          const existingIdx = rows.findIndex(
            (r) =>
              r.user_id === item.user_id &&
              r.summit_id === item.summit_id &&
              r.achieved_on === item.achieved_on
          );
          if (existingIdx >= 0) {
            rows[existingIdx] = { ...rows[existingIdx], ...item };
          } else {
            rows.push(item);
          }
          return Promise.resolve({
            data: isSingle ? item : [item],
            error: null,
          }).then(resolve);
        }
        if (pendingUpdate) {
          const updated: any[] = [];
          for (const r of rows) {
            if (filters.every((f) => f(r))) {
              Object.assign(r, pendingUpdate);
              updated.push(r);
            }
          }
          return Promise.resolve({
            data: isMaybeSingle || isSingle ? updated[0] || null : updated,
            error: null,
          }).then(resolve);
        }
        if (isDelete) {
          const kept = rows.filter((r) => !filters.every((f) => f(r)));
          tables[table] = kept;
          return Promise.resolve({ data: null, error: null }).then(resolve);
        }
        const matched = rows.filter((r) => filters.every((f) => f(r)));
        if (isMaybeSingle || isSingle) {
          return Promise.resolve({ data: matched[0] || null, error: null }).then(resolve);
        }
        return Promise.resolve({ data: matched, error: null, count: matched.length }).then(resolve);
      },
    };
    return builder;
  };

  return {
    tables,
    from: (table: string) => makeBuilder(table),
    storage: {
      from: () => ({ remove: async () => ({ data: [], error: null }) }),
    },
  };
}

async function createSamplePngBuffer(): Promise<Buffer> {
  return sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 36, g: 95, b: 82 } },
  })
    .png()
    .toBuffer();
}

describe("MCP Server, Discovery Endpoints & REST Photo Upload Flows", () => {
  let mockDb: ReturnType<typeof createInMemorySupabase>;

  beforeEach(() => {
    apiRateLimiter.reset();
    mcpRateLimiter.reset();
    r2Mocks.uploadedObjects.clear();
    r2Mocks.deletedKeys = [];
    r2Mocks.storageBytesUsed = 1024;
    r2Mocks.r2Configured = true;
    process.env.ATLAS_UPLOAD_TOKEN_SECRET = "test-upload-intent-secret-987654321";

    mockDb = createInMemorySupabase();
    authMocks.mockAuthContext = {
      userId: "user-1",
      authType: "api_key",
      keyId: "key-1",
      scopes: ["read", "photos:write", "records:write"],
      supabase: mockDb,
    };
  });

  describe("MCP Streamable HTTP JSON-RPC 2.0", () => {
    it("handles initialize, notifications/initialized (202), ping, tools/list, resources, prompts, and errors", async () => {
      const initRes = await handleMcpPost(
        new Request("https://atlas-log.vercel.app/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: { protocolVersion: "2025-06-18" },
          }),
        })
      );
      expect(initRes.status).toBe(200);
      const initJson = await initRes.json();
      expect(initJson.result.protocolVersion).toBe("2025-06-18");
      expect(initJson.result.serverInfo.name).toBe("atlas-mcp");

      const notifRes = await handleMcpPost(
        new Request("https://atlas-log.vercel.app/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "notifications/initialized",
          }),
        })
      );
      expect(notifRes.status).toBe(202);

      const toolsRes = await handleMcpPost(
        new Request("https://atlas-log.vercel.app/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
        })
      );
      const toolsJson = await toolsRes.json();
      expect(toolsJson.result.tools).toHaveLength(10);
      expect(toolsJson.result.tools.every((t: any) => t.inputSchema && t.annotations)).toBe(true);

      const batchRes = await handleMcpPost(
        new Request("https://atlas-log.vercel.app/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([
            { jsonrpc: "2.0", id: "p", method: "ping" },
            { jsonrpc: "2.0", id: "r", method: "resources/list" },
            { jsonrpc: "2.0", id: "pr", method: "prompts/list" },
          ]),
        })
      );
      const batchJson = await batchRes.json();
      expect(batchJson).toHaveLength(3);
      expect(batchJson[1].result.resources.length).toBeGreaterThanOrEqual(4);
      expect(batchJson[2].result.prompts.length).toBeGreaterThanOrEqual(2);

      const readRes = await handleMcpPost(
        new Request("https://atlas-log.vercel.app/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 3,
            method: "resources/read",
            params: { uri: "atlas://docs/quickstart" },
          }),
        })
      );
      const readJson = await readRes.json();
      expect(readJson.result.contents[0].mimeType).toBe("text/markdown");

      const promptRes = await handleMcpPost(
        new Request("https://atlas-log.vercel.app/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 4,
            method: "prompts/get",
            params: { name: "upload-travel-photos", arguments: { destination: "Japón" } },
          }),
        })
      );
      const promptJson = await promptRes.json();
      expect(promptJson.result.messages[0].content.text).toContain("Japón");

      const badJsonRes = await handleMcpPost(
        new Request("https://atlas-log.vercel.app/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{not-json",
        })
      );
      expect((await badJsonRes.json()).error.code).toBe(-32700);

      const unknownMethodRes = await handleMcpPost(
        new Request("https://atlas-log.vercel.app/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "nope/method" }),
        })
      );
      expect((await unknownMethodRes.json()).error.code).toBe(-32601);
    });

    it("executes public search_catalog and returns isError: true on unauthenticated upload_photo", async () => {
      const searchRes = await handleMcpPost(
        new Request("https://atlas-log.vercel.app/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 10,
            method: "tools/call",
            params: { name: "search_catalog", arguments: { type: "countries", q: "japon" } },
          }),
        })
      );
      const searchJson = await searchRes.json();
      expect(searchJson.result.isError).toBeUndefined();
      expect(searchJson.result.structuredContent.countries.items[0].id).toBe("country-jp");

      const unauthUploadRes = await handleMcpPost(
        new Request("https://atlas-log.vercel.app/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 11,
            method: "tools/call",
            params: {
              name: "upload_photo",
              arguments: { summit_id: "country-jp", image_base64: "abc" },
            },
          }),
        })
      );
      const unauthJson = await unauthUploadRes.json();
      expect(unauthJson.result.isError).toBe(true);
      expect(unauthJson.result.content[0].text).toContain("unauthorized");
    });

    it("handles GET /mcp discovery JSON vs 405 for SSE streams", async () => {
      const jsonGet = await handleMcpGet(new Request("https://atlas-log.vercel.app/mcp"));
      expect(jsonGet.status).toBe(200);
      const info = await jsonGet.json();
      expect(info.transport).toBe("streamable-http");

      const sseGet = await handleMcpGet(
        new Request("https://atlas-log.vercel.app/mcp", {
          headers: { Accept: "text/event-stream" },
        })
      );
      expect(sseGet.status).toBe(405);
    });
  });

  describe("Discovery Endpoints & Migration 035", () => {
    it("serves OpenAPI 3.1, llms.txt, llms-full.txt, MCP Server Card, AI Catalog & API Catalog", async () => {
      const openApiRes = await getOpenApi(new Request("https://atlas-log.vercel.app/openapi.json"));
      const openApi = await openApiRes.json();
      expect(openApi.openapi).toBe("3.1.0");
      expect(openApi.paths["/api/v1/photos"]).toBeDefined();
      expect(openApi.components.securitySchemes.bearerAuth).toBeDefined();

      const llmsRes = await getLlmsTxt(new Request("https://atlas-log.vercel.app/llms.txt"));
      expect(llmsRes.headers.get("Content-Type")).toContain("text/markdown");
      expect(await llmsRes.text()).toContain("/mcp");

      const llmsFullRes = await getLlmsFullTxt(
        new Request("https://atlas-log.vercel.app/llms-full.txt")
      );
      expect(await llmsFullRes.text()).toContain("upload-intent");

      const cardRes = await getServerCard(
        new Request("https://atlas-log.vercel.app/.well-known/mcp/server-card.json")
      );
      const card = await cardRes.json();
      expect(card.remotes[0].type).toBe("streamable-http");
      expect(card.remotes[0].url).toBe("https://atlas-log.vercel.app/mcp");

      const aiCatalogRes = await getAiCatalog(
        new Request("https://atlas-log.vercel.app/.well-known/ai-catalog.json")
      );
      expect((await aiCatalogRes.json()).artifacts).toHaveLength(3);

      const apiCatalogRes = await getApiCatalog(
        new Request("https://atlas-log.vercel.app/.well-known/api-catalog")
      );
      expect(apiCatalogRes.headers.get("Content-Type")).toContain("application/linkset+json");
      expect((await apiCatalogRes.json()).linkset[0].anchor).toBe(
        "https://atlas-log.vercel.app/api/v1"
      );
    });

    it("enables RLS on public.api_keys in migration 035", () => {
      const sql = fs.readFileSync(
        path.join(process.cwd(), "supabase/migrations/035_api_keys.sql"),
        "utf8"
      );
      expect(sql).toContain("ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;");
      expect(sql).toContain("CREATE POLICY");
    });
  });

  describe("Photo Upload Flows (Direct Base64, Multipart, Presigned Intent + Confirm & Guards)", () => {
    it("uploads photo via JSON base64, auto-creates country record, and enforces 4-photo limit (409)", async () => {
      const png = await createSamplePngBuffer();
      const b64 = `data:image/png;base64,${png.toString("base64")}`;

      for (let i = 1; i <= 4; i++) {
        const res = await postPhotos(
          new Request("https://atlas-log.vercel.app/api/v1/photos", {
            method: "POST",
            headers: {
              Authorization: "Bearer atlas_live_mock",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              summit_id: "country-jp",
              taken_on: "2025-04-12",
              caption: `Foto ${i}`,
              image_base64: b64,
            }),
          })
        );
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.photo.summit_id).toBe("country-jp");
        expect(body.photo.display_url).toContain("https://atlas-log.vercel.app/api/photos/view/");
        expect(body.record_created).toBe(i === 1);
      }

      expect(mockDb.tables.ascents).toHaveLength(1);
      expect(mockDb.tables.summit_photos).toHaveLength(4);

      const fifthRes = await postPhotos(
        new Request("https://atlas-log.vercel.app/api/v1/photos", {
          method: "POST",
          headers: {
            Authorization: "Bearer atlas_live_mock",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summit_id: "country-jp",
            taken_on: "2025-04-12",
            image_base64: b64,
          }),
        })
      );
      expect(fifthRes.status).toBe(409);
      const fifthErr = await fifthRes.json();
      expect(fifthErr.code).toBe("photo_limit_exceeded");
    });

    it("uploads photo via multipart/form-data", async () => {
      const png = await createSamplePngBuffer();
      const formData = new FormData();
      formData.append("summit_id", "granada");
      formData.append("taken_on", "2025-07-20");
      formData.append("caption", "Mulhacén");
      formData.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "peak.png");

      const res = await postPhotos(
        new Request("https://atlas-log.vercel.app/api/v1/photos", {
          method: "POST",
          headers: { Authorization: "Bearer atlas_live_mock" },
          body: formData,
        })
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.photo.summit_id).toBe("granada");
      expect(body.record_created).toBe(true);
    });

    it("executes presigned upload-intent + confirm flow and deletes invalid uploaded bytes", async () => {
      const png = await createSamplePngBuffer();
      const intentRes = await postUploadIntent(
        new Request("https://atlas-log.vercel.app/api/v1/photos/upload-intent", {
          method: "POST",
          headers: {
            Authorization: "Bearer atlas_live_mock",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summit_id: "country-is",
            file_name: "aurora.png",
            content_type: "image/png",
            file_size: png.length,
            taken_on: "2025-11-04",
            caption: "Aurora",
          }),
        })
      );
      expect(intentRes.status).toBe(200);
      const intent = await intentRes.json();
      expect(intent.upload_url).toContain("presigned");
      expect(intent.upload_token).toContain("v1.");

      // Simulate direct client HTTP PUT into R2
      r2Mocks.uploadedObjects.set(intent.storage_path, {
        buffer: png,
        contentType: "image/png",
      });

      const confirmRes = await postConfirm(
        new Request("https://atlas-log.vercel.app/api/v1/photos/confirm", {
          method: "POST",
          headers: {
            Authorization: "Bearer atlas_live_mock",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ upload_token: intent.upload_token }),
        })
      );
      expect(confirmRes.status).toBe(201);
      const confirmed = await confirmRes.json();
      expect(confirmed.photo.summit_id).toBe("country-is");
      expect(confirmed.record_created).toBe(true);

      // Invalid bytes placed in R2 must be rejected and deleted from R2 on confirm
      const badIntentRes = await postUploadIntent(
        new Request("https://atlas-log.vercel.app/api/v1/photos/upload-intent", {
          method: "POST",
          headers: {
            Authorization: "Bearer atlas_live_mock",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summit_id: "country-es",
            file_name: "fake.png",
            content_type: "image/png",
            file_size: 100,
          }),
        })
      );
      const badIntent = await badIntentRes.json();
      r2Mocks.uploadedObjects.set(badIntent.storage_path, {
        buffer: Buffer.from("<html>xss</html>"),
        contentType: "image/png",
      });

      const badConfirmRes = await postConfirm(
        new Request("https://atlas-log.vercel.app/api/v1/photos/confirm", {
          method: "POST",
          headers: {
            Authorization: "Bearer atlas_live_mock",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ upload_token: badIntent.upload_token }),
        })
      );
      expect(badConfirmRes.status).toBe(400);
      expect(r2Mocks.deletedKeys).toContain(badIntent.storage_path);
    });

    it("enforces 9.5 GB storage cap (507) and rolls back R2 object when DB insert fails", async () => {
      const png = await createSamplePngBuffer();
      const b64 = `data:image/png;base64,${png.toString("base64")}`;

      r2Mocks.storageBytesUsed = 9.5 * 1024 * 1024 * 1024;
      const capRes = await postPhotos(
        new Request("https://atlas-log.vercel.app/api/v1/photos", {
          method: "POST",
          headers: {
            Authorization: "Bearer atlas_live_mock",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summit_id: "country-jp",
            image_base64: b64,
          }),
        })
      );
      expect(capRes.status).toBe(507);
      expect((await capRes.json()).code).toBe("storage_limit_exceeded");

      // Test R2 cleanup on DB insert failure
      r2Mocks.storageBytesUsed = 1024;
      const failingDb = createInMemorySupabase({ failPhotoInsert: true });
      authMocks.mockAuthContext.supabase = failingDb;

      const failRes = await postPhotos(
        new Request("https://atlas-log.vercel.app/api/v1/photos", {
          method: "POST",
          headers: {
            Authorization: "Bearer atlas_live_mock",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summit_id: "country-jp",
            image_base64: b64,
          }),
        })
      );
      expect(failRes.status).toBe(500);
      expect(r2Mocks.uploadedObjects.size).toBe(0);
      expect(r2Mocks.deletedKeys.length).toBe(1);
    });
  });
});
