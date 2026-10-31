import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("PWA Install Prompt & Topbar Download Button", () => {
  const rootDir = process.cwd();
  const installPromptPath = path.join(rootDir, "components/install-prompt.tsx");
  const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
  const socialPath = path.join(rootDir, "components/social-tab.tsx");
  const rankingPath = path.join(rootDir, "components/ranking-tab.tsx");
  const globalsCssPath = path.join(rootDir, "app/globals.css");

  it("1. InstallPrompt component exports and props structure", () => {
    const installPromptFile = fs.readFileSync(installPromptPath, "utf-8");

    // Exports helper functions
    expect(installPromptFile).toContain("export function isIOS()");
    expect(installPromptFile).toContain("export function isStandalone()");
    expect(installPromptFile).toContain("export function isMobile()");
    expect(installPromptFile).toContain("export interface InstallPromptProps");
    expect(installPromptFile).toContain("manualOpen?: boolean");
    expect(installPromptFile).toContain("onManualClose?: () => void");

    // Scroll lock integration
    expect(installPromptFile).toContain("useScrollLock(showPrompt)");

    // Module-level beforeinstallprompt preservation
    expect(installPromptFile).toContain("globalDeferredPrompt");
    expect(installPromptFile).toContain('window.addEventListener("beforeinstallprompt"');

    // Friendly prompt subtitle
    expect(installPromptFile).toContain(
      "¿Quieres instalar la app en tu dispositivo para acceder más rápido y disfrutar de una experiencia completa?"
    );

    // Fallback steps for Android without direct prompt
    expect(installPromptFile).toContain("showManualAndroidSteps");
  });

  it("2. SummitTracker Topbar integration: Download button in place of stats button on mobile web", () => {
    const trackerFile = fs.readFileSync(trackerPath, "utf-8");

    // Imports Download icon and isStandalone
    expect(trackerFile).toContain('import { InstallPrompt, isStandalone } from "./install-prompt"');
    expect(trackerFile).toContain("Download");

    // States for mobile browser, prompt open, and PWA mode
    expect(trackerFile).toContain("const [installPromptOpen, setInstallPromptOpen] = useState(false);");
    expect(trackerFile).toContain("const [canInstallMobile, setCanInstallMobile] = useState(false);");
    expect(trackerFile).toContain("const [isPwa, setIsPwa] = useState(false);");

    // Download button sits in topbar before account-button, shown on mobile web (!targetProfile && canInstallMobile)
    expect(trackerFile).toContain("{!targetProfile && canInstallMobile && (");
    expect(trackerFile).toContain('className="topbar-install-btn hero-install-btn"');
    expect(trackerFile).toContain("setInstallPromptOpen(true)");
    expect(trackerFile).toContain("<Download size={20} strokeWidth={2.2} />");

    // Stats button is strictly conditioned on isPwa
    expect(trackerFile).toContain("isPwa && (myProfile || session)");

    // Stops propagation on touch and click
    expect(trackerFile).toContain("e.stopPropagation()");

    // Passes manualOpen and onManualClose to InstallPrompt
    expect(trackerFile).toContain("manualOpen={installPromptOpen}");
    expect(trackerFile).toContain("onManualClose={() => setInstallPromptOpen(false)}");
  });

  it("3. CSS Rules: Hidden on desktop, styled in mobile topbar, and supports experiences mode", () => {
    const globalsCss = fs.readFileSync(globalsCssPath, "utf-8");

    // Hidden on desktop by default
    expect(globalsCss).toMatch(/\.hero-install-btn\s*\{[^}]*display:\s*none;/);
    expect(globalsCss).toMatch(/\.topbar-install-btn\s*\{[^}]*display:\s*none;/);

    // Positioned in topbar on mobile (<=768px)
    expect(globalsCss).toContain(".topbar-install-btn,");
    expect(globalsCss).toContain(".hero-install-btn,");

    // Experiences dark mode styling
    expect(globalsCss).toContain(".mode-experiences .topbar-install-btn");
    expect(globalsCss).toContain(".mode-experiences .hero-install-btn");
  });

  it("4. PWA vs Mobile Web visibility: stats button hidden on mobile web, download button hidden in PWA", () => {
    const globalsCss = fs.readFileSync(globalsCssPath, "utf-8");
    const trackerFile = fs.readFileSync(trackerPath, "utf-8");
    const socialFile = fs.readFileSync(socialPath, "utf-8");
    const rankingFile = fs.readFileSync(rankingPath, "utf-8");

    // CSS hides stats on non-PWA mobile web
    expect(globalsCss).toContain("html:not(.is-pwa) .topbar-stats-btn:not(.topbar-install-btn):not(.hero-install-btn)");

    // CSS hides download button in PWA
    expect(globalsCss).toContain(".is-pwa .topbar-install-btn");

    // React components condition stats button on isPwa
    expect(trackerFile).toContain("isPwa && (myProfile || session)");
    expect(socialFile).toContain("isPwa && (myProfile || session)");
    expect(rankingFile).toContain("isPwa && (myProfile || session)");
  });
});
