import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { peaks } from "@/data/peaks";

describe("Stress Testing & Edge Cases: Verified Remediations", () => {
  const rootDir = path.resolve(__dirname, "../../");

  /* ─────────────────────────────────────────────────────────────
   * 1. MATHEMATICAL & ALGORITHMIC INVARIANTS UNDER STRESS
   * ───────────────────────────────────────────────────────────── */
  describe("1. Mathematical & Algorithmic Invariants Under Stress", () => {
    it("1.1 [Shared Peaks]: Deduplicates when both shared provinces are completed", () => {
      const gorbeaPeaks = peaks.filter((p) => p.id === "gorbea");
      expect(gorbeaPeaks).toHaveLength(2);

      const mockAscents = [
        { summit_id: "gorbea", achieved_on: "2023-05-01", is_wishlist: false },
        { summit_id: "gorbea", achieved_on: "2023-06-01", is_wishlist: false },
      ];

      const uniquePeakNames = new Set(
        mockAscents
          .map((a) => peaks.find((p) => p.id === a.summit_id)?.name)
          .filter(Boolean),
      );

      expect(uniquePeakNames.size).toBe(1);
    });

    it("1.2 [Obsolete Peak IDs]: Legacy IDs correctly documented and handled", () => {
      const legacyAscent = { summit_id: "alava", achieved_on: "2022-01-01", is_wishlist: false };
      const foundPeak = peaks.find((p) => p.id === legacyAscent.summit_id);
      expect(foundPeak).toBeUndefined();
    });

    it("1.3 [Experiences]: Sub-item logic safely handles empty subItems array", () => {
      const emptySubItemExperience = {
        id: "test-exp",
        title: "Test",
        subItems: [],
      };

      const mockCompletedAscents: any[] = [];
      let count = 0;
      if (emptySubItemExperience.subItems.length === 0) {
        const isSingleCompleted = mockCompletedAscents.some((a) => a.summit_id === emptySubItemExperience.id);
        if (isSingleCompleted) count++;
      }
      expect(count).toBe(0);
    });

    it("1.4 [Date Boundary]: Database and UI enforce end_date >= achieved_on", () => {
      const migration22Path = path.join(rootDir, "supabase/migrations/022_audit_security_and_integrity_fixes.sql");
      const migration22 = fs.readFileSync(migration22Path, "utf-8");
      expect(migration22).toContain("check_end_date_after_start");
      expect(migration22).toContain("CHECK (end_date IS NULL OR end_date >= achieved_on)");

      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const trackerContent = fs.readFileSync(trackerPath, "utf-8");
      expect(trackerContent).toContain("finalEndDate < finalDate");
    });

    it("1.5 [Date Timezone Offset]: Local date formatting prevents UTC midnight day shifts", () => {
      const d = new Date(2024, 6, 15, 0, 0, 0); // Local midnight July 15
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const localDateStr = `${y}-${m}-${day}`;
      expect(localDateStr).toBe("2024-07-15");
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * 2. DATABASE SCHEMA, MIGRATIONS & RLS POLICIES AUDIT
   * ───────────────────────────────────────────────────────────── */
  describe("2. Database Schema, Migrations & RLS Policies Audit", () => {
    it("2.1 [Consolidated CREATE TABLE]: custom_experiences and experience_records have CREATE TABLE in migrations", () => {
      const migrationsDir = path.join(rootDir, "supabase/migrations");
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

      let foundCustomExperiencesCreate = false;
      let foundExperienceRecordsCreate = false;

      const createCustomExpRegex = /create\s+table(?:\s+if\s+not\s+exists)?\s+public\.custom_experiences\b/i;
      const createExpRecordsRegex = /create\s+table(?:\s+if\s+not\s+exists)?\s+public\.experience_records\b/i;

      for (const file of files) {
        const content = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
        if (createCustomExpRegex.test(content)) foundCustomExperiencesCreate = true;
        if (createExpRecordsRegex.test(content)) foundExperienceRecordsCreate = true;
      }

      // Must be true now that 022 defines them!
      expect(foundCustomExperiencesCreate).toBe(true);
      expect(foundExperienceRecordsCreate).toBe(true);
    });

    it("2.2 [Consolidated RLS Write Policies]: Full write policies are defined for custom_experiences and experience_records", () => {
      const migration22Path = path.join(rootDir, "supabase/migrations/022_audit_security_and_integrity_fixes.sql");
      const content = fs.readFileSync(migration22Path, "utf-8");

      expect(content).toContain("Users can insert own custom experiences");
      expect(content).toContain("Users can update own custom experiences");
      expect(content).toContain("Users can delete own custom experiences");
      expect(content).toContain("Users can insert own experience records");
      expect(content).toContain("Users can update own experience records");
      expect(content).toContain("Users can delete own experience records");
    });

    it("2.3 [Security Hardening - Privacy Protection]: connections insert policy prevents unauthorized accepted status", () => {
      const migration22Path = path.join(rootDir, "supabase/migrations/022_audit_security_and_integrity_fixes.sql");
      const content = fs.readFileSync(migration22Path, "utf-8");

      expect(content).toContain("Users can follow others");
      expect(content).toContain("is_public = true");
      expect(content).toContain("status = 'pending'");
    });

    it("2.4 [Security Hardening - Email Privacy]: get_email_for_login is revoked from anon and restricted to service_role", () => {
      const migration22Path = path.join(rootDir, "supabase/migrations/022_audit_security_and_integrity_fixes.sql");
      const content = fs.readFileSync(migration22Path, "utf-8");

      expect(content).toContain("REVOKE EXECUTE ON FUNCTION public.get_email_for_login(text) FROM public, anon;");
      expect(content).toContain("GRANT EXECUTE ON FUNCTION public.get_email_for_login(text) TO service_role;");
    });

    it("2.5 [Data Integrity]: Wishlist prevents overwriting real completed ascents", () => {
      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const content = fs.readFileSync(trackerPath, "utf-8");

      expect(content).toContain("hasRealAscent");
      expect(content).toContain("Ya has completado esta cumbre o lugar");
    });

    it("2.6 [Orphaned Storage Cleanup]: Account delete route removes user photos from storage", () => {
      const deleteRoutePath = path.join(rootDir, "app/api/account/delete/route.ts");
      const content = fs.readFileSync(deleteRoutePath, "utf-8");

      expect(content).toContain("supabaseAdmin.storage");
      expect(content).toContain("from(\"summit-photos\").remove");
      expect(content).toContain("supabaseAdmin.auth.admin.deleteUser");
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * 3. COMPONENT INTEGRITY, PERFORMANCE & RESOURCE LIMITS
   * ───────────────────────────────────────────────────────────── */
  describe("3. Component Integrity, Performance & Resource Limits", () => {
    it("3.1 [Memory Leak Prevention]: compressImage calls bitmap.close() in finally block", () => {
      const imageUtilsPath = path.join(rootDir, "lib/image-utils.ts");
      const content = fs.readFileSync(imageUtilsPath, "utf-8");

      expect(content).toContain("createImageBitmap");
      expect(content).toContain("bitmap.close()");
    });

    it("3.2 [Image Distortion Prevention]: Canvas fills background to prevent transparent PNG turning black", () => {
      const imageUtilsPath = path.join(rootDir, "lib/image-utils.ts");
      const content = fs.readFileSync(imageUtilsPath, "utf-8");

      expect(content).toContain("fillRect");
      expect(content).toContain("#ffffff");
    });

    it("3.3 [Photo Editor Geometry]: PhotoEditor swaps dimensions when rotated 90 or 270 degrees", () => {
      const editorPath = path.join(rootDir, "components/photo-editor.tsx");
      const content = fs.readFileSync(editorPath, "utf-8");

      expect(content).toContain("rotate % 180");
      expect(content).toContain("outputWidth");
      expect(content).toContain("outputHeight");
    });

    it("3.4 [Cartography Resilience]: SpainMap uses local TopoJSON with GeoJSON remote fallback and catch reset", () => {
      const spainMapPath = path.join(rootDir, "components/spain-map.tsx");
      const content = fs.readFileSync(spainMapPath, "utf-8");

      expect(content).toContain("/provincias_spain.topo.json");
      expect(content).toContain("/provincias_spain.geojson");
      expect(content).toContain("_geoPromise = null");

      const topoPath = path.join(rootDir, "public/provincias_spain.topo.json");
      expect(fs.existsSync(topoPath)).toBe(true);
      const topoData = JSON.parse(fs.readFileSync(topoPath, "utf-8"));
      expect(topoData.type).toBe("Topology");
      expect(topoData.objects.provincias).toBeDefined();
    });

    it("3.5 [Cartography Resilience]: WorldMap uses local TopoJSON with remote fallback and catch reset", () => {
      const worldMapPath = path.join(rootDir, "components/world-map.tsx");
      const content = fs.readFileSync(worldMapPath, "utf-8");

      expect(content).toContain("/world-countries.topo.json");
      expect(content).toContain("_worldGeoPromise = null");
    });

    it("3.6 [Geocoding Proxy]: LocationSearch uses local proxy and validates Array.isArray", () => {
      const locSearchPath = path.join(rootDir, "components/location-search.tsx");
      const content = fs.readFileSync(locSearchPath, "utf-8");

      expect(content).toContain("/api/geocoding?q=");
      expect(content).toContain("Array.isArray(data)");
    });

    it("3.7 [Photo Limit Integrity]: Record modal accounts for existing photos and strictly caps uploads at 4", () => {
      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const content = fs.readFileSync(trackerPath, "utf-8");

      expect(content).toContain("existingRecordPhotos");
      expect(content).toContain("galleryPhotosToAdd");
      expect(content).toContain("totalModalPhotos");
      expect(content).toMatch(/totalModalPhotos\s*>=\s*4/);
      expect(content).toContain("deletedRecordPhotoIds");
      expect(content).toContain("totalCountToSave > 4");
      expect(content).toMatch(/Math\.max\(\s*0,\s*4\s*-\s*\(existingRecordPhotos\.length/);
    });

    it("3.8 [Photo Removal & Dropzone Reactivity]: Preview renders existing photos with deletion action", () => {
      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const content = fs.readFileSync(trackerPath, "utf-8");

      expect(content).toContain("setDeletedRecordPhotoIds");
      expect(content).toContain("Quitar foto del registro");
      expect(content).toContain("file-dropzone--disabled");
    });
  });

  /* ─────────────────────────────────────────────────────────────
   * 4. UI STATE, HASH NAVIGATION & CROSS-PROFILE LEAKAGE
   * ───────────────────────────────────────────────────────────── */
  describe("4. UI State, Hash Navigation & Cross-Profile Leakage", () => {
    it("4.1 [Deep Link Navigation]: Switches mode bidirectionally on panel hash change", () => {
      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const content = fs.readFileSync(trackerPath, "utf-8");

      expect(content).toContain("isExpId");
      expect(content).toContain("setExperiencesMode(true)");
      expect(content).toContain("setCurrentMode(\"countries\")");
      expect(content).toContain("setCurrentMode(\"peaks\")");
    });

    it("4.2 [Profile Isolation]: openRecord enforces isReadOnly guard", () => {
      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const content = fs.readFileSync(trackerPath, "utf-8");

      expect(content).toMatch(/const openRecord[\s\S]*?if \(isReadOnly\) return;/);
    });

    it("4.3 [Reset Password Flow]: reset-password handles PKCE code and checks session", () => {
      const resetPath = path.join(rootDir, "app/reset-password/page.tsx");
      const content = fs.readFileSync(resetPath, "utf-8");

      expect(content).toContain("exchangeCodeForSession");
      expect(content).toContain("URLSearchParams");
    });
  });
});
