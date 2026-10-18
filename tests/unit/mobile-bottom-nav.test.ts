import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Mobile Bottom Navigation (Tab Bar)", () => {
  const rootDir = path.resolve(__dirname, "../..");

  it("1. Component structure: MobileBottomNav has 3 tabs (Mapa, Social, Ranking) with icons and labels", () => {
    const navFile = fs.readFileSync(path.join(rootDir, "components/mobile-bottom-nav.tsx"), "utf-8");

    // Has Map, Users, Trophy icons
    expect(navFile).toContain("Map");
    expect(navFile).toContain("Users");
    expect(navFile).toContain("Trophy");

    // Has 3 labels
    expect(navFile).toContain('<span className="mobile-bottom-nav-label">Mapa</span>');
    expect(navFile).toContain('<span className="mobile-bottom-nav-label">Social</span>');
    expect(navFile).toContain('<span className="mobile-bottom-nav-label">Ranking</span>');

    // Accessibility attributes
    expect(navFile).toContain('aria-label="Navegación principal inferior"');
    expect(navFile).toContain('aria-label="Mapa"');
    expect(navFile).toContain('aria-label="Social"');
    expect(navFile).toContain('aria-label="Ranking"');
    expect(navFile).toContain('aria-current=');

    // Pending requests badge on social
    expect(navFile).toContain("mobile-bottom-nav-badge");
    expect(navFile).toContain("hasPendingRequests");
  });

  it("2. AppTabsShell integration: AppTabsShell renders MobileBottomNav", () => {
    const shellFile = fs.readFileSync(path.join(rootDir, "components/app-tabs-shell.tsx"), "utf-8");

    expect(shellFile).toContain('import { MobileBottomNav } from "@/components/mobile-bottom-nav";');
    expect(shellFile).toContain("<MobileBottomNav");
    expect(shellFile).toContain("activeTab={activeTab}");
    expect(shellFile).toContain("mode={sharedMode}");
    expect(shellFile).toContain("experiencesMode={sharedExperiencesMode}");
    expect(shellFile).toContain("onNavigate={handleNavigate}");
  });

  it("3. CSS Rules: Mobile only display (<=768px), desktop hidden, topbar uncluttered", () => {
    const globalsCss = fs.readFileSync(path.join(rootDir, "app/globals.css"), "utf-8");

    // Hidden on desktop by default
    expect(globalsCss).toMatch(/\.mobile-bottom-nav\s*\{[^}]*display:\s*none;/);

    // Shown on mobile (<=768px)
    expect(globalsCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.mobile-bottom-nav\s*\{[^}]*display:\s*flex;/);
    expect(globalsCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.mobile-bottom-nav\s*\{[^}]*position:\s*fixed;/);
    expect(globalsCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.mobile-bottom-nav\s*\{[^}]*bottom:\s*0;/);

    // Hides topbar links on mobile
    expect(globalsCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.topbar\s+nav\s+\.topbar-nav-link\s*\{[^}]*display:\s*none\s*!important;/);

    // Bottom clearance for footer and content
    expect(globalsCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.site-footer\s*\{[^}]*padding-bottom:\s*calc\(/);
    expect(globalsCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.page-container\s*\{[^}]*padding-bottom:\s*calc\(/);

    // Theming support
    expect(globalsCss).toContain(".mobile-bottom-nav.mode-peaks");
    expect(globalsCss).toContain(".mobile-bottom-nav.mode-countries");
    expect(globalsCss).toContain(".mobile-bottom-nav.mode-experiences");

    // Full width and zero margins to prevent gap on right edge
    expect(globalsCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.mobile-bottom-nav\s*\{[^}]*width:\s*100vw\s*!important;/);
    expect(globalsCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.mobile-bottom-nav\s*\{[^}]*margin:\s*0\s*!important;/);
    expect(globalsCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.mobile-bottom-nav\s*\{[^}]*gap:\s*0\s*!important;/);
    expect(globalsCss).toContain(".mobile-bottom-nav a::after");
  });

  it("4. Option 1B: Compact mode switch in sticky topbar on mobile and elimination of redundant hero switch on mobile", () => {
    const globalsCss = fs.readFileSync(path.join(rootDir, "app/globals.css"), "utf-8");
    const trackerContent = fs.readFileSync(path.join(rootDir, "components/summit-tracker.tsx"), "utf-8");
    const socialContent = fs.readFileSync(path.join(rootDir, "components/social-tab.tsx"), "utf-8");
    const rankingContent = fs.readFileSync(path.join(rootDir, "components/ranking-tab.tsx"), "utf-8");

    // Topbar mode switch is available on mobile in all three components (no hide-on-mobile in topbar)
    expect(trackerContent).toMatch(/<div className=\{`app-mode-switch \$\{isPeaks \? "app-mode-switch--peaks"/);
    expect(socialContent).toMatch(/<div className=\{`app-mode-switch \$\{currentMode === "peaks"/);
    expect(rankingContent).toMatch(/<div className=\{`app-mode-switch \$\{mode === "peaks"/);

    // CSS maintains balanced, refined pill styling on mobile
    expect(globalsCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.topbar\s+\.app-mode-switch\s+\.app-mode-btn\s*\{[^}]*font-size:\s*12px\s*!important;/);
    expect(globalsCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.topbar\s+\.app-mode-switch\s+\.app-mode-btn\s*\{[^}]*padding:\s*4\.5px\s+10px\s*!important;/);

    // Hero height is adapted on mobile and tablet (76px and 84px respectively)
    expect(globalsCss).toMatch(/@media\s*\(max-width:\s*700px\)[\s\S]*?\.hero\s*\{[^}]*height:\s*76px\s*!important;/);
    expect(globalsCss).toMatch(/@media\s*\(min-width:\s*701px\)\s+and\s+\(max-width:\s*1023px\)[\s\S]*?\.hero\s*\{[^}]*height:\s*84px\s*!important;/);

    // Redundant hero mode switch on mobile is suppressed to save vertical hero space
    expect(globalsCss).toMatch(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.hero\s+\.app-mode-switch\.hide-on-desktop\s*\{[^}]*display:\s*none\s*!important;/);
  });

  it("5. Ranking Tab Theming: Bottom nav stays in standard color on ranking tab unless viewing another user's experiences", () => {
    const navFile = fs.readFileSync(path.join(rootDir, "components/mobile-bottom-nav.tsx"), "utf-8");

    // Tracks bodyHasExperiences with MutationObserver
    expect(navFile).toContain("bodyHasExperiences");
    expect(navFile).toContain("MutationObserver");

    // Ranking on main route is strictly non-experiences (standard colors)
    expect(navFile).toContain('activeTab === "ranking" && isMainRoute');
    expect(navFile).toMatch(/activeTab === "ranking" && isMainRoute\s*\?\s*false/);

    // Visiting another user's profile from ranking enables mode-experiences only if they have experiences
    expect(navFile).toMatch(/activeTab === "ranking" && !isMainRoute\s*\?\s*bodyHasExperiences/);
  });
});

