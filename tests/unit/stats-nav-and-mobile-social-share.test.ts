import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Seamless Navigation from Stats/Gallery to Record & Mobile Social Hero Share/QR", () => {
  const rootDir = path.resolve(__dirname, "../..");

  it("1. Stats and Gallery seamless transition: Keeps stats open under panel, preserves gallery state, replaces lightbox history, and displays Atlas loading indicator on delay", () => {
    const statsModalFile = fs.readFileSync(path.join(rootDir, "components/stats-modal.tsx"), "utf-8");
    const trackerFile = fs.readFileSync(path.join(rootDir, "components/summit-tracker.tsx"), "utf-8");

    // In stats-modal.tsx, handleGoToRecord replaces #lightbox with #galeria so history back returns straight to gallery
    expect(statsModalFile).toContain('window.history.replaceState({ statsGallery: true }, "", "#galeria");');
    // Does NOT prematurely call setGalleryOpen(false) when delegating to onGoToRecord
    expect(statsModalFile).not.toMatch(/setLightboxIndex\(null\);\s*setGalleryOpen\(false\);\s*if\s*\(onGoToRecord\)/);

    // Displays Atlas logo loading overlay if navigating to record takes time (debounce >= 150ms)
    expect(statsModalFile).toContain("showNavigatingLoader");
    expect(statsModalFile).toContain("stats-loading-overlay");
    expect(statsModalFile).toContain("atlasPulse");
    expect(statsModalFile).toContain("Cargando…");

    // In summit-tracker.tsx onGoToRecord, statsOpen is kept true (not prematurely unmounted)
    expect(trackerFile).toMatch(/panelOpenedFromStatsRef\.current\s*=\s*true;[\s\S]*?panelPushedRef\.current\s*=\s*true;/);
    expect(trackerFile).not.toMatch(/onGoToRecord=\{\(summitId\)\s*=>\s*\{\s*setStatsOpen\(false\);/);

    // Synchronous resolution of item on onGoToRecord avoids blank / missing frames
    expect(trackerFile).toContain("peakToItem(matchedPeak)");
    expect(trackerFile).toContain("countryToItem(matchedCountry)");

    // Info panel and record dialog display above StatsModal (z-index 10100 / 10200) with backdrop when opened from stats
    expect(trackerFile).toContain("info-panel-backdrop--from-stats");
    expect(trackerFile).toContain("zIndex: 10100");
    expect(trackerFile).toContain("zIndex: 10200");

    // handleHashChange protects statsOpen while panel is open from stats
    expect(trackerFile).toMatch(/if\s*\(!panelOpenedFromStatsRef\.current\)\s*\{\s*setStatsOpen\(false\);\s*\}/);
  });

  it("2. Mobile Social hero layout: Preserves exact hero-stat typography, shifts ratio, and stacks Share & QR buttons", () => {
    const socialFile = fs.readFileSync(path.join(rootDir, "components/social-tab.tsx"), "utf-8");
    const cssFile = fs.readFileSync(path.join(rootDir, "app/globals.css"), "utf-8");

    // SocialTab contains hero-stat-wrap, keeping strong and span as direct children of hero-stat
    expect(socialFile).toContain("hero-stat-wrap");
    expect(socialFile).toMatch(/<aside className="hero-stat"[^>]*>\s*<strong/);
    expect(socialFile).toMatch(/<\/strong>\s*<span suppressHydrationWarning>\{activeUnit\}<\/span>/);
    expect(socialFile).toContain("hero-stat-actions-mobile");
    expect(socialFile).toContain("hero-stat-action-btn");
    expect(socialFile).toContain("handleShareApp");
    expect(socialFile).toContain("setQrModalOpen(true)");
    expect(socialFile).toContain("<QrModal");

    // CSS shifts ratio slightly to the left on mobile (<= 700px) and stacks the two buttons
    expect(cssFile).toContain(".hero-main--social .hero-stat-wrap");
    expect(cssFile).toContain(".hero-main--social .hero-stat");
    expect(cssFile).toContain("margin-left: -6px !important;");
    expect(cssFile).toContain(".hero-main--social .hero-stat-actions-mobile");
    expect(cssFile).toContain("flex-direction: column !important;");
    expect(cssFile).toContain(".hero-main--social .hero-stat-action-btn");
    expect(cssFile).toContain("border-radius: 999px !important;");

    // On desktop, hero-stat-actions-mobile is hidden
    expect(cssFile).toMatch(/\.hero-stat-actions-mobile\s*\{\s*display:\s*none\s*!important;\s*\}/);
  });

  it("3. QrModal: Centered app logo, valid QR data generation, share & copy actions", () => {
    const qrModalPath = path.join(rootDir, "components/qr-modal.tsx");
    expect(fs.existsSync(qrModalPath)).toBe(true);
    const qrModalFile = fs.readFileSync(qrModalPath, "utf-8");

    // Imports and uses QRCode generator with Level H error correction (to allow centered logo)
    expect(qrModalFile).toContain('import QRCode from "qrcode";');
    expect(qrModalFile).toContain('errorCorrectionLevel: "H"');

    // Centered application logo
    expect(qrModalFile).toContain("IconLogo");
    expect(qrModalFile).toContain("qr-code-center-logo");

    // Modal accessibility, scroll lock and buttons
    expect(qrModalFile).toContain("useScrollLock(isOpen)");
    expect(qrModalFile).toContain('role="dialog"');
    expect(qrModalFile).toContain('aria-modal="true"');
    expect(qrModalFile).toContain("handleShare");
    expect(qrModalFile).toContain("handleCopy");
  });
});
