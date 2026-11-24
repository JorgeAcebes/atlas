import { describe, it, expect } from "vitest";
import {
  API_KEY_PREFIX,
  authenticateApiRequest,
  generateApiKey,
  hashApiKey,
} from "@/lib/api-auth";
import {
  signUploadIntentToken,
  verifyUploadIntentToken,
  type UploadIntentPayload,
} from "@/lib/upload-intent-token";

function createFakeSupabaseForAuth(options: {
  apiKeys?: Array<Record<string, any>>;
  jwtUsers?: Record<string, { id: string; email: string }>;
}) {
  const apiKeys = options.apiKeys || [];
  const jwtUsers = options.jwtUsers || {};

  return {
    auth: {
      getUser: async (token: string) => {
        const user = jwtUsers[token];
        if (!user) {
          return { data: { user: null }, error: { message: "invalid jwt" } };
        }
        return { data: { user }, error: null };
      },
    },
    from: (table: string) => {
      if (table !== "api_keys") {
        throw new Error(`Unexpected table ${table}`);
      }
      const filters: Array<(row: Record<string, any>) => boolean> = [];
      let pendingUpdate: Record<string, any> | null = null;

      const builder: any = {
        select: () => builder,
        eq: (col: string, val: any) => {
          filters.push((r) => r[col] === val);
          return builder;
        },
        update: (patch: Record<string, any>) => {
          pendingUpdate = patch;
          return builder;
        },
        maybeSingle: async () => {
          const match = apiKeys.find((r) => filters.every((f) => f(r))) || null;
          return { data: match, error: null };
        },
        then: (resolve: any) => {
          if (pendingUpdate) {
            for (const row of apiKeys) {
              if (filters.every((f) => f(row))) {
                Object.assign(row, pendingUpdate);
              }
            }
          }
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
}

describe("API Authentication, Personal API Keys & Upload Intent Tokens", () => {
  describe("Personal API Keys generation & hashing", () => {
    it("generates atlas_live_ keys with deterministic SHA-256 hashes and prefixes", () => {
      const k1 = generateApiKey();
      const k2 = generateApiKey();

      expect(k1.rawKey.startsWith(API_KEY_PREFIX)).toBe(true);
      expect(k1.rawKey.length).toBeGreaterThan(40);
      expect(k1.keyPrefix).toBe(k1.rawKey.slice(0, 18));
      expect(k1.keyHash).toBe(hashApiKey(k1.rawKey));
      expect(k1.keyHash).toHaveLength(64);
      expect(k1.rawKey).not.toBe(k2.rawKey);
      expect(k1.keyHash).not.toBe(k2.keyHash);
    });
  });

  describe("authenticateApiRequest", () => {
    it("authenticates a valid Personal API Key via Authorization Bearer and X-API-Key", async () => {
      const generated = generateApiKey();
      const fakeDb = createFakeSupabaseForAuth({
        apiKeys: [
          {
            id: "key-1",
            user_id: "user-123",
            key_hash: generated.keyHash,
            scopes: ["read", "photos:write"],
            expires_at: new Date(Date.now() + 86_400_000).toISOString(),
            revoked_at: null,
          },
        ],
      });

      const reqBearer = new Request("https://atlas-log.vercel.app/api/v1/me", {
        headers: { Authorization: `Bearer ${generated.rawKey}` },
      });
      const resBearer = await authenticateApiRequest(reqBearer, {
        requiredScope: "photos:write",
        supabaseAdminOverride: fakeDb,
      });

      expect(resBearer.ok).toBe(true);
      if (resBearer.ok && resBearer.auth) {
        expect(resBearer.auth.userId).toBe("user-123");
        expect(resBearer.auth.authType).toBe("api_key");
        expect(resBearer.auth.keyId).toBe("key-1");
        expect(resBearer.auth.scopes).toEqual(["read", "photos:write"]);
      }

      const reqHeader = new Request("https://atlas-log.vercel.app/api/v1/me", {
        headers: { "X-API-Key": generated.rawKey },
      });
      const resHeader = await authenticateApiRequest(reqHeader, {
        requiredScope: "read",
        supabaseAdminOverride: fakeDb,
      });
      expect(resHeader.ok).toBe(true);
    });

    it("rejects missing, revoked, and expired API keys with 401", async () => {
      const revokedKey = generateApiKey();
      const expiredKey = generateApiKey();
      const fakeDb = createFakeSupabaseForAuth({
        apiKeys: [
          {
            id: "key-revoked",
            user_id: "user-1",
            key_hash: revokedKey.keyHash,
            scopes: ["read"],
            expires_at: null,
            revoked_at: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "key-expired",
            user_id: "user-1",
            key_hash: expiredKey.keyHash,
            scopes: ["read"],
            expires_at: "2020-01-01T00:00:00.000Z",
            revoked_at: null,
          },
        ],
      });

      const unauthRes = await authenticateApiRequest(
        new Request("https://atlas-log.vercel.app/api/v1/me"),
        { supabaseAdminOverride: fakeDb }
      );
      expect(unauthRes.ok).toBe(false);
      if (!unauthRes.ok) {
        expect(unauthRes.status).toBe(401);
        expect(unauthRes.code).toBe("unauthorized");
      }

      const revokedRes = await authenticateApiRequest(
        new Request("https://atlas-log.vercel.app/api/v1/me", {
          headers: { Authorization: `Bearer ${revokedKey.rawKey}` },
        }),
        { supabaseAdminOverride: fakeDb }
      );
      expect(revokedRes.ok).toBe(false);
      if (!revokedRes.ok) {
        expect(revokedRes.status).toBe(401);
        expect(revokedRes.code).toBe("invalid_api_key");
      }

      const expiredRes = await authenticateApiRequest(
        new Request("https://atlas-log.vercel.app/api/v1/me", {
          headers: { Authorization: `Bearer ${expiredKey.rawKey}` },
        }),
        { supabaseAdminOverride: fakeDb }
      );
      expect(expiredRes.ok).toBe(false);
      if (!expiredRes.ok) {
        expect(expiredRes.status).toBe(401);
        expect(expiredRes.code).toBe("invalid_api_key");
      }
    });

    it("rejects insufficient scopes and API keys on session-only endpoints with 403", async () => {
      const readOnlyKey = generateApiKey();
      const fakeDb = createFakeSupabaseForAuth({
        apiKeys: [
          {
            id: "key-read",
            user_id: "user-1",
            key_hash: readOnlyKey.keyHash,
            scopes: ["read"],
            expires_at: null,
            revoked_at: null,
          },
        ],
      });

      const insufficient = await authenticateApiRequest(
        new Request("https://atlas-log.vercel.app/api/v1/photos", {
          headers: { Authorization: `Bearer ${readOnlyKey.rawKey}` },
        }),
        { requiredScope: "photos:write", supabaseAdminOverride: fakeDb }
      );
      expect(insufficient.ok).toBe(false);
      if (!insufficient.ok) {
        expect(insufficient.status).toBe(403);
        expect(insufficient.code).toBe("insufficient_scope");
      }

      const sessionOnly = await authenticateApiRequest(
        new Request("https://atlas-log.vercel.app/api/v1/keys", {
          headers: { Authorization: `Bearer ${readOnlyKey.rawKey}` },
        }),
        { allowApiKey: false, supabaseAdminOverride: fakeDb }
      );
      expect(sessionOnly.ok).toBe(false);
      if (!sessionOnly.ok) {
        expect(sessionOnly.status).toBe(403);
        expect(sessionOnly.code).toBe("session_required");
      }
    });

    it("validates Supabase Bearer JWTs and supports optional auth", async () => {
      const fakeDb = createFakeSupabaseForAuth({
        jwtUsers: {
          "valid-jwt-123": { id: "jwt-user-99", email: "user@atlas.test" },
        },
      });

      const validJwt = await authenticateApiRequest(
        new Request("https://atlas-log.vercel.app/api/v1/keys", {
          headers: { Authorization: "Bearer valid-jwt-123" },
        }),
        { allowApiKey: false, supabaseAdminOverride: fakeDb }
      );
      expect(validJwt.ok).toBe(true);
      if (validJwt.ok && validJwt.auth) {
        expect(validJwt.auth.userId).toBe("jwt-user-99");
        expect(validJwt.auth.authType).toBe("supabase_jwt");
      }

      const invalidJwt = await authenticateApiRequest(
        new Request("https://atlas-log.vercel.app/api/v1/me", {
          headers: { Authorization: "Bearer bad-jwt" },
        }),
        { supabaseAdminOverride: fakeDb }
      );
      expect(invalidJwt.ok).toBe(false);
      if (!invalidJwt.ok) {
        expect(invalidJwt.status).toBe(401);
        expect(invalidJwt.code).toBe("invalid_token");
      }

      const opt = await authenticateApiRequest(
        new Request("https://atlas-log.vercel.app/api/v1/catalog/countries"),
        { optional: true, supabaseAdminOverride: fakeDb }
      );
      expect(opt).toEqual({ ok: true, auth: null });
    });
  });

  describe("upload-intent-token HMAC verification", () => {
    const secret = "unit-test-hmac-secret-0123456789";
    const basePayload: UploadIntentPayload = {
      userId: "user-abc",
      storagePath: "user-abc/country-jp/uuid-fuji.jpg",
      summitId: "country-jp",
      expectedSummitId: "country-jp",
      subItemId: null,
      itemType: "country",
      takenOn: "2025-04-12",
      caption: "Fuji",
      shotAt: "2025-04-12T06:30:00.000Z",
      autoCreateRecord: true,
      recordMeta: null,
      contentType: "image/jpeg",
      declaredFileSize: 123456,
      exp: Date.now() + 60_000,
    };

    it("signs and verifies a valid intent token", () => {
      const token = signUploadIntentToken(basePayload, secret);
      const res = verifyUploadIntentToken(token, "user-abc", secret);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.payload.storagePath).toBe(basePayload.storagePath);
        expect(res.payload.summitId).toBe("country-jp");
      }
    });

    it("rejects tampered signature, wrong owner, expired token, and path traversal", () => {
      const token = signUploadIntentToken(basePayload, secret);
      const tampered = `${token.slice(0, -4)}AAAA`;
      expect(verifyUploadIntentToken(tampered, "user-abc", secret).ok).toBe(false);

      const wrongOwner = verifyUploadIntentToken(token, "other-user", secret);
      expect(wrongOwner.ok).toBe(false);
      if (!wrongOwner.ok) expect(wrongOwner.code).toBe("forbidden");

      const expiredToken = signUploadIntentToken(
        { ...basePayload, exp: Date.now() - 1000 },
        secret
      );
      const expiredRes = verifyUploadIntentToken(expiredToken, "user-abc", secret);
      expect(expiredRes.ok).toBe(false);
      if (!expiredRes.ok) expect(expiredRes.code).toBe("upload_token_expired");

      const traversalToken = signUploadIntentToken(
        { ...basePayload, storagePath: "user-abc/../other/evil.jpg" },
        secret
      );
      const traversalRes = verifyUploadIntentToken(traversalToken, "user-abc", secret);
      expect(traversalRes.ok).toBe(false);
      if (!traversalRes.ok) expect(traversalRes.code).toBe("invalid_storage_path");
    });
  });
});
