---
name: supabase-and-migrations
description: >-
  Use this skill whenever creating, modifying, or reviewing Supabase database tables,
  SQL migrations, Row Level Security (RLS) policies, or PostgreSQL stored procedures in the Atlas (47 Picos & 196 Países) project.
---

# Supabase and Migrations Management

This skill covers the database architecture, migration conventions, security policies, and maintenance procedures for the Supabase backend in **Atlas (47 Picos & 196 Países)**.

---

## 1. Migration File Conventions

All migrations live in `supabase/migrations/` and follow a strict, contiguous 3-digit naming pattern:

```text
supabase/migrations/
├── 001_initial_schema.sql
...
├── 021_fix_experiences_rls.sql   <-- 001..021 are FROZEN (never modify/delete)
...
├── 036_push_subscriptions.sql
└── 037_<descriptive_name>.sql    <-- Next migration must be 037
```

### Critical Rules:
1. **Frozen Baseline (`001`–`021`)**: Never modify or delete migrations `001` through `021` (enforced by `scripts/protect-files.mjs`).
2. **Contiguous 3-Digit Prefix**: Never skip numbers. Always check the highest number currently in `supabase/migrations/` before creating a new migration.
3. **Idempotence**: Every statement should safely execute multiple times without error:
   - Tables: `CREATE TABLE IF NOT EXISTS public.<name> (...)`
   - Columns: `ALTER TABLE public.<name> ADD COLUMN IF NOT EXISTS <col> <type>`
   - Policies: `DROP POLICY IF EXISTS "<name>" ON public.<table_name>;` (or `DO $$ BEGIN IF NOT EXISTS ... END $$;`) followed by `CREATE POLICY ...`
   - Indexes: `CREATE INDEX IF NOT EXISTS <index_name> ON public.<table_name> (...)`
4. **Always Enable RLS**:
   ```sql
   ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;
   ```

---

## 2. Standard RLS Policy Patterns

The application distinguishes between private, public, and social follower access based on `profiles.is_public` and `connections`:

### SELECT Policy (Owner, Public Profile, or Accepted Follower):
```sql
CREATE POLICY "Public and connections can read <table_name>" ON public.<table_name>
FOR SELECT
USING (
  auth.uid() = user_id
  OR
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = <table_name>.user_id
    AND profiles.is_public = true
  )
  OR
  EXISTS (
    SELECT 1 FROM public.connections
    WHERE connections.following_id = <table_name>.user_id
    AND connections.follower_id = auth.uid()
    AND connections.status = 'accepted'
  )
);
```

### INSERT / UPDATE / DELETE Policies (Owner Only):
```sql
CREATE POLICY "Users can manage their own records" ON public.<table_name>
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

---

## 3. Database Functions & Search Path

When creating stored procedures or views (`get_user_ranking`, `get_collective_visited_countries`, `get_total_photos_storage_bytes`, `get_feed_photos`, `get_mutual_followers`):
- Use `SECURITY DEFINER` when querying across user boundaries.
- Explicitly set `SET search_path = public` to prevent schema-hijack vulnerabilities.
- Always exclude test profiles (`p.is_test IS NOT TRUE`) from ranking, collective counts, feed, and recommendations.

---

## 4. Photo Storage Architecture (Cloudflare R2 + `summit_photos`)

Active photo and avatar storage uses **Cloudflare R2** (bucket `atlas-photos`), tracked in `public.summit_photos.file_size` (`030_storage_tracking_and_r2.sql`):
- **Storage Cap**: `get_total_photos_storage_bytes()` enforces the strict **9.5 GiB** (`DEFAULT_MAX_STORAGE_BYTES` in `lib/r2-storage.ts`) limit.
- **Endpoints**:
  - Browser uploads: `POST /api/photos/upload`, `POST /api/photos/delete`, `GET /api/photos/view/[...path]`
  - REST API v1 / MCP: `/api/v1/photos/upload-intent` + `/api/v1/photos/confirm`
- **Legacy Supabase Storage**: Historical `supabase.co/storage/v1/object/public/summit-photos/` URLs are transparently rewritten to `/api/photos/view/...` (or `NEXT_PUBLIC_R2_CUSTOM_DOMAIN`) by `getPhotoDisplayUrl()` in `lib/photo-client.ts`.

---

## 5. Keepalive & Pausing Prevention

Supabase free-tier projects pause after 7 days of inactivity.
- Route: `app/api/keepalive/route.ts`
- Trigger: Vercel Cron configured in `vercel.json` (`schedule: "0 3 * * *"`).
- Authorization: Requires `CRON_SECRET` header or `SUPABASE_SERVICE_ROLE_KEY`.

---

## 6. Testing Migrations Locally

Run the migration integrity tests:
```bash
npm test tests/integration/migrations.test.ts
```
This test checks:
- Unbroken 3-digit sequence (`001`..latest).
- Non-empty files.
- RLS enablement or policies on all created public tables.

For full schema details, see [Schema Reference](./references/schema-reference.md).
