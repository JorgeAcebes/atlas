import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("PWA Install Prompt & Hero Download Button", () => {
  const rootDir = process.cwd();
  const installPromptPath = path.join(rootDir, "components/install-prompt.tsx");
  const trackerPath = path.join(rootDir, "components/summit-tracker.tsx");
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

  it("2. SummitTracker Hero integration: Download button for mobile browser", () => {
    const trackerFile = fs.readFileSync(trackerPath, "utf-8");

    // Imports Download icon and isStandalone
    expect(trackerFile).toContain('import { InstallPrompt, isStandalone } from "./install-prompt"');
    expect(trackerFile).toContain("Download");

    // States for mobile browser and prompt open
    expect(trackerFile).toContain("const [installPromptOpen, setInstallPromptOpen] = useState(false);");
    expect(trackerFile).toContain("const [canInstallMobile, setCanInstallMobile] = useState(false);");

    // Only shown in main map (!targetProfile) and mobile browser (canInstallMobile)
    expect(trackerFile).toContain("{!targetProfile && canInstallMobile && (");
    expect(trackerFile).toContain('className="hero-install-btn"');
    expect(trackerFile).toContain("setInstallPromptOpen(true)");
    expect(trackerFile).toContain("<Download size={17} strokeWidth={2.2} />");

    // Stops propagation on touch and click
    expect(trackerFile).toContain("e.stopPropagation()");

    // Passes manualOpen and onManualClose to InstallPrompt
    expect(trackerFile).toContain("manualOpen={installPromptOpen}");
    expect(trackerFile).toContain("onManualClose={() => setInstallPromptOpen(false)}");
  });

  it("3. CSS Rules: Hidden on desktop, styled on mobile and supports experiences mode", () => {
    const globalsCss = fs.readFileSync(globalsCssPath, "utf-8");

    // Hidden on desktop by default
    expect(globalsCss).toMatch(/\.hero-install-btn\s*\{[^}]*display:\s*none;/);

    // Positioned at top left of hero in mobile
    expect(globalsCss).toContain(".hero-install-btn {");
    expect(globalsCss).toContain("top: 12px;");
    expect(globalsCss).toContain("left: 14px;");

    // Experiences dark mode styling
    expect(globalsCss).toContain(".mode-experiences .hero-install-btn");
  });
});
