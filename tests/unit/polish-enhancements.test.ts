import { describe, it, expect } from "vitest";
import { compareFeedRecords } from "@/lib/feed-sort";
import * as fs from "fs";
import * as path from "path";

describe("Polish Enhancements (Mini modificaciones)", () => {
  describe("1. Feed sorting by start date and end date", () => {
    it("should sort records with distinct start dates in descending order", () => {
      const itemNewer = { record_date: "2024-06-15", created_at: "2024-06-15T10:00:00Z" };
      const itemOlder = { record_date: "2024-05-10", created_at: "2024-05-10T10:00:00Z" };

      const sorted = [itemOlder, itemNewer].sort(compareFeedRecords);
      expect(sorted[0]).toBe(itemNewer);
      expect(sorted[1]).toBe(itemOlder);
    });

    it("when start dates are identical, the record WITHOUT end_date is considered older (más antiguo)", () => {
      // User requirement: "si tengo dos registros con misma fecha de inicio, pero uno tiene fecha de final y otro no, el más 'antiguo' es el que no tiene fecha de fin."
      // In a descending feed (newest to oldest): the newer record (with end_date) appears first, and the older (without end_date) appears second.
      const itemWithEndDate = {
        record_date: "2024-05-01",
        end_date: "2024-05-10",
        created_at: "2024-05-01T10:00:00Z"
      };
      const itemWithoutEndDate = {
        record_date: "2024-05-01",
        end_date: null,
        created_at: "2024-05-01T12:00:00Z"
      };

      const sorted1 = [itemWithoutEndDate, itemWithEndDate].sort(compareFeedRecords);
      expect(sorted1[0]).toBe(itemWithEndDate);
      expect(sorted1[1]).toBe(itemWithoutEndDate);

      const sorted2 = [itemWithEndDate, itemWithoutEndDate].sort(compareFeedRecords);
      expect(sorted2[0]).toBe(itemWithEndDate);
      expect(sorted2[1]).toBe(itemWithoutEndDate);
    });

    it("when start dates are identical and both have end_date, the later end_date appears first", () => {
      const itemEndedLater = {
        record_date: "2024-05-01",
        end_date: "2024-05-20",
        created_at: "2024-05-01T10:00:00Z"
      };
      const itemEndedEarlier = {
        record_date: "2024-05-01",
        end_date: "2024-05-10",
        created_at: "2024-05-01T10:00:00Z"
      };

      const sorted = [itemEndedEarlier, itemEndedLater].sort(compareFeedRecords);
      expect(sorted[0]).toBe(itemEndedLater);
      expect(sorted[1]).toBe(itemEndedEarlier);
    });

    it("when start dates and end dates are identical, breaks tie with created_at descending", () => {
      const itemCreatedLater = {
        record_date: "2024-05-01",
        end_date: null,
        created_at: "2024-05-01T15:00:00Z"
      };
      const itemCreatedEarlier = {
        record_date: "2024-05-01",
        end_date: null,
        created_at: "2024-05-01T09:00:00Z"
      };

      const sorted = [itemCreatedEarlier, itemCreatedLater].sort(compareFeedRecords);
      expect(sorted[0]).toBe(itemCreatedLater);
      expect(sorted[1]).toBe(itemCreatedEarlier);
    });
  });

  describe("2. Install prompt title typography matches brand banner", () => {
    it("should use DM Sans and 0.13em tracking in install-prompt-title", () => {
      const cssPath = path.resolve(process.cwd(), "app/globals.css");
      const css = fs.readFileSync(cssPath, "utf-8");

      expect(css).toMatch(/\.install-prompt-title\s*\{[^}]*font-family:\s*"DM Sans"/);
      expect(css).toMatch(/\.install-prompt-title\s*\{[^}]*letter-spacing:\s*0\.13em/);
      expect(css).not.toMatch(/\.install-prompt-title\s*\{[^}]*Playfair Display/);
    });
  });

  describe("3. Share record icon matches feed posts (Share2)", () => {
    it("should use Share2 from lucide-react in summit-tracker and feed-tab", () => {
      const trackerPath = path.resolve(process.cwd(), "components/summit-tracker.tsx");
      const tracker = fs.readFileSync(trackerPath, "utf-8");

      const feedPath = path.resolve(process.cwd(), "components/feed-tab.tsx");
      const feed = fs.readFileSync(feedPath, "utf-8");

      expect(feed).toContain("<Share2 size={16} />");
      const iconShareFunc = tracker.slice(
        tracker.indexOf("function IconShare"),
        tracker.indexOf("function IconGithub")
      );
      expect(iconShareFunc).toContain("<Share2");
      expect(iconShareFunc).not.toContain("<polyline");
    });
  });

  describe("4. Social hero when anonymous (not logged in)", () => {
    it("should remove the motto on desktop and mobile and center login button", () => {
      const socialPath = path.resolve(process.cwd(), "components/social-tab.tsx");
      const social = fs.readFileSync(socialPath, "utf-8");

      const cssPath = path.resolve(process.cwd(), "app/globals.css");
      const css = fs.readFileSync(cssPath, "utf-8");

      expect(social).not.toContain("Comunidad viajera");
      expect(social).not.toContain("Comparte el camino");
      expect(social).toContain("hero-main--social-anon");
      expect(social).toContain("Iniciar sesión");
      expect(social).not.toContain("<LogIn");

      expect(css).toMatch(/\.hero-main--social\.hero-main--social-anon\s*\{[^}]*display:\s*flex\s*!important/);
      expect(css).toMatch(/@media\s*\(max-width:\s*700px\)[\s\S]*?\.hero-main--social\.hero-main--anon[\s\S]*?display:\s*flex\s*!important/);
    });
  });

  describe("5. Ranking hero", () => {
    it("should remove motto phrases completely and center user ranking on all viewports", () => {
      const rankingPath = path.resolve(process.cwd(), "components/ranking-tab.tsx");
      const ranking = fs.readFileSync(rankingPath, "utf-8");

      const rankingCss = fs.readFileSync(path.resolve(process.cwd(), "components/ranking.css"), "utf-8");

      expect(ranking).not.toContain("Grandes viajeros");
      expect(ranking).not.toContain("Techos de España");
      expect(ranking).not.toContain("El podio mundial");
      expect(ranking).not.toContain("El podio de cumbres");

      const globalsCss = fs.readFileSync(path.resolve(process.cwd(), "app/globals.css"), "utf-8");
      expect(rankingCss).toMatch(/\.hero-main--ranking\s*\{[^}]*display:\s*flex\s*!important/);
      expect(rankingCss).toMatch(/\.hero-main--ranking\s*\{[^}]*text-align:\s*center\s*!important/);
      expect(rankingCss).toMatch(/\.hero-main--ranking\s+\.ranking-hero-aside\s*\{[^}]*display:\s*flex\s*!important/);

      expect(globalsCss).toMatch(/\.hero-main--ranking\s*\{[^}]*display:\s*flex\s*!important/);
      expect(globalsCss).toMatch(/\.hero-main--ranking\s*\{[^}]*text-align:\s*center\s*!important/);
    });
  });

  describe("6. User map title @ symbol spacing and overflow protection", () => {
    it("should provide horizontal padding and negative margins to prevent clipping of italic characters like @", () => {
      const globalsCss = fs.readFileSync(path.resolve(process.cwd(), "app/globals.css"), "utf-8");
      expect(globalsCss).toMatch(/\.hero-title--user\s+em,\s*\n*\.hero-main--with-follow\s+h1\s+em\s*\{[^}]*overflow:\s*hidden/);
      expect(globalsCss).toMatch(/\.hero-title--user\s+em,\s*\n*\.hero-main--with-follow\s+h1\s+em\s*\{[^}]*text-overflow:\s*ellipsis/);
      expect(globalsCss).toMatch(/\.hero-title--user\s+em,\s*\n*\.hero-main--with-follow\s+h1\s+em\s*\{[^}]*padding:\s*0\.04em\s+0\.18em/);
      expect(globalsCss).toMatch(/\.hero-title--user\s+em,\s*\n*\.hero-main--with-follow\s+h1\s+em\s*\{[^}]*margin:\s*-0\.04em\s+-0\.18em/);
    });
  });

  describe("7. Collective map visitor deep-link to record panel", () => {
    it("should link visitor items to user profile with #panel=recordId and set auto_open_panel in sessionStorage", () => {
      const collectivePath = path.resolve(process.cwd(), "components/collective-map.tsx");
      const collective = fs.readFileSync(collectivePath, "utf-8");

      expect(collective).toContain("useRouter");
      expect(collective).toContain("recordUrlWithHash");
      expect(collective).toContain('sessionStorage.setItem("auto_open_panel", recordId)');
      expect(collective).toContain("#panel=");
      expect(collective).toContain("handleVisitorClick");
      expect(collective).toContain("challenge=${recordChallenge}&from=ranking");
      expect(collective).toContain("collective-visitor-link");
    });

    it("should have hover styling in ranking.css for collective-visitor-link across modes", () => {
      const rankingCss = fs.readFileSync(path.resolve(process.cwd(), "components/ranking.css"), "utf-8");
      expect(rankingCss).toMatch(/\.collective-visitor-link:hover\s*\{[^}]*background:/);
      expect(rankingCss).toMatch(/\.mode-peaks \.collective-visitor-link:hover\s*\{[^}]*background:/);
    });
  });

  describe("8. Spain map zoom responsiveness & fluidity", () => {
    it("should configure non-rigid maxBoundsViscosity and 0.5 canvas padding in spain-map.tsx", () => {
      const spainMapPath = path.resolve(process.cwd(), "components/spain-map.tsx");
      const content = fs.readFileSync(spainMapPath, "utf-8");

      expect(content).toContain("maxBoundsViscosity={0.5}");
      expect(content).toContain("L.Canvas.prototype.options.padding = 0.5;");
      expect(content).toContain("rafRef.current");
    });
  });

  describe("9. Photo loading acceleration in feed and records", () => {
    it("should use eager loading and async decoding for top feed items and prefetch in feed-tab.tsx", () => {
      const feedPath = path.resolve(process.cwd(), "components/feed-tab.tsx");
      const content = fs.readFileSync(feedPath, "utf-8");

      expect(content).toContain("decoding=\"async\"");
      expect(content).toContain("imgLoading");
      expect(content).toContain("topPhotosToPreload");
    });

    it("should use eager loading, async decoding and preloading in summit-tracker.tsx", () => {
      const trackerPath = path.resolve(process.cwd(), "components/summit-tracker.tsx");
      const content = fs.readFileSync(trackerPath, "utf-8");

      expect(content).toContain("targetSummitId");
      expect(content).toContain("new Image()");
      expect(content).toContain('decoding="async"');
    });
  });

  describe("10. Mobile photo batch selector and assignment modal", () => {
    it("should ensure photo-batch-bar has high zIndex (100050) above mobile info-panel and correct assignment calculation", () => {
      const trackerPath = path.resolve(process.cwd(), "components/summit-tracker.tsx");
      const content = fs.readFileSync(trackerPath, "utf-8");

      expect(content).toContain("zIndex: 100050");
      expect(content).toContain("zIndex: 100060");
      expect(content).toContain("!selectedPhotosForEdit.includes(p.id)");

      const globalsCss = fs.readFileSync(path.resolve(process.cwd(), "app/globals.css"), "utf-8");
      expect(globalsCss).toContain(".photo-batch-bar");
      expect(globalsCss).toMatch(/\.photo-batch-bar\s*\{[^}]*z-index:\s*100050\s*!important/);
    });
  });
  describe("11. Close record/panel anti-reopening guards and mobile tooltip cleanup", () => {
    it("should prevent momentary re-opening when closing panel/record with close button", () => {
      const trackerPath = path.resolve(process.cwd(), "components/summit-tracker.tsx");
      const trackerContent = fs.readFileSync(trackerPath, "utf-8");

      expect(trackerContent).toContain("isClosingPanelRef = useRef(false)");
      expect(trackerContent).toContain("initialPanelRestoredRef = useRef(false)");
      expect(trackerContent).toContain("isClosingPanelRef.current = true;");
      expect(trackerContent).toContain("if (isClosingPanelRef.current) return;");
    });

    it("should clean up and prevent lingering tooltips on touch devices / back navigation", () => {
      const globalsCss = fs.readFileSync(path.resolve(process.cwd(), "app/globals.css"), "utf-8");
      expect(globalsCss).toContain("@media (hover: none) and (pointer: coarse)");
      expect(globalsCss).toContain("display: none !important;");

      const worldMapContent = fs.readFileSync(path.resolve(process.cwd(), "components/world-map.tsx"), "utf-8");
      expect(worldMapContent).toContain("safeCloseTooltip(layer)");
      expect(worldMapContent).toContain("container.querySelectorAll(\".leaflet-tooltip\")");

      const spainMapContent = fs.readFileSync(path.resolve(process.cwd(), "components/spain-map.tsx"), "utf-8");
      expect(spainMapContent).toContain("safeCloseTooltip(layer)");
      expect(spainMapContent).toContain("container.querySelectorAll(\".leaflet-tooltip\")");

      const trackerContent = fs.readFileSync(path.resolve(process.cwd(), "components/summit-tracker.tsx"), "utf-8");
      expect(trackerContent).toContain('.querySelectorAll(".leaflet-tooltip")');
    });
  });
});
