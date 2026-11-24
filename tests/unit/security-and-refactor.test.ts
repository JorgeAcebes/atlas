import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  detectSafeImageMime,
  filterSafeUserOwnedPaths,
  hasUnsafePathTraversal,
  resolveSafeImageContentType,
} from "@/lib/photo-security";
import { checkStorageLimit } from "@/lib/r2-storage";
import {
  TOTAL_PHYSICAL_PEAKS,
  TOTAL_WORLD_COUNTRIES,
  countCompletedCountriesUnique,
  countCompletedPeaksUnique,
  getPredefinedExperienceTotalCount,
  isExperienceItemCompleted,
} from "@/lib/progress-utils";
import {
  SHARED_PEAKS,
  buildAllTimelines,
  computePeaksAndCountriesStats,
} from "@/lib/stats-calculations";
import {
  formatRecordDateRange,
  isUnknownDate,
} from "@/lib/date-utils";
import { filterFeedItems } from "@/lib/feed-filter";
import {
  readAllStyles,
  readFile,
  readRankingStyles,
} from "@/tests/utils/source-reader";

describe("Security Hardening & Refactor Verification", () => {
  describe("Photo Magic-Byte & Path Traversal Protection (lib/photo-security.ts)", () => {
    it("detects valid raster image magic bytes (JPEG, PNG, GIF89a, WebP, AVIF)", () => {
      const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
      const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0]);
      const webp = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50,
      ]);
      const avif = new Uint8Array([
        0x00, 0x00, 0x00, 0x18,
        0x66, 0x74, 0x79, 0x70,
        0x61, 0x76, 0x69, 0x66,
      ]);

      expect(detectSafeImageMime(jpeg)).toBe("image/jpeg");
      expect(detectSafeImageMime(png)).toBe("image/png");
      expect(detectSafeImageMime(gif)).toBe("image/gif");
      expect(detectSafeImageMime(webp)).toBe("image/webp");
      expect(detectSafeImageMime(avif)).toBe("image/avif");
    });

    it("rejects HTML, SVG, scripts, and short buffers in detectSafeImageMime", () => {
      const enc = new TextEncoder();
      expect(detectSafeImageMime(enc.encode("<html><body>xss</body></html>"))).toBeNull();
      expect(detectSafeImageMime(enc.encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
      expect(detectSafeImageMime(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
    });

    it("sanitizes unsafe Content-Types like text/html and image/svg+xml in resolveSafeImageContentType", () => {
      expect(resolveSafeImageContentType("image/webp; charset=utf-8", "u1/a.webp")).toBe("image/webp");
      expect(resolveSafeImageContentType("text/html", "u1/photo.png")).toBe("image/png");
      expect(resolveSafeImageContentType("image/svg+xml", "u1/photo.jpg")).toBe("image/jpeg");
      expect(resolveSafeImageContentType("text/html", "u1/unknown")).toBe("application/octet-stream");
    });

    it("detects unsafe path traversal, null bytes, backslashes, and malformed encodings", () => {
      expect(hasUnsafePathTraversal("../secret.jpg")).toBe(true);
      expect(hasUnsafePathTraversal("./photo.jpg")).toBe(true);
      expect(hasUnsafePathTraversal("u1/%2e%2e/secret.jpg")).toBe(true);
      expect(hasUnsafePathTraversal("u1/a\0b.jpg")).toBe(true);
      expect(hasUnsafePathTraversal("u1\\photo.jpg")).toBe(true);
      expect(hasUnsafePathTraversal("u1/%E0%A4%A.jpg")).toBe(true);
      expect(hasUnsafePathTraversal("user-123/photo-1.jpg")).toBe(false);
    });

    it("filters paths strictly to validated user-owned prefixes in filterSafeUserOwnedPaths", () => {
      const filtered = filterSafeUserOwnedPaths(
        [
          "user-1/valid-1.jpg",
          "user-1/sub/valid-2.webp",
          "user-2/other.jpg",
          "user-1/../other.jpg",
          "user-1/",
          null,
          42,
        ],
        "user-1"
      );

      expect(filtered).toEqual(["user-1/valid-1.jpg", "user-1/sub/valid-2.webp"]);
    });
  });

  describe("R2 Storage Hardening (lib/r2-storage.ts)", () => {
    it("contains zero hardcoded credentials and enforces 1,000-item batch/page caps", () => {
      const r2Src = readFile("lib/r2-storage.ts");
      expect(r2Src).not.toMatch(/b6521b60|r2\.dev\/[a-z0-9]/i);
      expect(r2Src).toContain("process.env.CLOUDFLARE_R2_ACCOUNT_ID");
      expect(r2Src).toContain("process.env.CLOUDFLARE_R2_ACCESS_KEY_ID");
      expect(r2Src).toContain("process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY");
      expect(r2Src).toContain("const BATCH_SIZE = 1000;");
      expect(r2Src).toContain("const PAGE_SIZE = 1000;");
    });

    it("fails closed when Supabase storage verification fails", async () => {
      const failingSupabaseMock = {
        rpc: async () => ({ data: null, error: new Error("rpc unavailable") }),
        from: () => ({
          select: () => ({
            range: async () => ({ data: null, error: new Error("table read failed") }),
          }),
        }),
      };

      const res = await checkStorageLimit(1024, failingSupabaseMock);
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe("STORAGE_LIMIT_EXCEEDED");
      expect(res.remainingBytes).toBe(0);
    });
  });

  describe("Pure Progress & Stats Calculations (lib/progress-utils.ts & lib/stats-calculations.ts)", () => {
    it("deduplicates shared summits (Gorbea -> 1 physical peak out of 47) and ignores wishlist entries", () => {
      expect(TOTAL_PHYSICAL_PEAKS).toBe(47);
      expect(TOTAL_WORLD_COUNTRIES).toBe(196);

      const ascents = [
        { summit_id: "gorbea", is_wishlist: false },
        { summit_id: "gorbea", is_wishlist: false }, // Duplicate ascent of shared peak still counts once
        { summit_id: "huesca", is_wishlist: true }, // Wishlist must not count
        { summit_id: "country-es", is_wishlist: false },
        { summit_id: "country-fr", is_wishlist: true },
        { summit_id: "country-invalid", is_wishlist: false },
      ];

      expect(countCompletedPeaksUnique(ascents)).toBe(1);
      expect(countCompletedCountriesUnique(ascents)).toBe(1);

      const stats = computePeaksAndCountriesStats(ascents);
      expect(stats.completedPeaksCount).toBe(1);

      const gorbeaShared = SHARED_PEAKS.find((s) => s.name === "Gorbea");
      expect(gorbeaShared?.provinces).toBe("Álava / Vizcaya");
    });

    it("requires ALL sub-items for multi-step experiences and tracks predefined total > 0", () => {
      expect(getPredefinedExperienceTotalCount()).toBeGreaterThan(0);

      const singleExp = { id: "exp-single" };
      expect(isExperienceItemCompleted(singleExp, [{ experience_id: "exp-single", is_wishlist: false }])).toBe(true);
      expect(isExperienceItemCompleted(singleExp, [{ experience_id: "exp-single", is_wishlist: true }])).toBe(false);

      const multiExp = { id: "exp-wonders", subItems: [{ id: "s1" }, { id: "s2" }] };
      expect(
        isExperienceItemCompleted(multiExp, [
          { experience_id: "exp-wonders", sub_item_id: "s1", is_wishlist: false },
        ])
      ).toBe(false);
      expect(
        isExperienceItemCompleted(multiExp, [
          { experience_id: "exp-wonders", sub_item_id: "s1", is_wishlist: false },
          { experience_id: "exp-wonders", sub_item_id: "s2", is_wishlist: false },
        ])
      ).toBe(true);
    });

    it("builds grouped timelines separating dated and undated records", () => {
      const timelines = buildAllTimelines(
        [
          { summit_id: "country-es", achieved_on: "2025-05-10", created_at: "2025-05-10T10:00:00Z", is_wishlist: false },
          { summit_id: "country-pt", achieved_on: "1900-01-01", created_at: "2025-05-10T10:00:00Z", is_wishlist: false },
          { summit_id: "gorbea", achieved_on: "2024-08-12", created_at: "2024-08-12T10:00:00Z", is_wishlist: false },
        ],
        [
          { experience_id: "exp-aurora", achieved_on: "2025-02-01", created_at: "2025-02-01T10:00:00Z", is_wishlist: false },
        ]
      );

      expect(timelines.visitsTimeline.years.length).toBe(1);
      expect(timelines.visitsTimeline.undated.length).toBe(1);
      expect(timelines.visitsTimeline.totalCount).toBe(2);
      expect(timelines.peaksTimeline.years[0].year).toBe(2024);
      expect(timelines.experiencesTimeline.totalCount).toBe(1);
    });
  });

  describe("Date Utils & O(N) Feed Filtering (lib/date-utils.ts & lib/feed-filter.ts)", () => {
    it("formats single dates, date ranges without duplication, and treats 1900-01-01 as unknown", () => {
      expect(isUnknownDate("1900-01-01")).toBe(true);
      expect(isUnknownDate("2025-05-10")).toBe(false);

      const single = formatRecordDateRange("2025-05-10", "2025-05-10");
      expect(single).toBe("10 may 2025");
      expect(single).not.toContain(" - ");

      const range = formatRecordDateRange("2025-05-10", "2025-05-12");
      expect(range).toBe("10 may 2025 - 12 may 2025");
    });

    it("filters feed items by mode, experiences toggle, following, and multi-token search", () => {
      const items = [
        {
          id: "1",
          type: "ascent",
          user_id: "u1",
          summit_id: "country-jp",
          achieved_on: "2025-04-01",
          profiles: { username: "ana" },
        },
        {
          id: "2",
          type: "ascent",
          user_id: "u2",
          summit_id: "huesca",
          achieved_on: "2024-07-15",
          profiles: { username: "bruno" },
        },
        {
          id: "3",
          type: "experience",
          user_id: "u1",
          experience_id: "exp-aurora",
          experience_title: "Auroras Boreales",
          achieved_on: "2025-01-20",
          profiles: { username: "ana" },
        },
      ];

      const countryResults = filterFeedItems({
        feedItems: items,
        enablePeaks: true,
        enableCountries: true,
        enableExperiences: true,
        mode: "countries",
        experiencesMode: false,
        searchQuery: "@ana japón",
        followingOnly: true,
        followingUserIdsSet: new Set(["u1"]),
      });
      expect(countryResults.map((i) => i.id)).toEqual(["1"]);

      const expResults = filterFeedItems({
        feedItems: items,
        enablePeaks: true,
        enableCountries: true,
        enableExperiences: true,
        mode: "countries",
        experiencesMode: true,
        searchQuery: "auroras enero",
        followingOnly: false,
        followingUserIdsSet: new Set(),
      });
      expect(expResults.map((i) => i.id)).toEqual(["3"]);
    });
  });

  describe("CSS Architecture & Database Migration 034 Hygiene", () => {
    it("contains zero render-blocking fonts.googleapis @imports and defines canonical font variables", () => {
      const allStyles = readAllStyles();
      const rankingStyles = readRankingStyles();
      const statsModalCss = readFile("components/stats-modal.css");
      const tokensCss = readFile("styles/tokens.css");

      expect(allStyles).not.toContain("fonts.googleapis.com");
      expect(rankingStyles).not.toContain("fonts.googleapis.com");
      expect(statsModalCss).not.toContain("fonts.googleapis.com");

      expect(tokensCss).toContain("--font-sans:");
      expect(tokensCss).toContain("--font-mono:");
      expect(tokensCss).toContain("--font-serif:");
      expect(tokensCss).toContain("--font-display:");
    });

    it("does not put permanent will-change: transform on base markers or inactive marquee tracks, nor dangling -webkit- lines", () => {
      const allStyles = readAllStyles();
      expect(allStyles).not.toMatch(/\.leaflet-marker-icon\s*\{[^}]*will-change:\s*transform/);
      expect(allStyles).not.toMatch(/(?:^|\n)\.marquee-text-track\s*\{[^}]*will-change:\s*transform/);
      expect(allStyles).not.toMatch(/^[ \t]*-webkit-[ \t]*$/m);
    });

    it("defines Supabase migration 034 with SET search_path = public and stealth test exclusion", () => {
      const sqlPath = path.join(process.cwd(), "supabase/migrations/034_security_hardening.sql");
      expect(fs.existsSync(sqlPath)).toBe(true);
      const sql = fs.readFileSync(sqlPath, "utf8");

      expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_user_ranking");
      expect(sql).toContain("CREATE OR REPLACE FUNCTION public.get_mutual_followers");
      expect(sql).toContain("SET search_path = public");
      expect((sql.match(/SET search_path = public/g) || []).length).toBeGreaterThanOrEqual(2);
      expect((sql.match(/p\.is_test IS NOT TRUE/g) || []).length).toBeGreaterThanOrEqual(2);
    });
  });
});
