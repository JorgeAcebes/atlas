import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Mobile-only Stats Button & Modal (Mis Estadísticas)", () => {
  const rootDir = path.resolve(__dirname, "../..");

  it("1. Component structure: Central toggle, swipe gestures, visual timeline, cordilleras dropdown, and memories gallery", () => {
    const modalPath = path.join(rootDir, "components/stats-modal.tsx");
    expect(fs.existsSync(modalPath)).toBe(true);
    const content = fs.readFileSync(modalPath, "utf-8");

    // Central mode toggle with canonical app-mode-switch without parentheses
    expect(content).toContain("app-mode-switch");
    expect(content).toContain("47 Picos");
    expect(content).toContain("196 Países");
    expect(content).not.toMatch(/47 Picos \(\d+\)/);
    expect(content).not.toMatch(/196 Países \(\d+\)/);
    expect(content).not.toContain("cuaderno de bitácora");
    expect(content).not.toContain("Mis Estadísticas");

    // Stats brand icon on top-left
    expect(content).toContain("stats-header-brand");
    expect(content).toContain("ChartNoAxesColumn");

    // Horizontal swipe gesture navigation
    expect(content).toContain("handleTouchStart");
    expect(content).toContain("handleTouchEnd");
    expect(content).toContain("onTouchStart");
    expect(content).toContain("onTouchEnd");

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

    // Order: "Ver galería" is placed above timeline, which is above "Techo Más Alto Alcanzado"
    const galleryBtnIdx = content.indexOf('className="stats-gallery-btn-wrap"');
    const timelineIdx = content.indexOf("LÍNEA DEL TIEMPO DE PICOS");
    const highestPeakIdx = content.indexOf('className="stats-highlight-banner"');
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
    expect(content).toContain("modePhotos");
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
    expect(content).toContain('onClick={() => setGalleryOpen(false)}');

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
    expect(content).toContain(".sort((a, b) => b - a)");

    // Has updated phrases
    expect(content).toContain("picos provinciales");
    expect(content).toContain("Desnivel acumulado");
    expect(content).not.toContain("cumbres provinciales");
    expect(content).not.toContain("Desnivel coronado en España");

    // Strictly NO emojis inside stats-modal.tsx
    const emojiRegex = /[\uD800-\uDBFF][\uDC00-\uDFFF]/;
    expect(emojiRegex.test(content)).toBe(false);
  });

  it("2. Topbar integration: All three main tabs have topbar-stats-btn with ChartNoAxesColumn before account-button", () => {
    const trackerContent = fs.readFileSync(path.join(rootDir, "components/summit-tracker.tsx"), "utf-8");
    const socialContent = fs.readFileSync(path.join(rootDir, "components/social-tab.tsx"), "utf-8");
    const rankingContent = fs.readFileSync(path.join(rootDir, "components/ranking-tab.tsx"), "utf-8");

    // SummitTracker
    expect(trackerContent).toContain("topbar-stats-btn");
    expect(trackerContent).toMatch(/topbar-stats-btn[\s\S]*?account-button/);
    expect(trackerContent).toContain("ChartNoAxesColumn");
    expect(trackerContent).toContain("<StatsModal");

    // SocialTab
    expect(socialContent).toContain("topbar-stats-btn");
    expect(socialContent).toMatch(/topbar-stats-btn[\s\S]*?account-button/);
    expect(socialContent).toContain("ChartNoAxesColumn");
    expect(socialContent).toContain("<StatsModal");

    // RankingTab
    expect(rankingContent).toContain("topbar-stats-btn");
    expect(rankingContent).toMatch(/topbar-stats-btn[\s\S]*?account-button/);
    expect(rankingContent).toContain("ChartNoAxesColumn");
    expect(rankingContent).toContain("<StatsModal");
  });

  it("3. CSS Rules: Mobile only display (<=768px), desktop hidden, clean naked icon, and Fraunces numbers", () => {
    const globalsCss = fs.readFileSync(path.join(rootDir, "app/globals.css"), "utf-8");
    const statsModalCss = fs.readFileSync(path.join(rootDir, "components/stats-modal.css"), "utf-8");

    // Hidden on desktop by default
    expect(globalsCss).toMatch(/\.topbar-stats-btn\s*\{[^}]*display:\s*none\s*!important;/);

    // Shown on mobile (<=768px) without circle
    expect(globalsCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.topbar-stats-btn[\s\S]*?display:\s*inline-flex\s*!important;/);
    expect(globalsCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.topbar-stats-btn[\s\S]*?border:\s*none\s*!important;/);
    expect(globalsCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.topbar-stats-btn[\s\S]*?background:\s*transparent\s*!important;/);

    // Numbers styled with Fraunces
    expect(statsModalCss).toContain('font-family: "Fraunces", Georgia, serif !important;');
    expect(statsModalCss).toContain('.stats-peak-alt-num');
    expect(statsModalCss).toContain('.stats-row-num');

    // Consistent typography: no DM Mono in stats-modal.css
    expect(statsModalCss).not.toContain('"DM Mono"');
    expect(statsModalCss).toContain('var(--font-dm-sans, "DM Sans", sans-serif)');
    expect(statsModalCss).toContain('"Playfair Display"');
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
    const statsModalCss = fs.readFileSync(path.join(rootDir, "components/stats-modal.css"), "utf-8");

    // Spacing between "Ver galería" and timeline/sections
    expect(statsModalCss).toMatch(/\.stats-gallery-btn-wrap\s*\{[^}]*margin-bottom:\s*26px;/);

    // Altitude of highest peak has Fraunces tabular nums
    expect(statsModalCss).toMatch(/\.stats-highlight-alt\s*\{[^}]*font-family:\s*"Fraunces"/);
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
});
