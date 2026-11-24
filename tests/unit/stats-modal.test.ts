import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  readAllStyles,
  readFeedSources,
  readFile,
  readRankingSources,
  readSocialSources,
  readStatsSources,
  readTrackerSources,
} from "@/tests/utils/source-reader";

describe("Mobile-only Stats Button & Modal (Mis Estadísticas)", () => {
  const rootDir = path.resolve(__dirname, "../..");

  it("1. Component structure: Central toggle, swipe gestures, visual timeline, cordilleras dropdown, and memories gallery", () => {
    const modalPath = path.join(rootDir, "components/stats-modal.tsx");
    expect(fs.existsSync(modalPath)).toBe(true);
    const content = readStatsSources();
    const peaksViewContent = readFile("components/stats/stats-peaks-view.tsx");

    // Central mode toggle with canonical app-mode-switch without parentheses
    expect(content).toContain("app-mode-switch");
    expect(content).toContain("47 Picos");
    expect(content).toContain("196 Países");
    expect(content).not.toMatch(/47 Picos \(\d+\)/);
    expect(content).not.toMatch(/196 Países \(\d+\)/);
    expect(content).not.toContain("cuaderno de bitácora");
    expect(content).not.toContain("Mis Estadísticas");

    // Experiences toggle button replaces stats brand icon inside the stats modal
    expect(content).toContain("stats-exp-toggle-btn");
    expect(content).not.toContain("ChartNoAxesColumn");

    // Horizontal swipe gesture navigation
    expect(content).toContain("handleTouchStart");
    expect(content).toContain("handleTouchEnd");
    expect(content).toContain("addEventListener");

    // Techo más alto alcanzado preserved in 47 Picos
    expect(content).toContain("Techo Más Alto Alcanzado");

    // Has lockScroll and unlockScroll
    expect(content).toContain("lockScroll()");
    expect(content).toContain("unlockScroll()");

    // Cordilleras dropdown accordion
    expect(content).toContain("toggleRange");
    expect(content).toContain("stats-range-dropdown");
    expect(content).toContain("peaksList");
    expect(content).toContain("stats-range-peak-text");

    // Visual timeline: named "Línea del tiempo" without icon, with continent colors and (n) for multiple visits per month
    expect(content).toContain("stats-travel-timeline-card");
    expect(content).toContain("Línea del tiempo");
    expect(content).not.toContain("Historial por Años y Meses");
    expect(content).toContain('<h3 className="stats-card-title">Línea del tiempo</h3>');
    expect(content).toContain("CONTINENT_COLOR_MAP");
    expect(content).toContain("stats-timeline-month-card");
    expect(content).toContain("stats-travel-chip-count");

    // Sections without icons in titles
    expect(content).toContain('<h3 className="stats-card-title">Techos de +3.000 metros</h3>');
    expect(content).not.toContain('<h3 className="stats-card-title">Las 5 Cumbres Compartidas</h3>');
    expect(content).not.toContain('<Award size={18} /> Techos de +3.000 metros');

    // Desglose por continentes converted into a visual chart
    expect(content).toContain("stats-continents-chart-wrap");
    expect(content).toContain("stats-continents-proportion-track");
    expect(content).toContain("stats-continents-chart-legend");
    expect(content).toContain('<h3 className="stats-card-title">Desglose por Continentes</h3>');

    // Order in StatsPeaksView: "Ver galería" above StatsTimeline, above "Techo Más Alto Alcanzado"
    const galleryBtnIdx = peaksViewContent.indexOf('className="stats-gallery-btn-wrap"');
    const timelineIdx = peaksViewContent.indexOf("<StatsTimeline");
    const highestPeakIdx = peaksViewContent.indexOf('className="stats-highlight-banner"');
    expect(galleryBtnIdx).toBeGreaterThan(0);
    expect(timelineIdx).toBeGreaterThan(0);
    expect(highestPeakIdx).toBeGreaterThan(0);
    expect(galleryBtnIdx).toBeLessThan(timelineIdx);
    expect(timelineIdx).toBeLessThan(highestPeakIdx);

    // Altitude numbers of highest peak formatted with Fraunces tabular nums
    expect(content).toContain("stats-highlight-alt");

    // Deep link to record on click
    expect(content).toContain("handleGoToRecord");
    expect(content).toContain("onTitleClick");

    // Photo gallery integration for "Recuerdos" with sorting and showDots=false
    expect(content).toContain("PhotoLightbox");
    expect(content).toContain("showDots={false}");
    expect(content).toContain("stats-gallery-overlay");
    expect(content).toContain("stats-gallery-grid");
    expect(content).toContain("stats-gallery-item-tag");
    expect(content).toContain("getLocationInfo");
    expect(content).toContain("sortedPhotos");
    expect(content).toContain("sortOrder");
    expect(content).toContain("Más recientes");
    expect(content).toContain("Más antiguas");

    // "Ver galería" button without redundant cards or descriptions
    expect(content).toContain("Ver galería");
    expect(content).not.toContain("Ver galería →");
    expect(content).not.toContain("Recuerdos Fotográficos");
    expect(content).not.toContain("Recuerdos del Mundo");
    expect(content).toContain("stats-gallery-btn-wrap");
    expect(content).toContain("stats-open-gallery-action-btn");

    // Gallery overlay: No back arrow, X closes gallery
    expect(content).not.toContain("stats-gallery-back-btn");
    expect(content).not.toContain("<ArrowLeft");
    expect(content).toContain("onCloseGallery");

    // Cordilleras: No "Toca para desplegar" chip, and percentages removed from cordilleras count
    expect(content).not.toContain("Toca para desplegar");
    expect(content).not.toContain("stats-range-pct");

    // Continents: Colors correspond to Olympic Games (JJOO)
    // Europa (Azul), Asia (Amarillo), África (Negro), Oceanía (Verde), América (Rojo)
    expect(content).toContain('"#0081C8"');
    expect(content).toContain('"#FCB132"');
    expect(content).toContain('"#111827"');
    expect(content).toContain('"#00A651"');
    expect(content).toContain('"#EE334E"');

    // Mode-specific root classes for peaks and countries (including scoped stats-overlay--mode)
    expect(content).toContain("stats-overlay--peaks");
    expect(content).toContain("stats-overlay--countries");
    expect(content).toContain("stats-mode--peaks mode-peaks");
    expect(content).toContain("stats-mode--countries mode-countries");

    // Línea del tiempo in 47 Picos with corporate peak chips and inverted months
    expect(content).toContain("peaksTimeline");
    expect(content).toContain("stats-travel-chip--peak");
    expect(content).toContain("stats-travel-chip-dot--peak");

    // Collapsible timeline: only on title, years cannot be compressed
    expect(content).toContain("stats-card-title-btn");
    expect(content).toContain("timelineCollapsed");
    expect(content).toContain("stats-travel-timeline-card--collapsed");
    expect(content).toContain("stats-timeline-year-header");
    expect(content).not.toContain("stats-timeline-year-header-btn");
    expect(content).not.toContain("toggleTimelineYear");

    // Progress bar for countries using continent colors
    expect(content).toContain("stats-kpi-progress--continents");
    expect(content).toContain("stats-continent-progress-fill");

    // Inverted months: months sorted descending (b - a) inside each year
    expect(content).toContain(".sort((a, b) => b[0] - a[0])");

    // Has updated phrases
    expect(content).toContain("picos provinciales");
    expect(content).toContain("Desnivel acumulado");
    expect(content).not.toContain("cumbres provinciales");
    expect(content).not.toContain("Desnivel coronado en España");

    // Strictly NO emojis inside stats sources
    const emojiRegex = /[\uD800-\uDBFF][\uDC00-\uDFFF]/;
    expect(emojiRegex.test(content)).toBe(false);
  });

  it("2. Topbar integration: All three main tabs have topbar-stats-btn with ChartNoAxesColumn before account-button", () => {
    const topbarContent = readFile("components/layout/app-topbar.tsx");
    const trackerContent = readTrackerSources();
    const socialContent = readSocialSources();
    const rankingContent = readRankingSources();

    // Shared AppTopbar places topbar-stats-btn with ChartNoAxesColumn before account-button
    expect(topbarContent).toContain("topbar-stats-btn");
    expect(topbarContent).toMatch(/topbar-stats-btn[\s\S]*?account-button/);
    expect(topbarContent).toContain("ChartNoAxesColumn");

    // All three main tabs mount AppTopbar and StatsModal
    expect(trackerContent).toContain("<AppTopbar");
    expect(trackerContent).toContain("StatsModal");
    expect(socialContent).toContain("<AppTopbar");
    expect(socialContent).toContain("StatsModal");
    expect(rankingContent).toContain("<AppTopbar");
    expect(rankingContent).toContain("StatsModal");
  });

  it("3. CSS Rules: Mobile only display (<=768px), desktop hidden, clean naked icon, and Fraunces variable numbers", () => {
    const globalsCss = readAllStyles();
    const statsModalCss = readFile("components/stats-modal.css");

    // Hidden on desktop by default
    expect(globalsCss).toMatch(/\.topbar-stats-btn\s*\{[^}]*display:\s*none\s*!important;/);

    // Shown on mobile (<=768px) without circle
    expect(globalsCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.topbar-stats-btn[\s\S]*?display:\s*inline-flex\s*!important;/);
    expect(globalsCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.topbar-stats-btn[\s\S]*?border:\s*none\s*!important;/);
    expect(globalsCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.topbar-stats-btn[\s\S]*?background:\s*transparent\s*!important;/);

    // Numbers styled with self-hosted Fraunces font variable (--font-serif)
    expect(statsModalCss).toContain("font-family: var(--font-serif) !important;");
    expect(statsModalCss).toContain(".stats-peak-alt-num");
    expect(statsModalCss).toContain(".stats-row-num");

    // Consistent typography: no DM Mono or external @import in stats-modal.css
    expect(statsModalCss).not.toContain('"DM Mono"');
    expect(statsModalCss).not.toContain("fonts.googleapis.com");
    expect(statsModalCss).toContain("var(--font-sans)");
    expect(statsModalCss).toContain("var(--font-display)");
  });

  it("4. PhotoLightbox pagination dots: can be disabled via showDots prop", () => {
    const lightboxContent = fs.readFileSync(path.join(rootDir, "components/photo-lightbox.tsx"), "utf-8");
    expect(lightboxContent).toContain("showDots");
    expect(lightboxContent).toContain("showDots && photos.length > 1");
  });

  it("5. Peak vs Country disambiguation: Granada must be Mulhacén (peak) and never the country Grenada", async () => {
    const { getLocationInfo, getCountryForAscent, getPeakForAscent } = await import("@/lib/stats-utils");

    // Spanish peak ID "granada" -> Mulhacén (type: peak)
    const granadaPeak = getLocationInfo("granada");
    expect(granadaPeak.type).toBe("peak");
    expect(granadaPeak.name).toBe("Mulhacén");

    // Case-insensitive peak lookup
    const granadaCap = getLocationInfo("Granada");
    expect(granadaCap.type).toBe("peak");
    expect(granadaCap.name).toBe("Mulhacén");

    // Country Grenada requires country ID "country-gd"
    const grenadaCountry = getLocationInfo("country-gd");
    expect(grenadaCountry.type).toBe("country");
    expect(grenadaCountry.name).toBe("Granada");

    // getCountryForAscent MUST reject Spanish peak ascents (e.g. Granada, Teide)
    expect(getCountryForAscent({ summit_id: "granada" })).toBeNull();
    expect(getCountryForAscent({ summit_id: "teide" })).toBeNull();
    expect(getCountryForAscent({ peak_id: "granada", summit_id: "country-gd" })).toBeNull();

    // getCountryForAscent returns country only when valid country identifier is provided
    const validCountryAscent = getCountryForAscent({ summit_id: "country-gd" });
    expect(validCountryAscent).not.toBeNull();
    expect(validCountryAscent?.id).toBe("country-gd");
    expect(validCountryAscent?.name).toBe("Granada");

    // getPeakForAscent returns Peak object for Spanish peaks and null for countries or wishlist
    const mulhacenAscent = getPeakForAscent({ summit_id: "granada" });
    expect(mulhacenAscent).not.toBeNull();
    expect(mulhacenAscent?.name).toBe("Mulhacén");
    expect(mulhacenAscent?.province).toBe("Granada");

    const teideAscent = getPeakForAscent({ summit_id: "teide" });
    expect(teideAscent).not.toBeNull();
    expect(teideAscent?.name).toBe("Teide");

    expect(getPeakForAscent({ summit_id: "country-gd" })).toBeNull();
    expect(getPeakForAscent({ summit_id: "granada", is_wishlist: true })).toBeNull();
  });

  it("6. Spacing and typography assertions: Gallery margin-bottom, Fraunces altitude, and scoped theme classes", () => {
    const statsModalCss = readFile("components/stats-modal.css");

    // Spacing between "Ver galería" and timeline/sections
    expect(statsModalCss).toMatch(/\.stats-gallery-btn-wrap\s*\{[^}]*margin-bottom:\s*26px;/);

    // Altitude of highest peak has Fraunces variable (--font-serif) & tabular nums
    expect(statsModalCss).toMatch(/\.stats-highlight-alt\s*\{[^}]*font-family:\s*var\(--font-serif\)/);
    expect(statsModalCss).toMatch(/\.stats-highlight-alt\s*\{[^}]*tabular-nums;/);

    // Continents chart styles present
    expect(statsModalCss).toContain(".stats-continents-chart-wrap");
    expect(statsModalCss).toContain(".stats-continents-proportion-track");
    expect(statsModalCss).toContain(".stats-continents-chart-legend");

    // Toggle central in stats header matches canonical topbar dimensions exactly
    expect(statsModalCss).toMatch(/\.stats-header\s+\.app-mode-switch\s*\{[^}]*min-width:\s*168px\s*!important;/);
    expect(statsModalCss).toMatch(/\.stats-header\s+\.app-mode-switch\s*\{[^}]*max-width:\s*180px\s*!important;/);
    expect(statsModalCss).toMatch(/\.stats-header\s+\.app-mode-switch\s+\.app-mode-btn\s*\{[^}]*padding:\s*4\.5px\s+10px\s*!important;/);

    // Cordillera row single-line alignment
    expect(statsModalCss).toMatch(/\.stats-range-meta\s*\{[^}]*white-space:\s*nowrap\s*!important;/);
    expect(statsModalCss).toMatch(/\.stats-range-count-num\s*\{[^}]*white-space:\s*nowrap\s*!important;/);

    // Peaks mode overrides enforce 47 Picos colors (pine green and sand/beige)
    expect(statsModalCss).toContain(".stats-overlay--peaks");
    expect(statsModalCss).toContain(".stats-overlay--countries");
    expect(statsModalCss).toContain(".stats-travel-chip--peak");
    expect(statsModalCss).toContain(".stats-card-title-btn");
    expect(statsModalCss).toContain(".stats-travel-timeline-card--collapsed");
    expect(statsModalCss).toContain(".stats-kpi-progress--continents");
    expect(statsModalCss).toContain(".stats-continent-progress-fill");
    expect(statsModalCss).toMatch(/\.stats-overlay--peaks[\s\S]*?--pine:\s*#245f52\s*!important;/);
    expect(statsModalCss).toContain(".stats-range-peak-text");
    expect(statsModalCss).toMatch(/\.stats-range-peak-province\s*\{[^}]*white-space:\s*nowrap;/);
  });

  it("7. Record links, timeline date integrity, and hash persistence on refresh", () => {
    const statsModalFile = readStatsSources();
    const trackerFile = readTrackerSources();
    const socialFile = readSocialSources();
    const rankingFile = readRankingSources();

    // onGoToRecord callback is passed and invoked
    expect(statsModalFile).toContain("onGoToRecord?: (summitId: string) => void;");
    expect(statsModalFile).toContain("onGoToRecord(summitId);");
    expect(trackerFile).toContain("onGoToRecord={(summitId) => {");
    expect(socialFile).toContain("onGoToRecord={(summitId) => {");
    expect(rankingFile).toContain("onGoToRecord={(summitId) => {");

    // All columns fetched for ascents to prevent stripping achieved_on
    expect(socialFile).toMatch(/supabase!\.from\("ascents"\)\.select\("\*"\)/);

    // Initial state on refresh maintains #estadisticas open in all 3 tabs
    expect(trackerFile).toMatch(/useState\([\s\S]*?window\.location\.hash === "#estadisticas"/);
    expect(socialFile).toMatch(/useState\([\s\S]*?window\.location\.hash === "#estadisticas"/);
    expect(rankingFile).toMatch(/useState\([\s\S]*?window\.location\.hash === "#estadisticas"/);

    // Teide has correct Santa Cruz de Tenerife ID in threeThousanders
    expect(statsModalFile).toContain('id: "santa-cruz-tenerife"');
    expect(statsModalFile).toContain('completed: completedPeakIds.has("santa-cruz-tenerife") || completedPeakIds.has("teide")');
  });
  it("8. Chronological ascending sort in timeline months and back navigation to statistics", () => {
    const statsModalFile = readStatsSources();
    const trackerFile = readTrackerSources();

    // Chronological ascending sort within month in visitsTimeline, peaksTimeline & experiencesTimeline
    expect(statsModalFile).toContain("buildYearMonthTimeline");
    expect(statsModalFile).toContain("if (a.earliestTime !== b.earliestTime) return a.earliestTime - b.earliestTime;");

    // Navigating to record from stats pushes state to retain #estadisticas in browser history
    expect(trackerFile).toMatch(/panelOpenedFromStatsRef\.current\s*=\s*true/);
    expect(trackerFile).toMatch(/window\.history\.pushState\(\{\s*hasPanel:\s*true,\s*fromStats:\s*true\s*\},/);

    // Going back to #estadisticas resets selected item and restores stats modal
    expect(trackerFile).toMatch(/hash === "#estadisticas"[\s\S]*?setStatsOpen\(true\)/);
    expect(trackerFile).toMatch(/hash === "#estadisticas"[\s\S]*?setSelected\(null\)/);

    // Closing panel opened from stats triggers history.back()
    expect(trackerFile).toMatch(/const fromStats = panelOpenedFromStatsRef\.current;[\s\S]*?if\s*\(fromStats\)\s*\{\s*window\.history\.back\(\);/);
  });
  it("9. Gallery and photo lightbox history stack and active mode preservation on return to map", () => {
    const statsModalFile = readStatsSources();
    const trackerFile = readTrackerSources();

    // Opening gallery pushes #galeria to history
    expect(statsModalFile).toMatch(/openGallery[\s\S]*?window\.history\.pushState\(\{\s*statsGallery:\s*true\s*\},/);
    expect(statsModalFile).toContain('"#galeria"');

    // Opening photo in gallery pushes #lightbox to history
    expect(statsModalFile).toMatch(/openLightbox[\s\S]*?window\.history\.pushState\(\{\s*statsLightbox:\s*true\s*\},/);
    expect(statsModalFile).toContain('"#lightbox"');

    // StatsModal synchronizes hash changes: #lightbox keeps gallery open, #galeria closes lightbox, non-gallery hash closes both
    expect(statsModalFile).toContain('hash === "#lightbox"');
    expect(statsModalFile).toContain('hash === "#galeria"');
    expect(statsModalFile).toContain("setLightboxIndex(null)");
    expect(statsModalFile).toContain("setGalleryOpen(false)");

    // StatsModal notifies mode changes and syncs mode with summit-tracker
    expect(statsModalFile).toContain("onModeChange?: (mode: StatsMode) => void;");
    expect(trackerFile).toMatch(/onModeChange=\{\(newMode\)\s*=>\s*\{/);
    expect(trackerFile).toMatch(/localStorage\.setItem\("last_active_mode",\s*target\);[\s\S]*?replaceState\(null,\s*"",\s*target === "peaks" \? "\/picos" : "\/"\)/);
  });
  it("10. Target profile stats & gallery isolation, no 'Viaje compartido' badge, and avatar badge overlay", () => {
    const statsModalFile = readStatsSources();
    const feedFile = readFeedSources();
    const socialFile = readSocialSources();

    // StatsModal isolates target profile photos and does not fall back to session user localStorage
    expect(statsModalFile).toContain("targetProfile?:");
    expect(statsModalFile).toContain("isTargetOther");
    expect(statsModalFile).toContain("!isTargetOther && Boolean(session?.user?.id)");
    expect(statsModalFile).toContain("Galería de @${targetUsername}");

    // Feed card has no 'Viaje compartido' badge pill
    expect(feedFile).not.toContain("Viaje compartido");
    expect(feedFile).not.toContain("feed-thread-badge");

    // Social tab avatar has protruding badge wrapper and no red dot in followers button
    expect(socialFile).toContain("hero-profile-avatar-wrap");
    expect(socialFile).toContain("hero-avatar-badge");
    expect(socialFile).not.toMatch(/acceptedFollowers\.length.*?hero-pending-dot/);
  });
  it("11. Experiences Statistics Mode: Header alignment, experiences toggle button, category breakdown and direct entry", () => {
    const statsModalFile = readStatsSources();
    const statsModalCss = readFile("components/stats-modal.css");
    const trackerFile = readTrackerSources();
    const socialFile = readSocialSources();

    // Header exact topbar alignment: min-height 76px desktop, 56px mobile, padding clamp
    expect(statsModalCss).toContain("min-height: 76px;");
    expect(statsModalCss).toContain("padding: 0 clamp(22px, 6vw, 92px);");
    expect(statsModalCss).toContain("min-height: 56px;");
    expect(statsModalCss).toContain("min-width: 220px;");

    // Experiences button replaces stats brand icon
    expect(statsModalFile).toContain("stats-exp-toggle-btn");
    expect(statsModalFile).not.toContain("ChartNoAxesColumn");
    expect(statsModalCss).toContain(".stats-exp-toggle-btn");
    expect(statsModalCss).toContain(".stats-exp-toggle-btn--active");

    // Experiences stats data: expMetrics, subitems rule, categories breakdown, timeline
    expect(statsModalFile).toContain("expMetrics");
    expect(statsModalFile).toContain("experiencesTimeline");
    expect(statsModalFile).toContain("stats-travel-chip--experience");
    expect(statsModalFile).toContain("Categorías de Experiencias");
    expect(statsModalFile).toContain("Experiencias Registradas");

    // Direct entry from experiences mode
    expect(trackerFile).toContain('initialMode={experiencesMode ? "experiences" : currentMode}');
    expect(socialFile).toContain('initialMode={isExp ? "experiences" : currentMode}');
  });
});
