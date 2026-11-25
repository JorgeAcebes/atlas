---
name: new-migration
description: >-
  Step-by-step workflow to create a new contiguous, idempotent Supabase SQL migration
  with mandatory Row Level Security (RLS) and run migration and verification checks.
---

# Create a New Supabase Migration

Use this skill when adding or altering database tables, columns, RLS policies, or PostgreSQL functions in `supabase/migrations/`.

## Steps

1. **Determine the next contiguous 3-digit sequence number**:
   Inspect `supabase/migrations/` and take `highest_number + 1` (currently `036` exists, so the next migration is `037`).
   Never edit frozen historical migrations `001_` through `021_`.

2. **Create the SQL file with idempotent DDL and mandatory RLS**:
   - Path: `supabase/migrations/<NNN>_<short_description>.sql` (lowercase snake_case).
   - Use idempotent statements and enable RLS on every created public table:
     ```sql
     CREATE TABLE IF NOT EXISTS public.<table_name> (...);
     ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;

     DROP POLICY IF EXISTS "<policy_name>" ON public.<table_name>;
     CREATE POLICY "<policy_name>" ON public.<table_name> ...;
     ```
   - For `SECURITY DEFINER` functions, always set `SET search_path = public`.

3. **Validate migration sequence and RLS integrity**:
   ```bash
   npx vitest run tests/integration/migrations.test.ts
   ```

4. **Run the project verification loop**:
   ```bash
   npm run verify:fast
   # Or full pre-push gate:
   npm run verify
   ```
