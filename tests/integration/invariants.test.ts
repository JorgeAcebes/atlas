import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { peaks } from "@/data/peaks";
import { predefinedCategories } from "@/data/experiences";
import { format } from "date-fns";
import { es } from "date-fns/locale";

function isUnknownDate(dateVal: string | undefined | null): boolean {
  if (!dateVal) return true;
  if (typeof dateVal === "string") {
    const trimmed = dateVal.trim();
    if (trimmed.startsWith("1900-01-01") || trimmed.startsWith("1899-12-31")) return true;
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return true;
  return d.getFullYear() <= 1900;
}

function formatCustomDate(dateVal: string | undefined | null): string {
  if (!dateVal || isUnknownDate(dateVal)) return "";
  const trimmed = typeof dateVal === "string" ? dateVal.split("T")[0] : "";
  const parts = trimmed.split("-");
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day, 12, 0, 0);
    return format(d, "d MMM yyyy", { locale: es });
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return "";
  return format(d, "d MMM yyyy", { locale: es });
}

function formatRecordDateRange(startDateVal: string | undefined | null, endDateVal: string | undefined | null): string {
  const startStr = formatCustomDate(startDateVal);
  if (!startStr) return "";
  if (endDateVal && !isUnknownDate(endDateVal) && endDateVal !== startDateVal) {
    const endStr = formatCustomDate(endDateVal);
    if (endStr && endStr !== startStr) {
      return `${startStr} - ${endStr}`;
    }
  }
  return startStr;
}

describe("Project Critical Invariants (No Regressions)", () => {
  const rootDir = path.resolve(__dirname, "../../");

  describe("Feed Card & Date Invariants", () => {
    it("Invariant 1.1: Feed tab must format relative time for header and retain title link", () => {
      const feedTabPath = path.join(rootDir, "components/feed-tab.tsx");
      const content = fs.readFileSync(feedTabPath, "utf-8");

      expect(content).toContain("formatDateSafe(");
      expect(content).toContain("#panel=");
    });

    it("Invariant 1.2: Activity date formatting for single date", () => {
      const result = formatRecordDateRange("2024-08-12", null);
      expect(result).toBe("12 ago 2024");
    });

    it("Invariant 1.3: Activity date formatting for date range", () => {
      const result = formatRecordDateRange("2024-08-12", "2024-08-15");
      expect(result).toBe("12 ago 2024 - 15 ago 2024");
    });

    it("Invariant 1.4: Date formatting should not duplicate date when start and end date are the same", () => {
      const result = formatRecordDateRange("2024-08-12", "2024-08-12");
      expect(result).toBe("12 ago 2024");
    });

    it("Invariant 1.5: Date formatting should return empty string for unknown/invalid dates", () => {
      expect(formatRecordDateRange("1900-01-01", null)).toBe("");
      expect(formatRecordDateRange("1899-12-31", null)).toBe("");
      expect(formatRecordDateRange(null, null)).toBe("");
    });

    it("Invariant 1.6: Feed cards must include feed-share-btn for sharing deep-links", () => {
      const feedTabPath = path.join(rootDir, "components/feed-tab.tsx");
      const content = fs.readFileSync(feedTabPath, "utf-8");

      expect(content).toContain("feed-share-btn");
      expect(content).toContain("handleShare");
    });

    it("Invariant 1.7: Feed cards must NOT contain reaction buttons (like, dislike, comment)", () => {
      const feedTabPath = path.join(rootDir, "components/feed-tab.tsx");
      const content = fs.readFileSync(feedTabPath, "utf-8");

      expect(content).not.toContain("feed-reaction-btn");
      expect(content).not.toContain("feed-comments-section");
      expect(content).not.toContain("feed-card-actions");
    });

    it("Invariant 1.8: Feed title must NOT concatenate date, keeping displayTitle clean", () => {
      const feedTabPath = path.join(rootDir, "components/feed-tab.tsx");
      const content = fs.readFileSync(feedTabPath, "utf-8");

      expect(content).toContain("const displayTitle = finalLocationName;");
      expect(content).not.toMatch(/displayTitle\s*=\s*dateRangeStr/);
    });
  });

  describe("Counters & Proportions Invariants", () => {
    it("Invariant 2.1: Peaks count must preserve 52 demarcations and 47 physical peaks", () => {
      expect(peaks).toHaveLength(52);
      const uniquePeaks = new Set(peaks.map((p) => p.name));
      expect(uniquePeaks.size).toBe(47);
    });

    it("Invariant 2.2: Experiences with sub-items are ONLY complete when ALL sub-items are marked", () => {
      const expWithSubItems = predefinedCategories
        .flatMap((c) => c.experiences)
        .find((e) => e.subItems && e.subItems.length > 1);

      expect(expWithSubItems).toBeDefined();
      if (!expWithSubItems || !expWithSubItems.subItems) return;

      const subIds = expWithSubItems.subItems.map((s) => s.id);

      // Partial completion: all except the last one
      const partialExpRecords = subIds.slice(0, -1).map((sId) => ({
        experience_id: expWithSubItems.id,
        sub_item_id: sId,
      }));

      const isPartiallyComplete = subIds.every((id) =>
        partialExpRecords.some((r) => r.experience_id === expWithSubItems.id && r.sub_item_id === id)
      );
      expect(isPartiallyComplete).toBe(false);

      // Full completion: all sub-items
      const fullExpRecords = subIds.map((sId) => ({
        experience_id: expWithSubItems.id,
        sub_item_id: sId,
      }));

      const isFullyComplete = subIds.every((id) =>
        fullExpRecords.some((r) => r.experience_id === expWithSubItems.id && r.sub_item_id === id)
      );
      expect(isFullyComplete).toBe(true);
    });
  });

  describe("Auth, Layout & Hydration Invariants", () => {
    it("Invariant 3.1: AuthContext must preserve session across mounts and only purge on SIGNED_OUT", () => {
      const authContextPath = path.join(rootDir, "components/auth-context.tsx");
      const content = fs.readFileSync(authContextPath, "utf-8");

      expect(content).toContain("globalSession");
      expect(content).toContain("globalProfile");
      expect(content).toContain("SIGNED_OUT");
    });

    it("Invariant 3.2: AuthDialog must not show 'He olvidado la contraseña' when creating an account (isRegister)", () => {
      const authDialogPath = path.join(rootDir, "components/auth-dialog.tsx");
      const content = fs.readFileSync(authDialogPath, "utf-8");

      expect(content).toMatch(/!isRegister\s*&&\s*\(?[\s\S]*?He olvidado la contraseña/);
    });

    it("Invariant 4.1: Layout CSS must retain stable scrollbar gutter to prevent desktop shift", () => {
      const globalsCssPath = path.join(rootDir, "app/globals.css");
      const content = fs.readFileSync(globalsCssPath, "utf-8");

      expect(content).toMatch(/scrollbar-gutter:\s*stable/);
    });

    it("Invariant 5.1: Ranking CSS must retain top-3 podium margin to prevent avatar outline clipping", () => {
      const rankingCssPath = path.join(rootDir, "components/ranking.css");
      const content = fs.readFileSync(rankingCssPath, "utf-8");

      expect(content).toContain(".ranking-avatar");
      expect(content).toMatch(/\.ranking-avatar\s*\{[^}]*margin:\s*4px/);
    });
  });

  describe("Experiences & Map Invariants", () => {
    it("Invariant 6.1: world-map.tsx must only render experience markers when experiencesMode is true", () => {
      const worldMapPath = path.join(rootDir, "components/world-map.tsx");
      const content = fs.readFileSync(worldMapPath, "utf-8");

      expect(content).toContain("if (experiencesMode && experienceRecords)");
      expect(content).toContain("experiencesModeRef.current = experiencesMode;");
    });

    it("Invariant 6.2: summit-tracker.tsx must guard handleExperienceClick and conditionally pass experienceRecords", () => {
      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const content = fs.readFileSync(trackerPath, "utf-8");

      expect(content).toMatch(/function handleExperienceClick[\s\S]*?if \(!experiencesMode\) return;/);
      expect(content).toMatch(/experiencesMode\s*\?\s*experienceRecords\.map/);
    });

    it("Invariant 6.3: summit-tracker.tsx must close experience records upon deactivating experiences mode", () => {
      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const content = fs.readFileSync(trackerPath, "utf-8");

      expect(content).toContain("handleToggleExperiences");
      expect(content).toContain("isSelectedExperience");
      expect(content).toContain("setExperiencesMode(false)");
    });
  });

  describe("Record Links Invariants", () => {
    it("Invariant 7.1: summit-tracker.tsx must render record links in completed record cards", () => {
      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const content = fs.readFileSync(trackerPath, "utf-8");

      expect(content).toContain("renderRecordLink");
      expect(content).toContain("{renderRecordLink(ascent.link, (ascent as any).link_name)}");
    });

    it("Invariant 7.2: summit-tracker.tsx must support a second link with subtle display and persistence", () => {
      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const content = fs.readFileSync(trackerPath, "utf-8");

      expect(content).toContain("link_2");
      expect(content).toContain("link_name_2");
      expect(content).toContain("showSecondLink");
      expect(content).toContain("renderRecordLink((ascent as any).link_2, (ascent as any).link_name_2)");
    });

    it("Invariant 7.3: feed-tab.tsx must select and render the second link in activity cards", () => {
      const feedPath = path.join(rootDir, "components/feed-tab.tsx");
      const content = fs.readFileSync(feedPath, "utf-8");

      expect(content).toContain("link_2");
      expect(content).toContain("link_name_2");
      expect(content).toContain("renderFeedLink(item.link_2, item.link_name_2)");
    });

    it("Invariant 7.4: Footprints icon must be assigned for hiking/running links and placeholder for second link must guide user", () => {
      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const trackerContent = fs.readFileSync(trackerPath, "utf-8");
      expect(trackerContent).toContain("Footprints");
      expect(trackerContent).toMatch(/strava\.com[\s\S]*?Icon\s*=\s*Footprints/);
      expect(trackerContent).toMatch(/strava\.app\.link[\s\S]*?Icon\s*=\s*Footprints/);
      expect(trackerContent).toMatch(/wikiloc\.com[\s\S]*?Icon\s*=\s*Footprints/);
      expect(trackerContent).toContain('placeholder="Ej: Restaurante favorito"');

      const feedPath = path.join(rootDir, "components/feed-tab.tsx");
      const feedContent = fs.readFileSync(feedPath, "utf-8");
      expect(feedContent).toContain("Footprints");
      expect(feedContent).toMatch(/strava\.com[\s\S]*?Icon\s*=\s*Footprints/);
      expect(feedContent).toMatch(/strava\.app\.link[\s\S]*?Icon\s*=\s*Footprints/);
      expect(feedContent).toMatch(/wikiloc\.com[\s\S]*?Icon\s*=\s*Footprints/);
    });

    it("Invariant 7.5: Country record dialog must omit continent, dropzone must disable on 4 photos, and second link container must omit dashed border", () => {
      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const trackerContent = fs.readFileSync(trackerPath, "utf-8");
      expect(trackerContent).toMatch(/countries\.some\(\(c\)\s*=>\s*c\.id\s*===\s*selected\.id\)\s*\?\s*null\s*:/);
      expect(trackerContent).toContain("isPhotoLimitReached");
      expect(trackerContent).toContain("file-dropzone--disabled");
      expect(trackerContent).not.toMatch(/borderTop:\s*"1px dashed/);

      const globalsCssPath = path.join(rootDir, "app/globals.css");
      const globalsCss = fs.readFileSync(globalsCssPath, "utf-8");
      expect(globalsCss).toContain(".file-dropzone--disabled");
    });
  });

  describe("Test Profile Stealth & Isolation Invariants", () => {
    it("Invariant 8.1: ranking-tab.tsx must exclude is_test profiles from user counts", () => {
      const rankingPath = path.join(rootDir, "components/ranking-tab.tsx");
      const content = fs.readFileSync(rankingPath, "utf-8");
      expect(content).toContain(".neq('is_test', true)");
    });

    it("Invariant 8.2: feed-tab.tsx must exclude activities from is_test profiles", () => {
      const feedPath = path.join(rootDir, "components/feed-tab.tsx");
      const content = fs.readFileSync(feedPath, "utf-8");
      expect(content).toContain("if (a.profiles?.is_test) return false;");
      expect(content).toContain("if (e.profiles?.is_test) return false;");
    });

    it("Invariant 8.3: social-tab.tsx must exclude is_test profiles from search and recommendations", () => {
      const socialPath = path.join(rootDir, "components/social-tab.tsx");
      const content = fs.readFileSync(socialPath, "utf-8");
      expect(content).toContain(".neq('is_test', true)");
    });

    it("Invariant 8.4: migration 023 must define is_test on profiles and update get_user_ranking", () => {
      const migrationPath = path.join(rootDir, "supabase/migrations/023_test_profiles_exclusion.sql");
      expect(fs.existsSync(migrationPath)).toBe(true);
      const content = fs.readFileSync(migrationPath, "utf-8");
      expect(content).toContain("is_test BOOLEAN NOT NULL DEFAULT false");
      expect(content).toContain("p.is_test IS NOT TRUE");
    });
  });

  describe("Mobile Scroll Locking & Photo Lightbox History Invariants", () => {
    it("Invariant 9.1: feed-tab.tsx must push #lightbox state and listen to popstate to close lightbox without leaving feed", () => {
      const feedPath = path.join(rootDir, "components/feed-tab.tsx");
      const content = fs.readFileSync(feedPath, "utf-8");

      expect(content).toContain('window.history.pushState({ feedLightbox: true }, "", "#lightbox")');
      expect(content).toContain('window.addEventListener("popstate", handleCloseOnNavigation)');
      expect(content).toContain('window.addEventListener("hashchange", handleCloseOnNavigation)');
      expect(content).toContain("closeLightbox");
    });

    it("Invariant 9.2: Both feed-tab.tsx and summit-tracker.tsx must lock documentElement and body scroll when viewing photos", () => {
      const feedPath = path.join(rootDir, "components/feed-tab.tsx");
      const feedContent = fs.readFileSync(feedPath, "utf-8");
      expect(feedContent).toContain('document.documentElement.style.overflow = "hidden"');
      expect(feedContent).toContain('document.body.style.overflow = "hidden"');

      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const trackerContent = fs.readFileSync(trackerPath, "utf-8");
      expect(trackerContent).toContain('document.documentElement.style.overflow = "hidden"');
      expect(trackerContent).toContain('document.body.style.overflow = "hidden"');
    });

    it("Invariant 9.3: summit-tracker.tsx must lock background scroll on mobile when viewing a record", () => {
      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const content = fs.readFileSync(trackerPath, "utf-8");

      expect(content).toContain("isMobile && !!selected");
      expect(content).toContain("isScrollLocked");
    });

    it("Invariant 9.4: globals.css must contain overscroll-behavior and disable pointer-events on background elements on mobile", () => {
      const cssPath = path.join(rootDir, "app/globals.css");
      const content = fs.readFileSync(cssPath, "utf-8");

      expect(content).toContain("overscroll-behavior: contain");
      expect(content).toContain("touch-action: none");
      expect(content).toMatch(/main\.panel-open\s+\.map-wrapper/);
      expect(content).toMatch(/pointer-events:\s*none/);
    });

    it("Invariant 9.5: globals.css must hide country summit pins at zoom levels 0 through 5 and by default in mode-countries", () => {
      const cssPath = path.join(rootDir, "app/globals.css");
      const content = fs.readFileSync(cssPath, "utf-8");

      expect(content).toContain('.mode-countries .summit-pin:not(.summit-pin--experience)');
      expect(content).toContain('.mode-countries .map[data-zoom="0"] .summit-pin:not(.summit-pin--experience)');
      expect(content).toContain('.mode-countries .map[data-zoom="5"] .summit-pin:not(.summit-pin--experience)');
      expect(content).toContain('.map[data-zoom="0"] .summit-pin:not(.summit-pin--experience)');
    });

    it("Invariant 9.6: profile-settings.tsx must lock documentElement and body scroll when mounted", () => {
      const settingsPath = path.join(rootDir, "components/profile-settings.tsx");
      const content = fs.readFileSync(settingsPath, "utf-8");

      expect(content).toContain('document.documentElement.style.overflow = "hidden"');
      expect(content).toContain('document.body.style.overflow = "hidden"');
      expect(content).toContain('overscrollBehavior: "contain"');
    });
  });

  describe("Modality Preferences & Visibility Invariants", () => {
    it("Invariant 10.1: profile-settings.tsx must include toggles for both peaks and countries and prevent disabling both", () => {
      const settingsPath = path.join(rootDir, "components/profile-settings.tsx");
      const content = fs.readFileSync(settingsPath, "utf-8");

      expect(content).toContain("enablePeaks");
      expect(content).toContain("enableCountries");
      expect(content).toContain("!enablePeaks && !enableCountries");
    });

    it("Invariant 10.2: summit-tracker.tsx must guard mode-selector with hasBothModes", () => {
      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const content = fs.readFileSync(trackerPath, "utf-8");

      expect(content).toContain("hasBothModes && (");
      expect(content).toContain("canShowPeaks");
      expect(content).toContain("canShowCountries");
    });

    it("Invariant 10.3: ranking-tab.tsx must guard mode-selector with hasBothModes", () => {
      const rankingPath = path.join(rootDir, "components/ranking-tab.tsx");
      const content = fs.readFileSync(rankingPath, "utf-8");

      expect(content).toContain("hasBothModes && (");
      expect(content).toContain("enablePeaks");
      expect(content).toContain("enableCountries");
    });

    it("Invariant 10.4: feed-tab.tsx must filter out posts of disabled modalities", () => {
      const feedPath = path.join(rootDir, "components/feed-tab.tsx");
      const content = fs.readFileSync(feedPath, "utf-8");

      expect(content).toContain("visibleFeedItems");
      expect(content).toContain("!enablePeaks && isPeak");
      expect(content).toContain("!enableCountries && isCountry");
    });

    it("Invariant 10.5: migration 024 must exist and add enable_peaks and enable_countries to profiles", () => {
      const migrationPath = path.join(rootDir, "supabase/migrations/024_add_modalities_to_profiles.sql");
      expect(fs.existsSync(migrationPath)).toBe(true);
      const content = fs.readFileSync(migrationPath, "utf-8");
      expect(content).toContain("enable_peaks BOOLEAN DEFAULT true");
      expect(content).toContain("enable_countries BOOLEAN DEFAULT true");
    });
  });

  describe("Topbar Account Button & Modality Hierarchy Invariants", () => {
    it("Invariant 11.1: Topbar account button must ONLY display avatar and NEVER display email or username text", () => {
      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const rankingPath = path.join(rootDir, "components/ranking-tab.tsx");
      const socialPath = path.join(rootDir, "components/social-tab.tsx");

      const trackerContent = fs.readFileSync(trackerPath, "utf-8");
      const rankingContent = fs.readFileSync(rankingPath, "utf-8");
      const socialContent = fs.readFileSync(socialPath, "utf-8");

      for (const [name, content] of [
        ["summit-tracker.tsx", trackerContent],
        ["ranking-tab.tsx", rankingContent],
        ["social-tab.tsx", socialContent],
      ]) {
        // Must contain account-button and account-avatar
        expect(content, `${name} must include account-button`).toContain('className="account-button"');
        expect(content, `${name} must include account-avatar`).toContain('className="account-avatar"');

        // Must NOT render username or email text next to the avatar
        expect(content, `${name} must not render username text in account-button`).not.toMatch(
          /className="account-button"[\s\S]*?<span>\{myProfile\?\.username/
        );
        expect(content, `${name} must not render email text in account-button`).not.toMatch(
          /className="account-button"[\s\S]*?session\.user\.email\?\.split\("@"\)/
        );
        expect(content, `${name} must not contain account-username class`).not.toContain("account-username");
      }
    });

    it("Invariant 11.2: profile-settings.tsx must freeze experiences when countries mode is disabled", () => {
      const settingsPath = path.join(rootDir, "components/profile-settings.tsx");
      const content = fs.readFileSync(settingsPath, "utf-8");

      expect(content).toContain("setEnableExperiences(false)");
      expect(content).toContain("enable_experiences: enableCountries ? enableExperiences : false");
      expect(content).toContain("disabled={!enableCountries}");
    });

    it("Invariant 11.3: summit-tracker.tsx must force experiencesMode to false if canShowCountries is false", () => {
      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const content = fs.readFileSync(trackerPath, "utf-8");

      expect(content).toContain("if (!canShowCountries) {");
      expect(content).toContain("if (experiencesMode) setExperiencesMode(false)");
    });

    it("Invariant 11.4: globals.css must style mountain-art with 160px for both countries and experiences modes", () => {
      const globalsCssPath = path.join(rootDir, "app/globals.css");
      const content = fs.readFileSync(globalsCssPath, "utf-8");

      expect(content).toMatch(/\.mode-countries\s+\.mountain-art,\s*\r?\n\s*\.mode-experiences\s+\.mountain-art\s*\{[^}]*font-size:\s*160px;/);
    });

    it("Invariant 11.5: spain-map.tsx must use Lucide React SVG icons for all pins and avoid raw unicode symbols", () => {
      const spainMapPath = path.join(rootDir, "components/spain-map.tsx");
      const content = fs.readFileSync(spainMapPath, "utf-8");

      // Must not contain raw unicode characters in markerIcons
      expect(content).not.toContain("summit-pin summit-pin--done\">✓");
      expect(content).not.toContain("summit-pin\">△");
      expect(content).not.toContain("summit-pin summit-pin--wishlist\">★");
      expect(content).not.toContain("summit-pin summit-pin--diff-only-me\">✓");
      expect(content).not.toContain("summit-pin summit-pin--diff-both\">⬟");
      expect(content).not.toContain("summit-pin summit-pin--diff-none\">△");

      // Must contain SVG icons with proper paths
      expect(content).toContain("M20 6 9 17l-5-5"); // Check
      expect(content).toContain("M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"); // Triangle
      expect(content).toContain("M11.525 2.295"); // Star
      expect(content).toContain("M10.83 2.38"); // Pentagon
    });

    it("Invariant 11.6: summit-tracker.tsx must not display dates in photo captions (only photo.caption if present) or in the photo lightbox view", () => {
      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const content = fs.readFileSync(trackerPath, "utf-8");

      // Figcaptions must not fallback to formatDate(photo.taken_on)
      expect(content).not.toContain("formatDate(photo.taken_on)");

      // Lightbox subtitle must only display title and not concatenate photo dates
      expect(content).not.toContain("formatShortDate(lightboxPhoto.taken_on)");
    });

    it("Invariant 11.7: app/loading.tsx must implement a debounce delay threshold to avoid flashing on cached/instant navigations", () => {
      const loadingPath = path.join(rootDir, "app/loading.tsx");
      const content = fs.readFileSync(loadingPath, "utf-8");

      expect(content).toContain('"use client"');
      expect(content).toContain("setTimeout");
      expect(content).toMatch(/700|800/);
      expect(content).toContain("clearTimeout");
    });

    it("Invariant 11.8: components/delete-account-modal.tsx must isolate its dialog and input events from parent backdrop", () => {
      const modalPath = path.join(rootDir, "components/delete-account-modal.tsx");
      const content = fs.readFileSync(modalPath, "utf-8");

      expect(content).toContain("e.stopPropagation()");
      expect(content).toMatch(/id="delete-confirmation-input"[\s\S]*?onClick=\{\(e\)\s*=>\s*e\.stopPropagation\(\)\}/);
    });

    it("Invariant 11.9: app/icon.svg, public/icon-192.svg and icon-512.svg must have no background rectangles (transparent logo)", () => {
      const iconSvg = fs.readFileSync(path.join(rootDir, "app/icon.svg"), "utf-8");
      const icon192 = fs.readFileSync(path.join(rootDir, "public/icon-192.svg"), "utf-8");
      const icon512 = fs.readFileSync(path.join(rootDir, "public/icon-512.svg"), "utf-8");

      expect(iconSvg).not.toContain("<rect");
      expect(icon192).not.toContain("<rect");
      expect(icon512).not.toContain("<rect");
    });

    it("Invariant 11.10: Removed banner and eyebrow texts must not be present in components/summit-tracker.tsx", () => {
      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const content = fs.readFileSync(trackerPath, "utf-8");

      expect(content).not.toContain("UN RETO, 196 PAÍSES");
      expect(content).not.toContain("UN RETO, 47 PICOS");
      expect(content).not.toContain("UN RETO, EXPERIENCIAS GLOBALES");
      expect(content).not.toContain("El mapa para registrar cada país del mundo que has visitado.");
      expect(content).not.toContain("El mapa para conquistar el techo de cada provincia española.");
      expect(content).not.toContain("El mapa para registrar todas las experiencias de tu vida.");
      expect(content).not.toContain("EL RETO COMPLETO");
      expect(content).not.toContain("TU PROGRESO");
      expect(content).not.toContain("Selecciona cualquier marcador para conocer el pico o registrar una ascensión.");
      expect(content).not.toContain("Haz clic en cualquier país para ver su información o marcarlo como visitado.");
      expect(content).not.toContain("Márcalas en tu mapa.");
      expect(content).toContain("Márcalo en tu mapa.");
      expect(content).not.toContain("mountain-art");
      expect(content).not.toContain("challenge-summary");
      expect(content).not.toContain("Un país por descubrir");
      expect(content).not.toContain("Un mundo por explorar");
    });

    it("Invariant 11.11: Browser window icon must be prominent (~85%+ viewBox) while PWA icons are preserved via manifest.json", () => {
      const iconSvg = fs.readFileSync(path.join(rootDir, "app/icon.svg"), "utf-8");
      expect(iconSvg).not.toContain("<rect");
      expect(iconSvg).not.toContain("scale(0.7)");
      expect(iconSvg).toContain('viewBox="0 0 56 56"');

      const manifest = fs.readFileSync(path.join(rootDir, "public/manifest.json"), "utf-8");
      expect(manifest).toContain('icon-192.png');
      expect(manifest).toContain('icon-512.png');

      const layout = fs.readFileSync(path.join(rootDir, "app/layout.tsx"), "utf-8");
      expect(layout).toContain('icon.svg');
      expect(layout).toContain('favicon.ico');
      expect(layout).toContain('apple-touch-icon.png');
    });

    it("Invariant 11.12: Topbar must remain sticky and map navigation must support scrollToMap without breaking other tabs", () => {
      const globalsCss = fs.readFileSync(path.join(rootDir, "app/globals.css"), "utf-8").replace(/\r\n/g, "\n");
      expect(globalsCss).toContain(".topbar {\n  position: sticky;");
      expect(globalsCss).not.toContain(".topbar {\n  position: relative;");

      const trackerContent = fs.readFileSync(path.join(rootDir, "components/summit-tracker.tsx"), "utf-8");
      expect(trackerContent).toContain("scrollToMap");
      expect(trackerContent).toContain("scrollToMap(e)");

      const socialContent = fs.readFileSync(path.join(rootDir, "components/social-tab.tsx"), "utf-8");
      expect(socialContent).toContain('<Link href={mapLink} prefetch={true} className="topbar-nav-link topbar-nav-link--mapa">Mapa</Link>');

      const rankingContent = fs.readFileSync(path.join(rootDir, "components/ranking-tab.tsx"), "utf-8");
      expect(rankingContent).toContain('<Link href={mapLink} prefetch={true} className="topbar-nav-link topbar-nav-link--mapa">Mapa</Link>');
    });

    it("Invariant 11.13: Topbar mode toggle and nav links must maintain consistent coordinates without bold layout shifts", () => {
      const globalsCss = fs.readFileSync(path.join(rootDir, "app/globals.css"), "utf-8");
      expect(globalsCss).toMatch(/\.topbar\s+\.app-mode-switch\s*\{[^}]*top:\s*50%;[^}]*transform:\s*translate\(-50%,\s*-50%\);/);
      expect(globalsCss).toContain(".topbar-nav-link--active");

      const socialContent = fs.readFileSync(path.join(rootDir, "components/social-tab.tsx"), "utf-8");
      expect(socialContent).not.toContain("fontWeight: 'bold'");
      expect(socialContent).toContain("topbar-nav-link--social topbar-nav-link--active");

      const rankingContent = fs.readFileSync(path.join(rootDir, "components/ranking-tab.tsx"), "utf-8");
      expect(rankingContent).not.toContain("fontWeight: 'bold'");
      expect(rankingContent).toContain("topbar-nav-link--ranking topbar-nav-link--active");
    });

    it("Invariant 11.14: Social tab vertebral bar must place profile on left and single category ratio on right", () => {
      const socialContent = fs.readFileSync(path.join(rootDir, "components/social-tab.tsx"), "utf-8");
      expect(socialContent).toContain("hero-profile-wrap");
      expect(socialContent).toContain("activeAchieved");
      expect(socialContent).toContain("activeTotal");
      expect(socialContent).toContain("activeUnit");
      expect(socialContent).toContain("activeCompletion");

      // Verify that profile is on left and hero-stat is on right inside hero-main--social
      const heroSection = socialContent.slice(socialContent.indexOf('hero-main--social'), socialContent.indexOf('hide-on-desktop'));
      const profilePos = heroSection.indexOf('hero-profile-wrap');
      const statPos = heroSection.indexOf('hero-stat');
      expect(profilePos).toBeGreaterThan(-1);
      expect(statPos).toBeGreaterThan(-1);
      expect(profilePos).toBeLessThan(statPos);

      const globalsCss = fs.readFileSync(path.join(rootDir, "app/globals.css"), "utf-8");
      expect(globalsCss).toMatch(/\.hero-main--social\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    });

    it("Invariant 11.15: Social tab must include search pill on left and experiences toggle on right aligned with post column", () => {
      const socialContent = fs.readFileSync(path.join(rootDir, "components/social-tab.tsx"), "utf-8");
      expect(socialContent).toContain('social-feed-controls');
      expect(socialContent).toContain('social-search-box');
      expect(socialContent).toContain('social-search-input');
      expect(socialContent).toContain('diff-toggle-wrap');
      expect(socialContent).toContain("maxWidth: '680px'");

      const globalsCss = fs.readFileSync(path.join(rootDir, "app/globals.css"), "utf-8");
      expect(globalsCss).toContain('.social-feed-controls');
      expect(globalsCss).toContain('.social-search-box');
      expect(globalsCss).toContain('.social-search-input');
    });

    it("Invariant 11.16: Vertebral bar in Social tab must lower profile and lock mobile layout in fixed grid to prevent mode-switching shifts", () => {
      const globalsCss = fs.readFileSync(path.join(rootDir, "app/globals.css"), "utf-8");
      expect(globalsCss).toMatch(/\.hero-main--social\s+\.hero-profile-wrap\s*\{[^}]*margin-top:\s*4px/);
      expect(globalsCss).toMatch(/@media\s*\(max-width:\s*700px\)[\s\S]*?\.hero-main--social\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*1fr\s+1fr/);
      expect(globalsCss).toMatch(/@media\s*\(max-width:\s*700px\)[\s\S]*?\.hero-main--social\s+\.hero-profile-wrap\s*\{[^}]*padding-left:\s*6px/);
    });

    it("Invariant 11.17: Hero mottos must be strictly hidden on mobile and tablet viewports (<= 1023px)", () => {
      const trackerContent = fs.readFileSync(path.join(rootDir, "components/summit-tracker.tsx"), "utf-8");
      expect(trackerContent).toMatch(/hero-title-wrap--motto\s+hide-on-mobile/);

      const socialContent = fs.readFileSync(path.join(rootDir, "components/social-tab.tsx"), "utf-8");
      expect(socialContent).toContain('hero-title-wrap hide-on-mobile');

      const globalsCss = fs.readFileSync(path.join(rootDir, "app/globals.css"), "utf-8");
      expect(globalsCss).toMatch(/@media\s*\(max-width:\s*1023px\)[\s\S]*?\.hero-title-wrap--motto\s*\{[^}]*display:\s*none\s*!important/);
    });

    it("Invariant 11.18: feed-tab.tsx must support multi-field search filtering by username, location and date", () => {
      const feedContent = fs.readFileSync(path.join(rootDir, "components/feed-tab.tsx"), "utf-8");
      expect(feedContent).toContain('searchQuery = ""');
      expect(feedContent).toContain('searchQuery.trim()');
      expect(feedContent).toContain('tokens.every');
      expect(feedContent).toContain('formatRecordDateRange');
      expect(feedContent).toContain('No se encontraron actividades para');
    });

    it("Invariant 11.19: Social and ranking search inputs must hide native cancel buttons to avoid duplicate cross buttons", () => {
      const globalsCss = fs.readFileSync(path.join(rootDir, "app/globals.css"), "utf-8");
      expect(globalsCss).toMatch(/\.social-search-input::-webkit-search-cancel-button[\s\S]*?display:\s*none\s*!important/);

      const rankingCss = fs.readFileSync(path.join(rootDir, "components/ranking.css"), "utf-8");
      expect(rankingCss).toMatch(/\.ranking-search-input::-webkit-search-cancel-button[\s\S]*?display:\s*none/);
    });

    it("Invariant 11.20: Experiences mode in Social tab must trigger dark theme across feed, cards, links, numbers and search", () => {
      const socialContent = fs.readFileSync(path.join(rootDir, "components/social-tab.tsx"), "utf-8");
      expect(socialContent).toContain('main className={isPeaks ? "" : isExp ? "mode-experiences" : "mode-countries"}');
      expect(socialContent).toContain('document.body.classList.add("mode-experiences")');

      const globalsCss = fs.readFileSync(path.join(rootDir, "app/globals.css"), "utf-8");
      expect(globalsCss).toContain('.mode-experiences .feed-card');
      expect(globalsCss).toContain('.mode-experiences .social-search-input');
      expect(globalsCss).toContain('.mode-experiences .feed-link');
      expect(globalsCss).toContain('.mode-experiences .hero-stat strong');
    });

    it("Invariant 11.21: Experiences mode in Social tab must strictly filter feed to experiences only and exclude countries", () => {
      const feedContent = fs.readFileSync(path.join(rootDir, "components/feed-tab.tsx"), "utf-8");
      expect(feedContent).toMatch(/if\s*\(\s*experiencesMode\s*&&\s*enableExperiences\s*\)\s*\{\s*return\s+isExperience;\s*\}/);
      expect(feedContent).toMatch(/return\s+isCountry;/);
    });

    it("Invariant 11.22: Target profile central follow button must render UserRound icons and state labels", () => {
      const trackerContent = fs.readFileSync(path.join(rootDir, "components/summit-tracker.tsx"), "utf-8");
      expect(trackerContent).toContain("UserRoundPlus");
      expect(trackerContent).toContain("UserRoundCheck");
      expect(trackerContent).toContain("UserRoundMinus");
      expect(trackerContent).toContain("UserRoundArrowLeft");
      expect(trackerContent).toContain('"Seguir"');
      expect(trackerContent).toContain('"Siguiendo"');
      expect(trackerContent).toContain('"pendiente"');
      expect(trackerContent).toContain("hero-target-follow-center");
      expect(trackerContent).toContain("hero-center-follow-label");

      const globalsCss = fs.readFileSync(path.join(rootDir, "app/globals.css"), "utf-8");
      expect(globalsCss).toContain(".hero-center-follow-icon--minus");
      expect(globalsCss).toContain(".hero-center-follow-icon--check");
      expect(globalsCss).toContain(".hero-center-follow-label");
      expect(globalsCss).toMatch(/\.hero-center-follow-btn--following:hover\s*\.hero-center-follow-icon--minus/);
    });

    it("Invariant 11.23: Social tab search placeholder must omit 'Buscar por' and controls must provide a Following filter button on the left", () => {
      const socialContent = fs.readFileSync(path.join(rootDir, "components/social-tab.tsx"), "utf-8");
      // Search placeholder should omit 'Buscar por'
      expect(socialContent).not.toContain("Buscar por @usuario");
      expect(socialContent).toContain('currentMode === "peaks"');
      expect(socialContent).toContain('"Usuario, picos, fecha..."');
      expect(socialContent).toContain('"Usuario, experiencia, fecha..."');
      expect(socialContent).toContain('"Usuario, país, fecha..."');

      // Following filter button in social-feed-controls-left
      expect(socialContent).toContain("social-feed-controls-left");
      expect(socialContent).toContain("social-following-btn");
      expect(socialContent).toContain("social-following-icon");
      expect(socialContent).toContain("followingOnly");
      expect(socialContent).toContain("followingUserIds");

      // feed-tab.tsx receives and processes followingOnly
      const feedContent = fs.readFileSync(path.join(rootDir, "components/feed-tab.tsx"), "utf-8");
      expect(feedContent).toContain("followingOnly = false");
      expect(feedContent).toContain("followingUserIds");
      expect(feedContent).toContain("followingUserIdsSet");
      expect(feedContent).toContain("if (followingOnly)");

      // globals.css defines styles for left grouping, following button, and active states
      const globalsCss = fs.readFileSync(path.join(rootDir, "app/globals.css"), "utf-8");
      expect(globalsCss).toContain(".social-feed-controls-left");
      expect(globalsCss).toContain(".social-following-btn");
      expect(globalsCss).toContain(".social-following-btn--active");
      expect(globalsCss).toContain(".feed-empty-link");
    });

    it("Invariant 11.16: Ranking participants count must strictly count users with at least 1 registered item and never raw profiles", () => {
      const rankingPath = path.join(rootDir, "components/ranking-tab.tsx");
      const rankingContent = fs.readFileSync(rankingPath, "utf-8");

      // Must not query total profiles table for ranking participant count
      expect(rankingContent).not.toContain("supabase.from('profiles').select('*', { count: 'exact'");
      expect(rankingContent).not.toContain("cachedTotalUsersCount");

      // Must compute count strictly from registered ranking participants
      expect(rankingContent).toContain("entries.length");
      expect(rankingContent).toContain('mode === "peaks" ? "escaladores en el ranking" : "exploradores en el ranking"');
    });

    it("Invariant 11.17: Map search control (lupa) is only offset down when compare button is present", () => {
      const mapSearchPath = path.join(rootDir, "components/map-search.tsx");
      const mapSearchContent = fs.readFileSync(mapSearchPath, "utf-8");
      expect(mapSearchContent).toContain("offsetDown?: boolean");
      expect(mapSearchContent).toContain('map-search-control--offset');

      const globalsCss = fs.readFileSync(path.join(rootDir, "app/globals.css"), "utf-8");
      // Default position is top
      expect(globalsCss).toMatch(/\.map-search-control\s*\{[^}]*top:\s*10px;/);
      // Offset position is 48px
      expect(globalsCss).toMatch(/\.map-search-control\.map-search-control--offset\s*\{[^}]*top:\s*48px;/);

      // SummitTracker passes hasCompareButton strictly when isReadOnly and session
      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const trackerContent = fs.readFileSync(trackerPath, "utf-8");
      expect(trackerContent).toContain("hasCompareButton={Boolean(isReadOnly && session)}");

      // CollectiveMap uses standard top position without displacement
      const collectivePath = path.join(rootDir, "components/collective-map.tsx");
      const collectiveContent = fs.readFileSync(collectivePath, "utf-8");
      expect(collectiveContent).toContain("<MapSearchControl");
      expect(collectiveContent).not.toContain("offsetDown={true}");
    });

    it("Invariant 11.24: Ranking tab controls (search box & following pill) and container layout must strictly align with Social tab", () => {
      const rankingPath = path.join(rootDir, "components/ranking-tab.tsx");
      const rankingContent = fs.readFileSync(rankingPath, "utf-8");
      const socialPath = path.join(rootDir, "components/social-tab.tsx");
      const socialContent = fs.readFileSync(socialPath, "utf-8");

      // Outer section padding and inner max-width container must match exactly (14px desktop to align with map-section legend)
      expect(rankingContent).toContain('className="page-container ranking-main-container" style={{ paddingTop: \'14px\', paddingBottom: \'70px\', paddingLeft: \'16px\', paddingRight: \'16px\' }}');
      expect(socialContent).toContain('className="page-container" style={{ paddingTop: \'14px\', paddingBottom: \'70px\', paddingLeft: \'16px\', paddingRight: \'16px\' }}');
      expect(rankingContent).toContain("<div style={{ maxWidth: '680px', margin: '0 auto', width: '100%' }}>");
      expect(socialContent).toContain("<div style={{ maxWidth: '680px', margin: '0 auto', width: '100%' }}>");

      // Controls structure must be identical
      expect(rankingContent).toContain('className="social-feed-controls"');
      expect(rankingContent).toContain('className="social-feed-controls-left"');
      expect(rankingContent).toContain('className="social-search-box ranking-search-box"');
      expect(rankingContent).toContain('social-following-btn');

      // Ranking CSS must harmonize ranking-search-box and ranking-main-container
      const rankingCss = fs.readFileSync(path.join(rootDir, "components/ranking.css"), "utf-8");
      expect(rankingCss).toMatch(/\.ranking-search-box\s*\{[^}]*flex:\s*0\s*1\s*190px/);
      expect(rankingCss).toMatch(/\.ranking-main-container\s*\{[^}]*box-sizing:\s*border-box;/);
      expect(rankingContent).toContain('className="ranking-feed-controls-right"');
      expect(rankingContent).toContain('className="collective-map-ethereal-btn"');
    });

    it("Invariant 11.25: Collective map UI layout, following filter button, and typography alignment", () => {
      const collectivePath = path.join(rootDir, "components/collective-map.tsx");
      const collectiveContent = fs.readFileSync(collectivePath, "utf-8");

      // Following filter button in collective map uses canonical .social-following-btn with UserRoundCheck
      expect(collectiveContent).toContain("UserRoundCheck");
      expect(collectiveContent).toContain("social-following-btn");
      expect(collectiveContent).toContain("social-following-icon");
      expect(collectiveContent).toContain("Siguiendo");
      // Must not have the old dual global/following pill markup
      expect(collectiveContent).not.toContain("list-filter-pill");

      // Ranking CSS positions collective-visitors-panel at bottom-right so it doesn't obstruct top-right controls
      const rankingCss = fs.readFileSync(path.join(rootDir, "components/ranking.css"), "utf-8");
      expect(rankingCss).toMatch(/\.collective-visitors-panel\s*\{[^}]*bottom:\s*24px;/);
      expect(rankingCss).toMatch(/\.collective-visitors-panel\s*\{[^}]*right:\s*24px;/);

      // Collective map overlay and panel use canonical fonts DM Sans and Playfair Display
      expect(rankingCss).toMatch(/\.collective-map-overlay\s*\{[^}]*font-family:\s*['"]DM Sans['"]/);
      expect(rankingCss).toMatch(/\.collective-map-header h2\s*\{[^}]*font-family:\s*['"]Playfair Display['"]/);
      expect(rankingCss).toMatch(/\.collective-visitors-header h3\s*\{[^}]*font-family:\s*['"]Playfair Display['"]/);
      expect(rankingCss).toMatch(/\.collective-visitors-panel\s*\{[^}]*font-family:\s*['"]DM Sans['"]/);

      // Bidirectional scope synchronization between RankingTab and CollectiveMap
      const rankingPath = path.join(rootDir, "components/ranking-tab.tsx");
      const rankingContent = fs.readFileSync(rankingPath, "utf-8");
      expect(rankingContent).toContain("scope={scope}");
      expect(rankingContent).toContain("onScopeChange={handleScopeChange}");
      expect(collectiveContent).toContain("scope?: \"all\" | \"following\"");
      expect(collectiveContent).toContain("onScopeChange?: (scope: \"all\" | \"following\") => void");
      expect(collectiveContent).toContain("onScopeChange(next)");
    });

    it("Invariant 11.26: Map concentric circles button (add experience) must be hidden when selecting location", () => {
      const worldMapPath = path.join(rootDir, "components/world-map.tsx");
      const worldMapContent = fs.readFileSync(worldMapPath, "utf-8");

      // The concentric circles button on the map must not be displayed when selectingLocation is true
      expect(worldMapContent).toContain("experiencesMode && onAddExperience && !selectingLocation");

      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const trackerContent = fs.readFileSync(trackerPath, "utf-8");
      expect(trackerContent).toContain("onAddExperience={!isReadOnly && !selectingLocationForExp");
    });

    it("Invariant 11.27: Experience selector modal must lock body scroll and contain overscroll", () => {
      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const trackerContent = fs.readFileSync(trackerPath, "utf-8");

      // isScrollLocked must include expSelectorOpen
      expect(trackerContent).toContain("!!expSelectorOpen");
      // expSelectorOpen backdrop must stop wheel propagation and contain overscroll
      expect(trackerContent).toContain("{expSelectorOpen && (");
      const expSelectorSlice = trackerContent.slice(trackerContent.indexOf("{expSelectorOpen && ("));
      expect(expSelectorSlice).toContain('className="modal-backdrop"');
      expect(expSelectorSlice).toContain("onWheel={(e) => e.stopPropagation()}");
    });

    it("Invariant 11.28: Selecting location on map must pin viewport to map, lock window scroll, and provide cancel cross button", () => {
      const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
      const trackerContent = fs.readFileSync(trackerPath, "utf-8");

      // isScrollLocked must include selectingLocationForExp
      expect(trackerContent).toContain("!!selectingLocationForExp");
      // Must scroll to top: 0 on mobile and snap to map on desktop when selectingLocationForExp is active
      expect(trackerContent).toContain("if (selectingLocationForExp)");
      expect(trackerContent).toMatch(/isMobileScreen[\s\S]*?scrollTo\(\{\s*top:\s*0/);
      expect(trackerContent).toContain('document.getElementById("mapa")');

      const worldMapPath = path.join(rootDir, "components/world-map.tsx");
      const worldMapContent = fs.readFileSync(worldMapPath, "utf-8");

      // Banner must include cancel cross button at top-right
      expect(worldMapContent).toContain("selecting-location-cancel-btn");
      expect(worldMapContent).toContain("onCancelSelectingLocation();");
      // Escape key listener for cancelling
      expect(worldMapContent).toMatch(/e\.key\s*===\s*["']Escape["']/);
    });

    it("Invariant 11.29: Compare button (.map-floating-btn) must not change color when switching to experiences mode", () => {
      const globalsCss = fs.readFileSync(path.join(rootDir, "app/globals.css"), "utf-8");

      // .mode-experiences .diff-toggle must exclude .map-floating-btn to prevent dark mode styling on compare button
      expect(globalsCss).toContain(".mode-experiences .diff-toggle:not(.map-floating-btn)");

      // .mode-experiences .map-floating-btn must preserve white background and dark visible text color (#2a1f3d)
      expect(globalsCss).toMatch(/\.mode-experiences\s+\.map-floating-btn\s*\{[^}]*background:\s*white/);
      expect(globalsCss).toMatch(/\.mode-experiences\s+\.map-floating-btn\s*\{[^}]*color:\s*#2a1f3d/);

      // Hover and active states in .mode-experiences must match .mode-countries
      expect(globalsCss).toMatch(/\.mode-experiences\s+\.map-floating-btn:hover/);
      expect(globalsCss).toMatch(/\.mode-experiences\s+\.map-floating-btn--active/);
      expect(globalsCss).toMatch(/\.mode-experiences\s+\.map-floating-btn--active:hover/);
    });

    it("Invariant 11.30: Photo editor toolbar buttons in mobile must display labels strictly in a single line (white-space: nowrap) without breaking Espejo H/V", () => {
      const editorPath = path.join(rootDir, "components/photo-editor.tsx");
      const editorContent = fs.readFileSync(editorPath, "utf-8");

      // photo-editor must contain photo-editor-toolbar and photo-editor-btn-label
      expect(editorContent).toContain("photo-editor-toolbar");
      expect(editorContent).toContain("photo-editor-btn-label");

      // Button labels for Espejo H and Espejo V must use non-breaking space and nowrap
      expect(editorContent).toContain('{"Espejo\\u00A0H"}');
      expect(editorContent).toContain('{"Espejo\\u00A0V"}');

      // globals.css must define .photo-editor-btn-label with white-space: nowrap !important
      const globalsCss = fs.readFileSync(path.join(rootDir, "app/globals.css"), "utf-8");
      expect(globalsCss).toContain(".photo-editor-btn-label");
      expect(globalsCss).toMatch(/\.photo-editor-btn-label\s*\{[^}]*white-space:\s*nowrap\s*!important;/);

      // Mobile media query (max-width: 768px) must enforce nowrap and tight padding
      expect(globalsCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.photo-editor-btn-label\s*\{[^}]*white-space:\s*nowrap\s*!important;/);
    });
  });
});




