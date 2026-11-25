---
name: code-verification-and-quality
description: >-
  Use this skill whenever making code changes, refactoring, fixing bugs, or before committing code in the Atlas (47 Picos & 196 Países) project.
  Guides the agent through running static type checks, ESLint quality audits, Vitest unit/integration/deep tests, and the project verification harness.
---

# Code Verification and Quality Gate

This skill outlines the quality standards, execution commands, and troubleshooting runbooks for verifying changes in **Atlas (47 Picos & 196 Países)**.

---

## 1. Quick Verification Commands

Select the verification tier based on your current task state:

```bash
# 1. Inner Loop (Iterative development): Protect + Typecheck + Vitest (~10s)
npm run verify:fast

# 2. Fast unit & integration tests only (~3s)
npm test

# 3. Deep E2E lifecycle tests
npm run test:deep

# 4. Outer Loop / Pre-Push (Definition of Done): Protect + Typecheck + Lint + Tests + Deep + Build (~60s)
npm run verify

# 5. Agent benchmark evaluation harness
npm run harness:eval
```

---

## 2. Verification Pipeline Stages

### Stage 0: Protected Files & Migration Freeze (`scripts/protect-files.mjs`)
- Blocks committing/modifying `.env*` files (except `.env.example`).
- Blocks modifying or deleting frozen migrations `001` through `021` in `supabase/migrations/`.

### Stage 1: TypeScript Static Typecheck
- **Command**: `npx tsc --noEmit`
- **Criteria**: 0 errors.
- **Common Caveats**:
  - `Leaflet` / `react-leaflet`: Types come from `@types/leaflet`. Map components depend on `window` and must use `'use client'` and `dynamic(() => import(...), { ssr: false })`.
  - Next.js 15 route parameters: Async server components receive `Promise<{ [key]: string }>` for `params`.
  - Supabase client nullability: `supabase` in `lib/supabase.ts` is typed as `SupabaseClient | null`. Always guard with `if (!supabase) return;` or check `isSupabaseConfigured`.

### Stage 2: ESLint Code Quality Gate
- **Command**: `npm run lint` (`eslint .`)
- **Criteria**: 0 errors (included in `npm run verify`).
- **Guidelines**:
  - Remove unused variables or prefix intentionally unused parameters with `_`.
  - Keep React hook dependency arrays (`useEffect`, `useCallback`, `useMemo`) exhaustive or stabilize callbacks with `useCallback`.
  - In canvas/crop modals or external image blobs (`react-image-crop`, object URLs), `<img>` may be used intentionally where `next/image` does not apply.

### Stage 3: Vitest Automated Test Suite
- **Command**: `npm test` (`vitest run`)
- **Criteria**: 100% passing across `tests/unit/` and `tests/integration/`, including:
  - `tests/unit/peaks.test.ts`: 52 demarcations / 47 unique physical summits integrity.
  - `tests/unit/countries.test.ts`: 196 world countries, ISO codes, and continents.
  - `tests/unit/experiences.test.ts`: Predefined categories and unique experience IDs.
  - `tests/unit/image-utils.test.ts`: Image compression fallbacks and parameters.
  - `tests/integration/migrations.test.ts`: Migration sequence and RLS policies.
  - `tests/integration/invariants.test.ts`: Critical product, UI, map, and security invariants.
  - `tests/integration/supabase-mock.test.ts`: Supabase mock query contracts.
- **Deep E2E suite**: `npm run test:deep` (`tests/deep/full-user-lifecycle.test.ts`), executed automatically in `npm run verify`.

### Stage 4: Agent Benchmark Evaluation
- **Command**: `npm run harness:eval`
- **Output**: Generates reports in `.agents/eval/reports/benchmark-report.md` and `.agents/eval/reports/benchmark-report.json`.
- **Options**:
  - `npm run harness:eval -- --list` : List all evaluation benchmarks.
  - `npm run harness:eval -- --task=eval-01-peaks-integrity` : Run a single benchmark task.
  - `npm run harness:eval -- --category=database` : Run database benchmark tasks.

---

## 3. Troubleshooting Common Errors

### Leaflet `window is not defined`
Map components (`spain-map.tsx`, `world-map.tsx`, `collective-map.tsx`) fail if evaluated on the server.
**Resolution**:
```tsx
import dynamic from "next/dynamic";

const SpainMap = dynamic(() => import("@/components/spain-map"), {
  ssr: false,
  loading: () => <div className="h-[400px] flex items-center justify-center">Cargando mapa...</div>,
});
```

### Supabase Queries in Tests
Never import or query the live Supabase client in unit tests.
**Resolution**:
Import `createMockSupabaseClient` from `@/tests/mocks/supabase-mock`:
```ts
import { createMockSupabaseClient } from "@/tests/mocks/supabase-mock";

const mockSupabase = createMockSupabaseClient();
mockSupabase.seedTable("ascents", [ ... ]);
```

---

## 4. Verification Checklist Before Committing

- [ ] `npm run verify` completed with `✓ TODAS LAS COMPROBACIONES HAN PASADO`.
- [ ] No regressions introduced in invariants (`tests/integration/invariants.test.ts`).
- [ ] Git status clean or only containing intentional modifications.
