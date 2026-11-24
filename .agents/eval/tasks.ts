import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { EvalTask } from "./types";
import { peaks } from "../../data/peaks";
import { countries } from "../../data/countries";
import { predefinedCategories } from "../../data/experiences";
import { createMockSupabaseClient } from "../../tests/mocks/supabase-mock";

export const evalTasks: EvalTask[] = [
  {
    id: "eval-01-peaks-integrity",
    title: "Spain Peaks Dataset & Shared Summits Integrity",
    category: "geodata",
    description: "Evaluates the territorial peaks dataset: exactly 52 entries, 47 physical peaks, 5 shared summits with identical coordinates, and proper boundary limits.",
    instructions: "Ensure `data/peaks.ts` maintains 52 territorial high points, consistent shared peaks, and valid geographic coordinates.",
    expectedOutcome: "52 items, 47 distinct IDs, identical coordinates for shared summits (gorbea, cerredo, penalara, trevinca, moncayo).",
    verify: async () => {
      let score = 0;
      const issues: string[] = [];

      // Check count
      if (peaks.length === 52) score += 25;
      else issues.push(`Expected 52 peaks, found ${peaks.length}`);

      // Check unique physical summits
      const uniqueIds = new Set(peaks.map((p) => p.id));
      if (uniqueIds.size === 47) score += 25;
      else issues.push(`Expected 47 unique physical peaks, found ${uniqueIds.size}`);

      // Check shared summits coordinates & altitude
      const sharedIds = ["gorbea", "cerredo", "penalara", "trevinca", "moncayo"];
      let sharedPass = true;
      for (const id of sharedIds) {
        const matches = peaks.filter((p) => p.id === id);
        if (matches.length !== 2) {
          sharedPass = false;
          issues.push(`Shared peak ${id} has ${matches.length} entries, expected 2`);
        } else if (
          matches[0].altitude !== matches[1].altitude ||
          matches[0].coordinates[0] !== matches[1].coordinates[0] ||
          matches[0].coordinates[1] !== matches[1].coordinates[1]
        ) {
          sharedPass = false;
          issues.push(`Shared peak ${id} has mismatched altitude or coordinates across provinces`);
        }
      }
      if (sharedPass) score += 25;

      // Check coordinates validity
      const coordsValid = peaks.every(
        (p) =>
          p.coordinates[0] >= 27 &&
          p.coordinates[0] <= 44 &&
          p.coordinates[1] >= -19 &&
          p.coordinates[1] <= 5
      );
      if (coordsValid) score += 25;
      else issues.push("One or more peaks have coordinates outside Spain boundaries");

      return {
        pass: score === 100,
        score,
        message: score === 100 ? "All peak and shared summit validations passed" : issues.join("; "),
        details: { totalPeaks: peaks.length, uniquePeaks: uniqueIds.size, issues },
      };
    },
  },

  {
    id: "eval-02-countries-and-regions",
    title: "World Countries (196) Integrity",
    category: "geodata",
    description: "Evaluates the 196 world countries dataset, ISO codes, TopoJSON identifiers, and valid coordinates.",
    instructions: "Ensure `data/countries.ts` maintains 196 nations with unique ISO codes and valid coordinates.",
    expectedOutcome: "196 countries, valid ISO-a2 and ISO-n3 strings, valid continents and coordinates.",
    verify: async () => {
      let score = 0;
      const issues: string[] = [];

      // Check count
      if (countries.length === 196) score += 30;
      else issues.push(`Expected 196 countries, found ${countries.length}`);

      // Check ISO-a2 uniqueness
      const isos = new Set(countries.map((c) => c.iso_a2));
      if (isos.size === 196) score += 25;
      else issues.push(`Expected 196 unique ISO-a2 codes, found ${isos.size}`);

      // Check ISO-n3 format
      const isoN3Valid = countries.every(
        (c) => c.iso_n3 === "-99" || /^\d{3}$/.test(c.iso_n3)
      );
      if (isoN3Valid) score += 25;
      else issues.push("Invalid ISO-n3 format detected");

      // Check coordinates & continents
      const coordsAndContinentsValid = countries.every(
        (c) =>
          Boolean(c.continent) &&
          Array.isArray(c.coordinates) &&
          c.coordinates.length === 2 &&
          Number.isFinite(c.coordinates[0]) &&
          Number.isFinite(c.coordinates[1]) &&
          c.coordinates[0] >= -90 &&
          c.coordinates[0] <= 90 &&
          c.coordinates[1] >= -180 &&
          c.coordinates[1] <= 180
      );
      if (coordsAndContinentsValid) score += 20;
      else issues.push("Invalid country coordinates or continent detected");

      return {
        pass: score === 100,
        score,
        message: score === 100 ? "Countries evaluation passed" : issues.join("; "),
        details: { totalCountries: countries.length },
      };
    },
  },

  {
    id: "eval-03-migrations-structure",
    title: "Database Migrations Sequence & RLS Policies",
    category: "database",
    description: "Evaluates Supabase migration files in `supabase/migrations/`: unbroken sequence, valid naming, and Row Level Security on created tables.",
    instructions: "Verify all migrations follow XXX_name.sql, contiguous numbering, and define RLS for all public tables.",
    expectedOutcome: "Contiguous numbering starting from 001, no missing files, RLS enabled on all tables.",
    verify: async () => {
      const migrationsDir = path.resolve(__dirname, "../../supabase/migrations");
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

      let score = 0;
      const issues: string[] = [];

      if (files.length >= 21) score += 30;
      else issues.push(`Expected at least 21 migration files, found ${files.length}`);

      // Check numbering
      let seqPass = true;
      for (let i = 0; i < files.length; i++) {
        const expectedPrefix = String(i + 1).padStart(3, "0");
        if (!files[i].startsWith(expectedPrefix)) {
          seqPass = false;
          issues.push(`Migration ${files[i]} does not match expected prefix ${expectedPrefix}`);
          break;
        }
      }
      if (seqPass) score += 35;

      // Check RLS
      let rlsPass = true;
      for (const file of files) {
        const content = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
        const createTableRegex = /create\s+table(?:\s+if\s+not\s+exists)?\s+public\.([a-zA-Z0-9_]+)/gi;
        let match;
        while ((match = createTableRegex.exec(content)) !== null) {
          const tableName = match[1];
          const rlsRegex = new RegExp(
            `(alter\\s+table\\s+public\\.${tableName}\\s+enable\\s+row\\s+level\\s+security|create\\s+policy.*on\\s+public\\.${tableName})`,
            "i"
          );
          if (!rlsRegex.test(content)) {
            rlsPass = false;
            issues.push(`Table public.${tableName} in ${file} missing RLS enablement or policies`);
          }
        }
      }
      if (rlsPass) score += 35;

      return {
        pass: score === 100,
        score,
        message: score === 100 ? "All migrations sequence and RLS policies verified" : issues.join("; "),
        details: { totalMigrations: files.length, issues },
      };
    },
  },

  {
    id: "eval-04-experience-categories",
    title: "Custom Experiences Dataset & Schema Adherence",
    category: "experiences",
    description: "Evaluates predefined experience categories: unique IDs, non-empty experience lists, and valid sub-item references.",
    instructions: "Ensure `data/experiences.ts` defines unique category and experience IDs.",
    expectedOutcome: "Unique category IDs, unique experience IDs across all categories, valid sub-item IDs.",
    verify: async () => {
      let score = 0;
      const issues: string[] = [];

      if (predefinedCategories.length > 0) score += 25;
      else issues.push("predefinedCategories is empty");

      const catIds = predefinedCategories.map((c) => c.id);
      const uniqueCatIds = new Set(catIds);
      if (uniqueCatIds.size === catIds.length) score += 25;
      else issues.push("Duplicate category IDs found");

      const expIds: string[] = [];
      for (const c of predefinedCategories) {
        for (const e of c.experiences) {
          expIds.push(e.id);
        }
      }
      const uniqueExpIds = new Set(expIds);
      if (uniqueExpIds.size === expIds.length) score += 25;
      else issues.push("Duplicate experience IDs found across categories");

      let subItemsValid = true;
      for (const c of predefinedCategories) {
        for (const e of c.experiences) {
          if (e.subItems) {
            const subs = e.subItems.map((s) => s.id);
            if (new Set(subs).size !== subs.length) {
              subItemsValid = false;
              issues.push(`Duplicate subItems in experience ${e.id}`);
            }
          }
        }
      }
      if (subItemsValid) score += 25;

      return {
        pass: score === 100,
        score,
        message: score === 100 ? "Experience categories schema verified" : issues.join("; "),
        details: { categoriesCount: predefinedCategories.length, experiencesCount: expIds.length },
      };
    },
  },

  {
    id: "eval-05-supabase-mock-contracts",
    title: "Supabase Mock Contract Validation",
    category: "database",
    description: "Evaluates the in-memory Supabase mock client to ensure it faithfully simulates database queries, auth, and storage without live connection.",
    instructions: "Test mock client's from(), select(), insert(), update(), delete(), auth, and storage.",
    expectedOutcome: "All CRUD, auth, and storage operations execute and return expected shape.",
    verify: async () => {
      let score = 0;
      const issues: string[] = [];

      const mock = createMockSupabaseClient();

      // Test Insert & Select
      const ins = await mock.from("ascents").insert({ user_id: "u1", summit_id: "gorbea" });
      const sel = await mock.from("ascents").select().eq("user_id", "u1");
      if (ins.data && sel.data?.length === 1) score += 35;
      else issues.push("Insert or Select failed on mock Supabase client");

      // Test Auth
      const user = await mock.auth.getUser();
      if (user.data?.user?.id) score += 30;
      else issues.push("Auth getUser() failed on mock Supabase client");

      // Test Storage
      const bucket = mock.storage.from("summit-photos");
      await bucket.upload("test.jpg", "content");
      const list = await bucket.list();
      if (list.data?.length === 1) score += 35;
      else issues.push("Storage upload or list failed on mock Supabase client");

      return {
        pass: score === 100,
        score,
        message: score === 100 ? "Supabase mock client contracts fully verified" : issues.join("; "),
        details: { issues },
      };
    },
  },

  {
    id: "eval-06-quality-gate",
    title: "Full Code Quality Gate (Types, Lint, Tests)",
    category: "quality",
    description: "Evaluates overall code health: TypeScript compiler check (0 errors), ESLint compliance, and Vitest test pass rate.",
    instructions: "Run tsc --noEmit, eslint, and vitest run.",
    expectedOutcome: "Zero compile errors, zero ESLint errors, 100% test pass rate.",
    verify: async () => {
      let score = 0;
      const issues: string[] = [];

      // 1. TypeScript
      try {
        execSync("npx tsc --noEmit", { stdio: "pipe" });
        score += 35;
      } catch (e: any) {
        issues.push("TypeScript typecheck failed");
      }

      // 2. ESLint
      try {
        execSync("npx eslint .", { stdio: "pipe" });
        score += 35;
      } catch (e: any) {
        issues.push("ESLint check failed with errors");
      }

      // 3. Vitest
      try {
        execSync("npx vitest run", { stdio: "pipe" });
        score += 30;
      } catch (e: any) {
        issues.push("Vitest unit tests failed");
      }

      return {
        pass: score === 100,
        score,
        message: score === 100 ? "Typecheck, ESLint, and Vitest all passed" : issues.join("; "),
        details: { issues },
      };
    },
  },
];
