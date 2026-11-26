import { describe, it, expect } from "vitest";
import {
  INSTALL_PROMPT_MAX_WIDTH,
  canDisplayInstallPrompt,
} from "@/lib/device-utils";
import {
  readAllStyles,
  readFile,
  readRankingSources,
  readSocialSources,
  readTrackerSources,
} from "@/tests/utils/source-reader";

describe("PWA Install Prompt & Topbar Download Button", () => {
  it("1. InstallPrompt component exports and props structure", () => {
    const installPromptFile = readFile("components/install-prompt.tsx");

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
    const trackerFile = readTrackerSources();
    const topbarFile = readFile("components/layout/app-topbar.tsx");
    const pwaHookFile = readFile("hooks/use-pwa-install.ts");

    // Imports InstallPrompt and uses usePwaInstall
    expect(trackerFile).toContain("InstallPrompt");
    expect(pwaHookFile).toContain("isStandalone");
    expect(topbarFile).toContain("Download");

    // States for mobile browser, prompt open, and PWA mode
    expect(pwaHookFile).toContain("const [installPromptOpen, setInstallPromptOpen] = useState(false);");
    expect(pwaHookFile).toContain("const [canInstallMobile, setCanInstallMobile] = useState(false);");
    expect(pwaHookFile).toContain("const [isPwa, setIsPwa] = useState(false);");

    // Download button sits in topbar before account-button, shown on mobile web (!targetProfile && canInstallMobile)
    expect(topbarFile).toContain("{!targetProfile && canInstallMobile && (");
    expect(topbarFile).toContain('className="topbar-install-btn hero-install-btn"');
    expect(topbarFile).toContain("onClick={onInstallClick}");
    expect(topbarFile).toContain("<Download size={20} strokeWidth={2.2} />");

    // Stats button & stopPropagation
    expect(topbarFile).toContain("e.stopPropagation()");
    expect(trackerFile).toContain("manualOpen={installPromptOpen}");
    expect(trackerFile).toContain("onManualClose={() => setInstallPromptOpen(false)}");
  });

  it("3. CSS Rules: Hidden on desktop, styled in mobile topbar, and supports experiences mode", () => {
    const globalsCss = readAllStyles();

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

  it("4. PWA vs Mobile Web visibility: stats button shown whenever download button is hidden", () => {
    const globalsCss = readAllStyles();
    const topbarFile = readFile("components/layout/app-topbar.tsx");
    const trackerFile = readTrackerSources();
    const socialFile = readSocialSources();
    const rankingFile = readRankingSources();

    // Stats button is styled for mobile topbar
    expect(globalsCss).toContain(".topbar-stats-btn");

    // CSS hides download button in PWA
    expect(globalsCss).toContain(".is-pwa .topbar-install-btn");

    // Shared topbar conditions stats button when download is not shown, used by all 3 tabs
    expect(topbarFile).toContain("(!canInstallMobile || !!targetProfile) && (targetProfile || myProfile || session)");
    expect(trackerFile).toContain("canInstallMobile={canInstallMobile}");
    expect(socialFile).toContain("canInstallMobile={canInstallMobile}");
    expect(rankingFile).toContain("canInstallMobile={canInstallMobile}");
  });

  it("5. Mobile Web unauthenticated spacing: download icon is tucked tight to Entrar button to prevent mode switch overlap", () => {
    const globalsCss = readAllStyles();
    const topbarFile = readFile("components/layout/app-topbar.tsx");
    const trackerFile = readTrackerSources();
    const socialFile = readSocialSources();
    const rankingFile = readRankingSources();

    // Shared AppTopbar adds topbar-nav--unauth when not logged in and is used across all tabs
    expect(topbarFile).toContain('className={!session && !myProfile ? "topbar-nav--unauth" : undefined}');
    expect(trackerFile).toContain("<AppTopbar");
    expect(socialFile).toContain("<AppTopbar");
    expect(rankingFile).toContain("<AppTopbar");

    // CSS tightens gap to Entrar and eliminates margin-left
    expect(globalsCss).toContain(".topbar-nav--unauth");
    expect(globalsCss).toContain("gap: 6px !important;");
  });

  it("6. Already installed app detection: isPwa is true and is-pwa class added when app is already installed", () => {
    const pwaHookContent = readFile("hooks/use-pwa-install.ts");
    const layoutContent = readFile("app/layout.tsx");

    // Layout inline script checks pwa_app_installed in localStorage to set is-pwa class
    expect(layoutContent).toContain("localStorage.getItem('pwa_app_installed') === 'true'");

    // usePwaInstall sets isPwa to true when standalone or already installed
    expect(pwaHookContent).toContain("const isInstalledOrPwa = standalone || alreadyInstalled;");
    expect(pwaHookContent).toContain("setIsPwa(isInstalledOrPwa);");
  });

  it("7. Viewport guard prevents invisible InstallPrompt scroll lock on desktop/tablet viewports", () => {
    expect(INSTALL_PROMPT_MAX_WIDTH).toBe(768);

    const originalWindow = (globalThis as { window?: unknown }).window;
    try {
      for (const width of [1280, 840, 769]) {
        (globalThis as { window?: { innerWidth: number } }).window = { innerWidth: width };
        expect(canDisplayInstallPrompt()).toBe(false);
      }
      for (const width of [390, 700, 768]) {
        (globalThis as { window?: { innerWidth: number } }).window = { innerWidth: width };
        expect(canDisplayInstallPrompt()).toBe(true);
      }
    } finally {
      if (originalWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window?: unknown }).window = originalWindow;
      }
    }

    const installPromptFile = readFile("components/install-prompt.tsx");
    expect(installPromptFile).toContain("canDisplayInstallPrompt()");
    // Every auto-open & manual-open path and resize handler must respect the viewport guard
    expect(installPromptFile.match(/canDisplayInstallPrompt\(\)/g)?.length).toBeGreaterThanOrEqual(7);
    expect(installPromptFile).toContain('window.addEventListener("resize", handleViewportChange)');

    const modalsCss = readFile("styles/modals.css");
    expect(modalsCss).toMatch(/@media\s*\(min-width:\s*769px\)\s*\{\s*\.install-prompt-overlay\s*\{\s*display:\s*none;\s*\}\s*\}/);
    expect(modalsCss).not.toMatch(/@media\s*\(min-width:\s*701px\)\s*\{\s*\.install-prompt-overlay/);
  });

  it("8. Hardens InstallPrompt cleanup/matchMedia sync and AppTabsShell route/bfcache scroll-lock hygiene", () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    try {
      (globalThis as { window?: unknown }).window = {
        innerWidth: 768,
        matchMedia: (query: string) => ({ matches: query.includes("768px") ? false : true }),
      };
      expect(canDisplayInstallPrompt()).toBe(false);

      (globalThis as { window?: unknown }).window = {
        innerWidth: 800,
        matchMedia: (query: string) => ({ matches: query.includes("768px") }),
      };
      expect(canDisplayInstallPrompt()).toBe(true);
    } finally {
      if (originalWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window?: unknown }).window = originalWindow;
      }
    }

    const installPromptFile = readFile("components/install-prompt.tsx");
    expect(installPromptFile).toContain("closeTimerRef");
    expect(installPromptFile).toContain("clearCloseTimer");
    expect(installPromptFile).toContain('window.addEventListener("orientationchange", handleViewportChange)');
    expect(installPromptFile).toContain("window.matchMedia(`(max-width: ${INSTALL_PROMPT_MAX_WIDTH}px)`)");
    expect(installPromptFile).toContain("if (!showPrompt || !canDisplayInstallPrompt()) return null;");
    expect(installPromptFile).toContain("onWheel={(e) => e.stopPropagation()}");

    const modalsCss = readFile("styles/modals.css");
    expect(modalsCss).toMatch(/\.install-prompt-overlay\s*\{[^}]*overscroll-behavior:\s*contain;/);
    expect(modalsCss).toMatch(/\.install-prompt-overlay--closing\s*\{[^}]*pointer-events:\s*none;/);

    const tabsShellFile = readFile("components/app-tabs-shell.tsx");
    expect(tabsShellFile).toContain('window.addEventListener("pageshow", handlePageShow)');
    expect(tabsShellFile).toMatch(/event\.persisted[\s\S]*resetScrollLock\(\)/);
    expect(tabsShellFile).toMatch(/\}\s*else\s*\{\s*resetScrollLock\(\);[\s\S]*router\.push\(targetPath\);/);
  });
});
