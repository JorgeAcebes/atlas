---
name: api-mcp-and-push
description: >-
  Use this skill when working on Atlas REST API v1 (/api/v1/*), personal API keys,
  the MCP server (/api/mcp), OpenAPI/llms documentation, or Web Push (VAPID) notifications (/api/push/*).
---

# REST API v1, MCP Server & Web Push Notifications

This skill covers programmatic access (API v1 + MCP) and Web Push notifications in **Atlas (47 Picos & 196 Países)**.

---

## 1. Authentication & Scopes (`lib/api-auth.ts`, `supabase/migrations/035_api_keys.sql`)

- Personal API keys are stored hashed (`key_hash`) in `public.api_keys` with prefix (`key_prefix`), optional expiry (`expires_at`), revocation (`revoked_at`), and scoped permissions:
  - `read`, `photos:write`, `records:write`
- Routes under `app/api/v1/` and `app/api/mcp/route.ts` authenticate via `authenticateApiRequest(request, requiredScope)` and enforce rate limiting (`lib/rate-limit.ts`).
- Key management endpoints: `app/api/v1/keys/route.ts` and `app/api/v1/keys/[id]/route.ts`.

---

## 2. REST API v1 & Service Layer (`lib/atlas-service.ts`, `app/api/v1/*`)

Shared business logic lives in `lib/atlas-service.ts` so REST API v1 and MCP tools share identical validation and DB behavior:
- `GET /api/v1/me` — Authenticated user profile and progress summary
- `GET /api/v1/catalog/peaks`, `countries`, `experiences` — Static catalog search
- `GET / POST /api/v1/records` — List and upsert peak/country ascents or experience records
- `GET / POST /api/v1/photos`, `POST /api/v1/photos/upload-intent`, `POST /api/v1/photos/confirm`, `PATCH / DELETE /api/v1/photos/[id]` — R2 presigned uploads and photo metadata management
- `GET /api/v1/openapi.json` — OpenAPI spec generated from `lib/openapi-spec.ts`

---

## 3. MCP Server (`app/api/mcp/route.ts`, `lib/mcp-server.ts`)

- Implements JSON-RPC MCP over HTTP (`SUPPORTED_PROTOCOL_VERSIONS`: `2025-06-18`, `2025-03-26`, `2024-11-05`).
- Exposes catalog search, profile summary, record listing/upsert, and R2 photo upload/caption/delete tools backed by `lib/atlas-service.ts`.
- Agent/LLM discovery text helpers live in `lib/llms-docs.ts` and developer portal UI in `components/developers-client.tsx`.

---

## 4. Web Push Notifications (`lib/push-notifications.ts`, `app/api/push/*`, `public/sw.js`)

- Subscriptions are persisted in `public.push_subscriptions` (`036_push_subscriptions.sql`) with `endpoint`, `p256dh`, `auth`, `notify_following_posts`, and `notify_shared_records`.
- Requires `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (checked via `isPushConfigured()`).
- Client hook: `hooks/use-push-notifications.ts`; endpoints: `/api/push/subscribe` and `/api/push/notify`.

---

## 5. Verification

```bash
npm test tests/unit/api-auth-and-keys.test.ts
npm test tests/unit/mcp-and-api-routes.test.ts
npm test tests/unit/push-notifications-and-profile-preload.test.ts
```
