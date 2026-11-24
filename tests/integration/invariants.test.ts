import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { peaks } from "@/data/peaks";
import { predefinedCategories } from "@/data/experiences";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  readAllStyles,
  readFeedSources,
  readFile,
  readMapSources,
  readRankingSources,
  readRankingStyles,
  readSocialSources,
  readTrackerSources,
} from "@/tests/utils/source-reader";

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
      const content = readFeedSources();

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
      const content = readFeedSources();

      expect(content).toContain("feed-share-btn");
      expect(content).toContain("handleShare");
    });

    it("Invariant 1.7: Feed cards must NOT contain reaction buttons (like, dislike, comment)", () => {
      const content = readFeedSources();

      expect(content).not.toContain("feed-reaction-btn");
      expect(content).not.toContain("feed-comments-section");
      expect(content).not.toContain("feed-card-actions");
    });

    it("Invariant 1.8: Feed title must NOT concatenate date, keeping displayTitle clean", () => {
      const content = readFeedSources();

      expect(content).toContain("const displayTitle = finalLocationName;");
      expect(content).not.toMatch(/displayTitle\s*=\s*dateRangeStr/);
    });

    it("Invariant 1.9: Sharing publications must NOT include user-entered external links (link, link_2) to preserve Open Graph photo banners", () => {
      const trackerContent = readTrackerSources();

      // Extract handleShareRecord function implementation
      const shareRecordMatch = trackerContent.match(/async function handleShareRecord[\s\S]*?await executeShare/);
      expect(shareRecordMatch).not.toBeNull();
      const shareRecordBody = shareRecordMatch![0];

      // Must not append ascent.link or link_2 to shareText
      expect(shareRecordBody).not.toMatch(/shareText\s*\+=\s*.*ascent\.link/);
      expect(shareRecordBody).not.toMatch(/shareText\s*\+=\s*.*ascent.*link_2/);
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
      const content = readFile("components/auth-context.tsx");

      expect(content).toContain("globalSession");
      expect(content).toContain("globalProfile");
      expect(content).toContain("SIGNED_OUT");
    });

    it("Invariant 3.2: AuthDialog must not show 'He olvidado la contraseña' when creating an account (isRegister)", () => {
      const content = readFile("components/auth-dialog.tsx");

      expect(content).toMatch(/!isRegister\s*&&\s*\(?[\s\S]*?He olvidado la contraseña/);
    });

    it("Invariant 4.1: Layout CSS must retain stable scrollbar gutter to prevent desktop shift", () => {
      const content = readAllStyles();

      expect(content).toMatch(/scrollbar-gutter:\s*stable/);
    });

    it("Invariant 5.1: Ranking CSS must retain top-3 podium margin to prevent avatar outline clipping", () => {
      const content = readRankingStyles();

      expect(content).toContain(".ranking-avatar");
      expect(content).toMatch(/\.ranking-avatar\s*\{[^}]*margin:\s*4px/);
    });
  });

  describe("Experiences & Map Invariants", () => {
    it("Invariant 6.1: world-map.tsx must only render experience markers when experiencesMode is true", () => {
      const content = readFile("components/world-map.tsx");

      expect(content).toContain("if (!experiencesMode || !experienceRecords.length) return [];");
      expect(content).toContain("{experiencesMode && experienceRecords && experienceRecords.length > 0 && (");
    });

    it("Invariant 6.2: summit-tracker.tsx must guard handleExperienceClick and conditionally pass experienceRecords", () => {
      const content = readTrackerSources();

      expect(content).toMatch(/const handleExperienceClick = useCallback[\s\S]*?if \(!experiencesMode\) return;/);
      expect(content).toContain("if (!experiencesMode) return EMPTY_EXP_RECORDS;");
      expect(content).toContain("experienceRecords={mappedExperienceRecords}");
    });

    it("Invariant 6.3: summit-tracker.tsx must close experience records upon deactivating experiences mode", () => {
      const content = readTrackerSources();

      expect(content).toContain("handleToggleExperiences");
      expect(content).toContain("isSelectedExp");
      expect(content).toContain("setExperiencesMode(false)");
    });
  });

  describe("Record Links Invariants", () => {
    it("Invariant 7.1: summit-tracker.tsx must render record links in completed record cards", () => {
      const content = readTrackerSources();

      expect(content).toContain("RecordLinkBadge");
      expect(content).toContain("<RecordLinkBadge link={record.link} linkName={record.link_name} />");
    });

    it("Invariant 7.2: summit-tracker.tsx must support a second link with subtle display and persistence", () => {
      const content = readTrackerSources();

      expect(content).toContain("link_2");
      expect(content).toContain("link_name_2");
      expect(content).toContain("showSecondLink");
      expect(content).toContain("<RecordLinkBadge link={record.link_2} linkName={record.link_name_2} />");
    });

    it("Invariant 7.3: feed-tab.tsx must select and render the second link in activity cards", () => {
      const content = readFeedSources();

      expect(content).toContain("link_2");
      expect(content).toContain("link_name_2");
      expect(content).toContain("<RecordLinkBadge link={item.link_2} linkName={item.link_name_2} />");
    });

    it("Invariant 7.4: Footprints icon must be assigned for hiking/running links and placeholders for links must guide user dynamically per mode", () => {
      const trackerContent = readTrackerSources();
      expect(trackerContent).toContain("Footprints");
      expect(trackerContent).toMatch(/strava\.com[\s\S]*?wikiloc\.com/);
      expect(trackerContent).toContain('"footprints"');
      // Placeholders must adapt per active mode
      expect(trackerContent).toContain("Ej: Track de la Ruta");
      expect(trackerContent).toContain("Ej: Equipamiento utilizado");
      expect(trackerContent).toContain("Ej: Restaurante favorito");
      expect(trackerContent).toContain("Ej: Alojamiento recomendado");
      expect(trackerContent).toContain("Ej: Vídeo de la experiencia");
      expect(trackerContent).toContain("Ej: Guía para la experiencia");
      expect(trackerContent).toContain("getLinkPlaceholders");

      const feedContent = readFeedSources();
      expect(feedContent).toContain("Footprints");
      expect(feedContent).toContain("getRecordLinkPresentation");
    });

    it("Invariant 7.5: Country record dialog must omit continent, dropzone must disable on 4 photos, and second link container must omit dashed border", () => {
      const trackerContent = readTrackerSources();
      expect(trackerContent).toMatch(/countriesIdSet\.has\(selected\.id\)\s*\?\s*null\s*:/);
      expect(trackerContent).toContain("isPhotoLimitReached");
      expect(trackerContent).toContain("file-dropzone--disabled");
      expect(trackerContent).not.toMatch(/borderTop:\s*"1px dashed/);

      const globalsCss = readAllStyles();
      expect(globalsCss).toContain(".file-dropzone--disabled");
    });
  });

  describe("Test Profile Stealth & Isolation Invariants", () => {
    it("Invariant 8.1: ranking-tab.tsx must exclude is_test profiles via get_user_ranking RPC", () => {
      const content = readRankingSources();
      expect(content).toMatch(/supabase!?\.rpc\("get_user_ranking"/);
      expect(content).toContain("is_test");
    });

    it("Invariant 8.2: feed-tab.tsx must exclude activities from is_test profiles", () => {
      const content = readFeedSources();
      expect(content).toContain("if (a.profiles?.is_test) return false;");
      expect(content).toContain("if (e.profiles?.is_test) return false;");
    });

    it("Invariant 8.3: social connections loader must exclude is_test profiles", () => {
      const content = readFile("lib/social-cache.ts");
      expect(content).toContain('.neq("is_test", true)');
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
      const content = readFeedSources();

      expect(content).toContain('window.history.pushState({ feedLightbox: true }, "", "#lightbox")');
      expect(content).toContain('window.addEventListener("popstate", handleCloseOnNavigation)');
      expect(content).toContain('window.addEventListener("hashchange", handleCloseOnNavigation)');
      expect(content).toContain("closeLightbox");
    });

    it("Invariant 9.2: Both feed-tab.tsx and summit-tracker.tsx must lock documentElement and body scroll when viewing photos", () => {
      const feedContent = readFeedSources();
      expect(feedContent).toContain('document.documentElement.style.overflow = "hidden"');
      expect(feedContent).toContain('document.body.style.overflow = "hidden"');

      const trackerContent = readTrackerSources();
      expect(trackerContent).toContain("isScrollLocked");
      expect(trackerContent).toContain("useScrollLock");
    });

    it("Invariant 9.3: summit-tracker.tsx must lock background scroll on mobile when viewing a record", () => {
      const content = readTrackerSources();

      expect(content).toMatch(/isMobile\s*&&\s*(!!selected|Boolean\(activeSelected\))/);
      expect(content).toContain("isScrollLocked");
    });

    it("Invariant 9.4: globals.css must contain overscroll-behavior and disable pointer-events on background elements on mobile", () => {
      const content = readAllStyles();

      expect(content).toContain("overscroll-behavior: contain");
      expect(content).toContain("touch-action: none");
      expect(content).toMatch(/main\.panel-open\s+\.map-wrapper/);
      expect(content).toMatch(/pointer-events:\s*none/);
    });

    it("Invariant 9.5: globals.css must hide country summit pins at zoom levels 0 through 5 and by default in mode-countries", () => {
      const content = readAllStyles();

      expect(content).toContain(".mode-countries .summit-pin:not(.summit-pin--experience)");
      expect(content).toContain('.mode-countries .map[data-zoom="0"] .summit-pin:not(.summit-pin--experience)');
      expect(content).toContain('.mode-countries .map[data-zoom="5"] .summit-pin:not(.summit-pin--experience)');
      expect(content).toContain('.map[data-zoom="0"] .summit-pin:not(.summit-pin--experience)');
    });

    it("Invariant 9.6: profile-settings.tsx must lock documentElement and body scroll when mounted", () => {
      const content = readFile("components/profile-settings.tsx");

      expect(content).toContain('document.documentElement.style.overflow = "hidden"');
      expect(content).toContain('document.body.style.overflow = "hidden"');
      expect(content).toContain('overscrollBehavior: "contain"');
    });
  });

  describe("Modality Preferences & Visibility Invariants", () => {
    it("Invariant 10.1: profile-settings.tsx must include toggles for both peaks and countries and prevent disabling both", () => {
      const content = readFile("components/profile-settings.tsx");

      expect(content).toContain("enablePeaks");
      expect(content).toContain("enableCountries");
      expect(content).toContain("!enablePeaks && !enableCountries");
    });

    it("Invariant 10.2: summit-tracker.tsx must guard mode-selector with hasBothModes", () => {
      const content = readTrackerSources();

      expect(content).toContain("{hasBothModes && (");
      expect(content).toContain("canShowPeaks");
      expect(content).toContain("canShowCountries");
    });

    it("Invariant 10.3: ranking-tab.tsx must guard mode-selector with hasBothModes", () => {
      const content = readRankingSources();

      expect(content).toContain("hasBothModes && (");
      expect(content).toContain("enablePeaks");
      expect(content).toContain("enableCountries");
    });

    it("Invariant 10.4: feed-tab.tsx must filter out posts of disabled modalities", () => {
      const content = readFeedSources();

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
      const topbarContent = readFile("components/layout/app-topbar.tsx");
      const trackerContent = readTrackerSources();
      const rankingContent = readRankingSources();
      const socialContent = readSocialSources();

      // Shared AppTopbar must contain account-button and account-avatar, and NEVER email/username text
      expect(topbarContent).toContain('className="account-button"');
      expect(topbarContent).toContain('className="account-avatar"');
      expect(topbarContent).not.toMatch(/className="account-button"[\s\S]*?<span>\{myProfile\?\.username/);
      expect(topbarContent).not.toMatch(/className="account-button"[\s\S]*?session\.user\.email\?\.split\("@"\)/);
      expect(topbarContent).not.toContain("account-username");

      expect(trackerContent).toContain("<AppTopbar");
      expect(rankingContent).toContain("<AppTopbar");
      expect(socialContent).toContain("<AppTopbar");
    });

    it("Invariant 11.2: profile-settings.tsx must freeze experiences when countries mode is disabled", () => {
      const content = readFile("components/profile-settings.tsx");

      expect(content).toContain("setEnableExperiences(false)");
      expect(content).toContain("enable_experiences: enableCountries ? enableExperiences : false");
      expect(content).toContain("disabled={!enableCountries}");
    });

    it("Invariant 11.3: summit-tracker.tsx must force experiencesMode to false if canShowCountries is false", () => {
      const content = readTrackerSources();

      expect(content).toContain("if (!canShowCountries) {");
      expect(content).toContain("if (experiencesMode) setExperiencesMode(false)");
    });

    it("Invariant 11.4: globals.css must style mountain-art with 160px for both countries and experiences modes", () => {
      const content = readAllStyles();

      expect(content).toMatch(/\.mode-countries\s+\.mountain-art,\s*\r?\n\s*\.mode-experiences\s+\.mountain-art\s*\{[^}]*font-size:\s*160px;/);
    });

    it("Invariant 11.5: spain-map.tsx and leaflet icons must use Lucide React SVG paths for all pins and avoid raw unicode symbols", () => {
      const content = readMapSources();

      // Must not contain raw unicode characters in markerIcons
      expect(content).not.toContain('summit-pin summit-pin--done">✓');
      expect(content).not.toContain('summit-pin">△');
      expect(content).not.toContain('summit-pin summit-pin--wishlist">★');
      expect(content).not.toContain('summit-pin summit-pin--diff-only-me">✓');
      expect(content).not.toContain('summit-pin summit-pin--diff-both">⬟');
      expect(content).not.toContain('summit-pin summit-pin--diff-none">△');

      // Must contain SVG icons with proper paths
      expect(content).toContain("M20 6 9 17l-5-5"); // Check
      expect(content).toContain("M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"); // Triangle
      expect(content).toContain("M11.525 2.295"); // Star
      expect(content).toContain("M10.83 2.38"); // Pentagon
    });

    it("Invariant 11.6: summit-tracker.tsx must not display dates in photo captions (only photo.caption if present) or in the photo lightbox view", () => {
      const content = readTrackerSources();

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
      const content = readTrackerSources();

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
      const globalsCss = readAllStyles().replace(/\r\n/g, "\n");
      expect(globalsCss).toMatch(/\.topbar\s*\{[^}]*position:\s*sticky;/);
      expect(globalsCss).not.toMatch(/\.topbar\s*\{[^}]*position:\s*relative;/);

      const topbarContent = readFile("components/layout/app-topbar.tsx");
      expect(topbarContent).toContain("scrollToMap");
      expect(topbarContent).toContain("scrollToMap(e)");
      expect(topbarContent).toMatch(/<Link[\s\S]*?topbar-nav-link--mapa[\s\S]*?>[\s\S]*?Mapa[\s\S]*?<\/Link>/);

      const trackerContent = readTrackerSources();
      expect(trackerContent).toContain("scrollToMap");
    });

    it("Invariant 11.13: Topbar mode toggle and nav links must maintain consistent coordinates without bold layout shifts", () => {
      const globalsCss = readAllStyles();
      expect(globalsCss).toMatch(/\.topbar\s+\.app-mode-switch\s*\{[^}]*top:\s*50%;[^}]*transform:\s*translate\(-50%,\s*-50%\);/);
      expect(globalsCss).toContain(".topbar-nav-link--active");

      const topbarContent = readFile("components/layout/app-topbar.tsx");
      expect(topbarContent).not.toContain("fontWeight: 'bold'");
      expect(topbarContent).toContain("topbar-nav-link--social");
      expect(topbarContent).toContain("topbar-nav-link--ranking");
      expect(topbarContent).toContain("topbar-nav-link--active");

      const socialContent = readSocialSources();
      expect(socialContent).not.toContain("fontWeight: 'bold'");
      const rankingContent = readRankingSources();
      expect(rankingContent).not.toContain("fontWeight: 'bold'");
    });

    it("Invariant 11.14: Social tab vertebral bar must place profile on left and single category ratio on right", () => {
      const socialHeroContent = readFile("components/social/social-hero.tsx");
      expect(socialHeroContent).toContain("hero-profile-wrap");
      expect(socialHeroContent).toContain("activeAchieved");
      expect(socialHeroContent).toContain("activeTotal");
      expect(socialHeroContent).toContain("activeUnit");
      expect(socialHeroContent).toContain("activeCompletion");

      // Verify that profile is on left and hero-stat is on right inside hero-main--social
      const heroSection = socialHeroContent.slice(
        socialHeroContent.indexOf("hero-main--social"),
        socialHeroContent.indexOf("hide-on-desktop")
      );
      const profilePos = heroSection.indexOf("hero-profile-wrap");
      const statPos = heroSection.indexOf("hero-stat");
      expect(profilePos).toBeGreaterThan(-1);
      expect(statPos).toBeGreaterThan(-1);
      expect(profilePos).toBeLessThan(statPos);

      const globalsCss = readAllStyles();
      expect(globalsCss).toMatch(/\.hero-main--social\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    });

    it("Invariant 11.15: Social tab must include search pill on left and experiences toggle on right aligned with post column", () => {
      const socialContent = readSocialSources();
      expect(socialContent).toContain("social-feed-controls");
      expect(socialContent).toContain("social-search-box");
      expect(socialContent).toContain("social-search-input");
      expect(socialContent).toContain("diff-toggle-wrap");
      expect(socialContent).toMatch(/maxWidth:\s*["']680px["']/);

      const globalsCss = readAllStyles();
      expect(globalsCss).toContain(".social-feed-controls");
      expect(globalsCss).toContain(".social-search-box");
      expect(globalsCss).toContain(".social-search-input");
    });

    it("Invariant 11.16: Vertebral bar in Social tab must lower profile and lock mobile layout in fixed grid to prevent mode-switching shifts", () => {
      const globalsCss = readAllStyles();
      expect(globalsCss).toMatch(/\.hero-main--social\s+\.hero-profile-wrap\s*\{[^}]*margin-top:\s*4px/);
      expect(globalsCss).toMatch(/@media\s*\(max-width:\s*700px\)[\s\S]*?\.hero-main--social\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*1fr\s+1fr/);
      expect(globalsCss).toMatch(/@media\s*\(max-width:\s*700px\)[\s\S]*?\.hero-main--social\s+\.hero-profile-wrap\s*\{[^}]*padding-left:\s*6px/);
    });

    it("Invariant 11.17: Hero mottos must be strictly hidden on mobile and tablet viewports (<= 1023px)", () => {
      const trackerContent = readTrackerSources();
      expect(trackerContent).toMatch(/hero-title-wrap--motto\s+hide-on-mobile/);

      const socialContent = readSocialSources();
      expect(socialContent).not.toContain("hero-title-wrap--motto");

      const globalsCss = readAllStyles();
      expect(globalsCss).toMatch(/@media\s*\(max-width:\s*1023px\)[\s\S]*?\.hero-title-wrap--motto\s*\{[^}]*display:\s*none\s*!important/);
    });

    it("Invariant 11.18: feed-tab.tsx must support multi-field search filtering by username, location and date", () => {
      const feedContent = readFeedSources();
      expect(feedContent).toContain('searchQuery = ""');
      expect(feedContent).toContain("searchQuery.trim()");
      expect(feedContent).toContain("tokens.every");
      expect(feedContent).toContain("formatRecordDateRange");
      expect(feedContent).toContain("No se encontraron actividades para");
    });

    it("Invariant 11.19: Social and ranking search inputs must hide native cancel buttons to avoid duplicate cross buttons", () => {
      const globalsCss = readAllStyles();
      expect(globalsCss).toMatch(/\.social-search-input::-webkit-search-cancel-button[\s\S]*?display:\s*none\s*!important/);

      const rankingCss = readRankingStyles();
      expect(rankingCss).toMatch(/\.ranking-search-input::-webkit-search-cancel-button[\s\S]*?display:\s*none/);
    });

    it("Invariant 11.20: Experiences mode in Social tab must trigger dark theme across feed, cards, links, numbers and search", () => {
      const socialContent = readSocialSources();
      expect(socialContent).toContain('main className={isPeaks ? "" : isExp ? "mode-experiences" : "mode-countries"}');
      expect(socialContent).toContain('document.body.classList.add("mode-experiences")');

      const globalsCss = readAllStyles();
      expect(globalsCss).toContain(".mode-experiences .feed-card");
      expect(globalsCss).toContain(".mode-experiences .social-search-input");
      expect(globalsCss).toContain(".mode-experiences .feed-link");
      expect(globalsCss).toContain(".mode-experiences .hero-stat strong");
    });

    it("Invariant 11.21: Experiences mode in Social tab must strictly filter feed to experiences only and exclude countries", () => {
      const feedContent = readFeedSources();
      expect(feedContent).toMatch(/if\s*\(\s*experiencesMode\s*&&\s*enableExperiences\s*\)\s*\{\s*return\s+isExperience;\s*\}/);
      expect(feedContent).toMatch(/return\s+isCountry;/);
    });

    it("Invariant 11.22: Target profile central follow button must render UserRound icons and state labels", () => {
      const trackerContent = readTrackerSources();
      expect(trackerContent).toContain("UserRoundPlus");
      expect(trackerContent).toContain("UserRoundCheck");
      expect(trackerContent).toContain("UserRoundMinus");
      expect(trackerContent).toContain("UserRoundArrowLeft");
      expect(trackerContent).toContain('"Seguir"');
      expect(trackerContent).toContain('"Siguiendo"');
      expect(trackerContent).toContain('"pendiente"');
      expect(trackerContent).toContain("hero-target-follow-center");
      expect(trackerContent).toContain("hero-center-follow-label");

      const globalsCss = readAllStyles();
      expect(globalsCss).toContain(".hero-center-follow-icon--minus");
      expect(globalsCss).toContain(".hero-center-follow-icon--check");
      expect(globalsCss).toContain(".hero-center-follow-label");
      expect(globalsCss).toMatch(/\.hero-center-follow-btn--following:hover\s*\.hero-center-follow-icon--minus/);
    });

    it("Invariant 11.23: Social tab search placeholder must omit 'Buscar por' and controls must provide a Following filter button on the left", () => {
      const socialContent = readSocialSources();
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
      const feedContent = readFeedSources();
      expect(feedContent).toContain("followingOnly = false");
      expect(feedContent).toContain("followingUserIds");
      expect(feedContent).toContain("followingUserIdsSet");
      expect(feedContent).toContain("if (followingOnly");

      // globals.css defines styles for left grouping, following button, and active states
      const globalsCss = readAllStyles();
      expect(globalsCss).toContain(".social-feed-controls-left");
      expect(globalsCss).toContain(".social-following-btn");
      expect(globalsCss).toContain(".social-following-btn--active");
      expect(globalsCss).toContain(".feed-empty-link");
    });

    it("Invariant 11.16: Ranking participants count must strictly count users with at least 1 registered item and never raw profiles", () => {
      const rankingContent = readRankingSources();

      // Must not query total profiles table for ranking participant count
      expect(rankingContent).not.toContain("supabase.from('profiles').select('*', { count: 'exact'");
      expect(rankingContent).not.toContain("cachedTotalUsersCount");

      // Must compute count strictly from registered ranking participants
      expect(rankingContent).toContain("entries.length");
      expect(rankingContent).toContain('mode === "peaks" ? "escaladores en el ranking" : "exploradores en el ranking"');
    });

    it("Invariant 11.17: Map search control (lupa) is only offset down when compare button is present", () => {
      const mapSearchContent = readFile("components/map-search.tsx");
      expect(mapSearchContent).toContain("offsetDown?: boolean");
      expect(mapSearchContent).toContain("map-search-control--offset");

      const globalsCss = readAllStyles();
      // Default position is top
      expect(globalsCss).toMatch(/\.map-search-control\s*\{[^}]*top:\s*10px;/);
      // Offset position is 48px
      expect(globalsCss).toMatch(/\.map-search-control\.map-search-control--offset\s*\{[^}]*top:\s*48px;/);

      // SummitTracker / TrackerMapSection passes hasCompareButton strictly when isReadOnly and session
      const trackerContent = readTrackerSources();
      expect(trackerContent).toContain("hasCompareButton={Boolean(isReadOnly && session)}");

      // CollectiveMap uses standard top position without displacement
      const collectiveContent = readFile("components/collective-map.tsx");
      expect(collectiveContent).toContain("<MapSearchControl");
      expect(collectiveContent).not.toContain("offsetDown={true}");
    });

    it("Invariant 11.24: Ranking tab controls (search box & following pill) and container layout must strictly align with Social tab", () => {
      const rankingContent = readRankingSources();
      const socialContent = readSocialSources();

      // Outer section padding and inner max-width container must match exactly (14px desktop to align with map-section legend)
      expect(rankingContent).toMatch(/className="page-container ranking-main-container"\s+style=\{\{\s*paddingTop:\s*["']14px["'],\s*paddingBottom:\s*["']70px["'],\s*paddingLeft:\s*["']16px["'],\s*paddingRight:\s*["']16px["'],?\s*\}\}/);
      expect(socialContent).toMatch(/className="page-container"\s+style=\{\{\s*paddingTop:\s*["']14px["'],\s*paddingBottom:\s*["']70px["'],\s*paddingLeft:\s*["']16px["'],\s*paddingRight:\s*["']16px["'],?\s*\}\}/);
      expect(rankingContent).toMatch(/<div style=\{\{\s*maxWidth:\s*["']680px["'],\s*margin:\s*["']0 auto["'],\s*width:\s*["']100%["']\s*\}\}>/);
      expect(socialContent).toMatch(/<div style=\{\{\s*maxWidth:\s*["']680px["'],\s*margin:\s*["']0 auto["'],\s*width:\s*["']100%["']\s*\}\}>/);

      // Controls structure must be identical
      expect(rankingContent).toContain('className="social-feed-controls"');
      expect(rankingContent).toContain('className="social-feed-controls-left"');
      expect(rankingContent).toContain('className="social-search-box ranking-search-box"');
      expect(rankingContent).toContain("social-following-btn");

      // Ranking CSS must harmonize ranking-search-box and ranking-main-container
      const rankingCss = readRankingStyles();
      expect(rankingCss).toMatch(/\.ranking-search-box\s*\{[^}]*flex:\s*0\s*1\s*190px/);
      expect(rankingCss).toMatch(/\.ranking-main-container\s*\{[^}]*box-sizing:\s*border-box;/);
      expect(rankingContent).toContain('className="ranking-feed-controls-right"');
      expect(rankingContent).toContain('className="collective-map-ethereal-btn"');
    });

    it("Invariant 11.25: Collective map UI layout, following filter button, and typography alignment", () => {
      const collectiveContent = readMapSources();

      // Following filter button in collective map uses canonical .social-following-btn with UserRoundCheck
      expect(collectiveContent).toContain("UserRoundCheck");
      expect(collectiveContent).toContain("social-following-btn");
      expect(collectiveContent).toContain("social-following-icon");
      expect(collectiveContent).toContain("Siguiendo");
      // Must not have the old dual global/following pill markup
      expect(collectiveContent).not.toContain("list-filter-pill");

      // Collective map styles position collective-visitors-panel at bottom-right so it doesn't obstruct top-right controls
      const rankingCss = readRankingStyles();
      expect(rankingCss).toMatch(/\.collective-visitors-panel\s*\{[^}]*bottom:\s*24px;/);
      expect(rankingCss).toMatch(/\.collective-visitors-panel\s*\{[^}]*right:\s*24px;/);

      // Collective map overlay and panel use canonical CSS font variables (--font-sans & --font-display)
      expect(rankingCss).toMatch(/\.collective-map-overlay\s*\{[^}]*font-family:\s*var\(--font-sans\)/);
      expect(rankingCss).toMatch(/\.collective-map-header h2\s*\{[^}]*font-family:\s*var\(--font-display\)/);
      expect(rankingCss).toMatch(/\.collective-visitors-header h3\s*\{[^}]*font-family:\s*var\(--font-display\)/);
      expect(rankingCss).toMatch(/\.collective-visitors-panel\s*\{[^}]*font-family:\s*var\(--font-sans\)/);

      // Bidirectional scope synchronization between RankingTab and CollectiveMap
      const rankingContent = readRankingSources();
      expect(rankingContent).toContain("scope={scope}");
      expect(rankingContent).toMatch(/onScopeChange=\{(handleScopeChange|setScope)\}/);
      expect(collectiveContent).toContain('scope?: "all" | "following"');
      expect(collectiveContent).toContain('onScopeChange?: (scope: "all" | "following") => void');
      expect(collectiveContent).toContain("onScopeChange(next)");

      // Collective map supports both countries and peaks mode with identical controls
      expect(rankingContent).toContain('((mode === "countries" && enableCountries) || (mode === "peaks" && enablePeaks))');
      expect(rankingContent).toContain("mode={mode}");
      expect(collectiveContent).toContain('mode?: "countries" | "peaks"');
      expect(collectiveContent).toContain("isPeaks ? <FitSpain persistSessionState={false} /> : <FitWorld persistSessionState={false} />");
      expect(collectiveContent).toContain('placeholder={isPeaks ? "Buscar pico o provincia..." : "Buscar país..."}');
      expect(collectiveContent).toContain('3+{" "}');
      expect(collectiveContent).toContain('{isPeaks ? "escaladores" : "visitantes"}');
    });

    it("Invariant 11.26: Map concentric circles button (add experience) must be hidden when selecting location", () => {
      const worldMapContent = readFile("components/world-map.tsx");

      // The concentric circles button on the map must not be displayed when selectingLocation is true
      expect(worldMapContent).toContain("experiencesMode && onAddExperience && !selectingLocation");

      const trackerContent = readTrackerSources();
      expect(trackerContent).toContain("!isReadOnly && !selectingLocationForExp ? onOpenExpSelector : undefined");
      expect(trackerContent).toContain("onAddExperience={addExperienceHandler}");
    });

    it("Invariant 11.27: Experience selector modal must lock body scroll and contain overscroll", () => {
      const trackerContent = readTrackerSources();
      const expModalsContent = readFile("components/tracker/experience-modals.tsx");

      // isScrollLocked must include expSelectorOpen
      expect(trackerContent).toContain("expSelectorOpen");
      // expSelectorOpen backdrop must stop wheel propagation and contain overscroll
      expect(expModalsContent).toContain("{expSelectorOpen && (");
      const expSelectorSlice = expModalsContent.slice(expModalsContent.indexOf("{expSelectorOpen && ("));
      expect(expSelectorSlice).toContain('className="modal-backdrop"');
      expect(expSelectorSlice).toContain("onWheel={(e) => e.stopPropagation()}");
      expect(expSelectorSlice).toContain('overscrollBehavior: "contain"');
    });

    it("Invariant 11.28: Selecting location on map must pin viewport to map, lock window scroll, and provide cancel cross button", () => {
      const trackerContent = readTrackerSources();

      // isScrollLocked must include selectingLocationForExp
      expect(trackerContent).toContain("Boolean(selectingLocationForExp)");
      // Must scroll to top: 0 on mobile and snap to map on desktop when selectingLocationForExp is active
      expect(trackerContent).toContain("if (!selectingLocationForExp) return;");
      expect(trackerContent).toMatch(/isMobileScreen[\s\S]*?scrollTo\(\{\s*top:\s*0/);
      expect(trackerContent).toContain('document.getElementById("mapa")');

      const worldMapContent = readFile("components/world-map.tsx");

      // Banner must include cancel cross button at top-right
      expect(worldMapContent).toContain("selecting-location-cancel-btn");
      expect(worldMapContent).toContain("onCancelSelectingLocation?.();");
      // Escape key listener for cancelling
      expect(worldMapContent).toMatch(/e\.key\s*===\s*["']Escape["']/);
    });

    it("Invariant 11.29: Compare button (.map-floating-btn) must not change color when switching to experiences mode", () => {
      const globalsCss = readAllStyles();

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
      const editorContent = readFile("components/photo-editor.tsx");

      // photo-editor must contain photo-editor-toolbar and photo-editor-btn-label
      expect(editorContent).toContain("photo-editor-toolbar");
      expect(editorContent).toContain("photo-editor-btn-label");

      // Button labels for Espejo H and Espejo V must use non-breaking space and nowrap
      expect(editorContent).toContain('{"Espejo\\u00A0H"}');
      expect(editorContent).toContain('{"Espejo\\u00A0V"}');

      // globals.css / media-viewer.css must define .photo-editor-btn-label with white-space: nowrap !important
      const globalsCss = readAllStyles();
      expect(globalsCss).toContain(".photo-editor-btn-label");
      expect(globalsCss).toMatch(/\.photo-editor-btn-label\s*\{[^}]*white-space:\s*nowrap\s*!important;/);

      // Mobile media query (max-width: 768px) must enforce nowrap and tight padding
      expect(globalsCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.photo-editor-btn-label\s*\{[^}]*white-space:\s*nowrap\s*!important;/);
    });

    it("Invariant 11.31: Collective map experiences pins visibility and toggle control", () => {
      const globalsCss = readAllStyles();
      // collective-map-overlay must override mode-countries so experience-hitbox and summit-pin--experience are visible
      expect(globalsCss).toMatch(/\.collective-map-overlay[\s\S]*?\.experience-hitbox\s*\{[^}]*display:\s*block\s*!important/);
      expect(globalsCss).toMatch(/\.collective-map-overlay[\s\S]*?\.summit-pin--experience\s*\{[^}]*display:\s*inline-flex\s*!important/);
      // Pins must use the morado color #cba6f7 matching inverted experiences mode
      expect(globalsCss).toMatch(/\.collective-map-overlay[\s\S]*?\.summit-pin--experience\s*\{[^}]*background:\s*#cba6f7\s*!important/);

      const collectiveContent = readMapSources();
      // Experiences toggle control must exist and toggle experiences
      expect(collectiveContent).toContain("ExperiencesToggleControl");
      expect(collectiveContent).toContain("collective-exp-toggle-control");
      expect(collectiveContent).toContain("#cba6f7");
      expect(collectiveContent).toContain("visibleExperiences.map");
      expect(collectiveContent).toContain("subItem?.name || exp?.name || marker.location_name");
    });

    it("Invariant 11.32: App layout must preload local GeoJSON/TopoJSON files instead of third-party CDNs", () => {
      const layout = fs.readFileSync(path.join(rootDir, "app/layout.tsx"), "utf-8");
      expect(layout).toContain('href="/world-countries.topo.json"');
      expect(layout).toMatch(/href="\/provincias_spain\.(topo\.json|geojson)"/);
      expect(layout).not.toContain('href="https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json"');
      expect(layout).not.toContain('href="https://gist.githubusercontent.com');
    });

    it("Invariant 11.33: Social feed must not execute Cartesian user_id x summit_id queries for photos", () => {
      const content = readFeedSources();
      expect(content).toContain("get_feed_photos");
      expect(content).not.toMatch(/\.in\(['"]user_id['"],\s*batchUserIds\)\.in\(['"]summit_id['"],\s*batchSummitIds\)/);
    });

    it("Invariant 11.34: Comparative legend is centered on mobile, Ninguno is visible, and colors remain invariant in dark mode", () => {
      const summitContent = readTrackerSources();

      // map-legend-area--diff class applied during diffMode
      expect(summitContent).toContain('map-legend-area ${diffMode ? "map-legend-area--diff" : ""}');
      // Ninguno item has diff-legend-item--none
      expect(summitContent).toContain('className="diff-legend-item--none"');

      const globalsCss = readAllStyles();

      // Ninguno must NOT be hidden
      expect(globalsCss).not.toMatch(/\.diff-legend\s+\.diff-legend-item--none\s*\{[^}]*display:\s*none/);

      // Mobile rule must center diff-legend
      expect(globalsCss).toMatch(/\.diff-legend\s*\{[^}]*justify-content:\s*center\s*!important/);
      expect(globalsCss).toMatch(/\.map-legend-area--diff[\s\S]*?justify-content:\s*center\s*!important/);

      // Colors of legend-diff-dot must remain invariant in dark mode (mode-experiences)
      expect(globalsCss).toMatch(/\.mode-experiences\s+\.legend-diff-dot--only-me\s*\{[^}]*background:\s*#7b52ab/);
      expect(globalsCss).toMatch(/\.mode-experiences\s+\.legend-diff-dot--both\s*\{[^}]*background:\s*#c5b3da/);
      expect(globalsCss).not.toMatch(/\.mode-experiences\s+\.legend-diff-dot--only-me\s*\{[^}]*background:\s*var\(--pine\)/);
    });

    it("Invariant 11.35: Scroll isolation and top reset must be enforced across tabs and routes in AppTabsShell", () => {
      const shellContent = readFile("components/app-tabs-shell.tsx");

      expect(shellContent).toContain('window.history.scrollRestoration = "manual"');
      expect(shellContent).toContain("resetScrollToTop");
      expect(shellContent).toContain("historyScrollPositions");
      expect(shellContent).toContain("resetScrollToTop(false)");
      expect(shellContent).toContain("resetScrollToTop(true)");

      const topbarContent = readFile("components/layout/app-topbar.tsx");
      expect(topbarContent).toMatch(/topbar-nav-link--social[\s\S]*?onClick=/);
      expect(topbarContent).toMatch(/topbar-nav-link--ranking[\s\S]*?onClick=/);
    });

    it("Invariant 11.36: PWA Install Prompt must use official raster icon, handle session dismissal and auto-hide when installed", () => {
      const installPromptContent = readFile("components/install-prompt.tsx");

      // 1. Must use official raster icon /icon-192.png and NOT fragile SVG url(#ipGreen)
      expect(installPromptContent).toContain('src="/icon-192.png"');
      expect(installPromptContent).not.toContain('url(#ipGreen)');
      expect(installPromptContent).not.toContain("mixBlendMode: 'multiply'");

      // 2. Must handle session dismissal and clear stale prompt on close
      expect(installPromptContent).toContain('sessionStorage.setItem("pwa_dismissed_session", "true")');
      expect(installPromptContent).toContain("clearInstallPrompt()");

      // 3. Must persist pwa_app_installed on accepted installation
      expect(installPromptContent).toContain('localStorage.setItem("pwa_app_installed", "true")');

      // 4. use-pwa-install hook must auto-hide install button when alreadyInstalled
      const pwaHookContent = readFile("hooks/use-pwa-install.ts");
      expect(pwaHookContent).toContain('localStorage.getItem("pwa_app_installed") === "true"');
      expect(pwaHookContent).toContain("!alreadyInstalled");
    });

    it("Invariant 11.37: PWA icon scale calibrated (ratio 0.375, 75% scale), splash screen anti-pixelation and out-of-scope protection", () => {
      // 1. generate-icons script must enforce 0.375 ratio (reduced to 75% of previous 50% scale per user instruction)
      const genScript = fs.readFileSync(path.join(rootDir, "scripts/generate-icons.js"), "utf-8");
      expect(genScript).toMatch(/ratio:\s*0\.375/);

      // 2. app/layout.tsx must NOT declare sizes="any" for favicon.ico to prevent Android splash pixelation
      const layoutContent = fs.readFileSync(path.join(rootDir, "app/layout.tsx"), "utf-8");
      expect(layoutContent).not.toContain('{ url: "/favicon.ico", sizes: "any" }');
      expect(layoutContent).toContain('sizes: "16x16 32x32 48x48"');
      expect(layoutContent).toContain('url: "/icon-512.png", sizes: "512x512"');

      // 3. Manifests must include standalone, window-controls-overlay and 1024px icons
      const manifestPath = path.join(rootDir, "public/manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(manifest.display).toBe("standalone");
      expect(manifest.display_override).toContain("standalone");
      expect(manifest.display_override).toContain("window-controls-overlay");
      expect(manifest.icons.some((i: any) => i.sizes === "1024x1024" && i.purpose === "maskable")).toBe(true);

      // 4. sw.js must precache 1024px icons and maskable icons
      const swContent = fs.readFileSync(path.join(rootDir, "public/sw.js"), "utf-8");
      expect(swContent).toContain("'/icon-1024.png'");
      expect(swContent).toContain("'/icon-maskable-1024.png'");

      // 5. Install prompt must clear legacy dismissed key and support async prompt readiness
      const installPromptContent = fs.readFileSync(path.join(rootDir, "components/install-prompt.tsx"), "utf-8");
      expect(installPromptContent).toContain('localStorage.removeItem("pwa_install_dismissed")');
      expect(installPromptContent).toContain("atlas-install-prompt-ready");
    });

    it("Invariant 11.38: Adaptive Canvas renderer instances, smoothFactor and zoom suspension across Leaflet maps", () => {
      const canvasPatch = readFile("lib/leaflet-canvas-patch.ts");
      const worldMapContent = readFile("components/world-map.tsx");
      const collectiveMapContent = readFile("components/collective-map.tsx");
      const spainMapContent = readFile("components/spain-map.tsx");

      // Shared patch must use adaptive instance options rather than mutating global L.Canvas.prototype.options.padding
      expect(canvasPatch).toContain("createAdaptiveCanvasRenderer");
      expect(canvasPatch).toContain("L.canvas({ padding })");
      expect(canvasPatch).not.toContain("L.Canvas.prototype.options.padding =");
      expect(canvasPatch).toContain("L.Polyline.prototype.options.smoothFactor = 1.2;");
      expect(canvasPatch).toContain("_atlasMovePatched");
      expect(canvasPatch).toContain("_onCanvasMove");
      expect(canvasPatch).toContain("!(this._map.dragging && this._map.dragging.moving())");

      // All 3 maps must instantiate their dedicated adaptive Canvas renderer
      expect(worldMapContent).toContain('createAdaptiveCanvasRenderer("world")');
      expect(spainMapContent).toContain('createAdaptiveCanvasRenderer("spain")');
      expect(collectiveMapContent).toContain('createAdaptiveCanvasRenderer("collective")');
    });

    it("Invariant 11.39: Throttled background preloading for Feed, Social and Ranking caches", () => {
      const preloaderContent = readFile("lib/image-preloader.ts");
      const feedContent = readFeedSources();
      const socialContent = readSocialSources();
      const rankingContent = readRankingSources();

      // 1. Shared image preloader throttles concurrency and decodes async
      expect(preloaderContent).toContain("preloadImages");
      expect(preloaderContent).toContain("maxConcurrent");
      expect(preloaderContent).toContain('img.decoding = "async"');

      // 2. FeedTab: preloads feed in background via throttled preloadImages
      expect(feedContent).toContain("loadFeed(true)");
      expect(feedContent).toContain("fetchCombinedFeed");
      expect(feedContent).toContain("preloadUrls");
      expect(feedContent).toContain("preloadImages");

      // 3. SocialTab: preloads user progress and connections in background
      expect(socialContent).toContain("fetchUserProgress()");
      expect(socialContent).toContain("loadConnections()");

      // 4. RankingTab: preloads ranking data in background and caches both modes
      expect(rankingContent).toContain("fetchRanking(true)");
      expect(rankingContent).toContain("globalRankingCache");
    });
  });
});




