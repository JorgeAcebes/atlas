---
name: release-verification
description: >-
  Full pre-push and release verification workflow for Atlas. Use when finalizing a feature,
  preparing a commit or push, or auditing repository health across types, lint, tests, build, and evals.
---

# Release Verification & Quality Audit

Use this skill before concluding a task for delivery, committing, or pushing changes.

## Steps

1. **Run the canonical full verification gate**:
   ```bash
   npm run verify
   ```
   Verifies in sequence:
   - File & migration protection (`scripts/protect-files.mjs`)
   - Static TypeScript check (`npx tsc --noEmit`)
   - Linter (`npx eslint .`)
   - Unit & integration suites (`npx vitest run`)
   - Deep E2E lifecycle suite (`npx vitest run tests/deep`)
   - Production bundle (`npx next build`)

2. **Run the agent benchmark evaluation harness**:
   ```bash
   npm run harness:eval
   ```
   Verify all 6 benchmark tasks score `100/100` (reports written to `.agents/eval/reports/benchmark-report.md`).

3. **Inspect working tree status**:
   Ensure no `.env*` secrets, temporary files, or unintended modifications exist:
   ```bash
   git status
   ```

4. **Update active task plan (if applicable)**:
   If working on a multi-session task, update the corresponding plan in `docs/plans/` with completed steps and decisions.
