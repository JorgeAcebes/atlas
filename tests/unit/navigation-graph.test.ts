import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Navigation Graph & History Stack Invariants (Opciones A y B)", () => {
  const rootDir = process.cwd();
  const shellFile = fs.readFileSync(path.join(rootDir, "components/app-tabs-shell.tsx"), "utf-8");
  const trackerFile = fs.readFileSync(path.join(rootDir, "components/summit-tracker.tsx"), "utf-8");

  describe("Opción A: Limpieza de subniveles al navegar entre pestañas principales", () => {
    it("should clean existing hash with replaceState before pushing a new tab route", () => {
      // When navigating away from a tab with an open modal/hash, cleanUrl replaceState must happen before pushState
      expect(shellFile).toMatch(
        /if\s*\(window\.location\.hash\s*&&\s*window\.location\.hash\s*!==\s*"#"\)\s*\{[\s\S]*?window\.history\.replaceState\(null,\s*"",\s*cleanUrl\);/
      );
    });

    it("should clean hash with replaceState and emit hashchange when clicking the active tab", () => {
      // Clicking the already active tab with an open panel/hash resets it cleanly without polluting history
      expect(shellFile).toMatch(
        /if\s*\(tab\s*===\s*prevTab\s*&&\s*isMainRoute\)\s*\{[\s\S]*?window\.history\.replaceState\(null,\s*"",\s*cleanUrl\);[\s\S]*?window\.dispatchEvent\(new Event\("hashchange"\)\);/
      );
    });
  });

  describe("Opción B: Evitar apilamiento lineal de hermanos y desapilar al cerrar", () => {
    it("should use replaceState when opening a sibling panel if a panel is already open", () => {
      // openInformation must replaceState for sibling panels instead of infinite pushState
      expect(trackerFile).toMatch(
        /openInformation\s*=\s*useCallback\([\s\S]*?if\s*\(panelPushedRef\.current\s*\|\|\s*window\.location\.hash\.startsWith\("#panel"\)\)\s*\{[\s\S]*?window\.history\.replaceState\(\{ hasPanel: true \},\s*"",\s*targetHash\);[\s\S]*?\} else \{[\s\S]*?window\.history\.pushState\(\{ hasPanel: true \},\s*"",\s*targetHash\);/
      );
    });

    it("should use history.back() in closePanel when the panel was pushed, avoiding duplicate clean entries", () => {
      // closePanel must invoke history.back() when wasPushed is true
      expect(trackerFile).toMatch(
        /const wasPushed = panelPushedRef\.current;[\s\S]*?if\s*\(fromStats\)\s*\{[\s\S]*?window\.history\.back\(\);[\s\S]*?\}\s*else if\s*\(wasPushed\)\s*\{[\s\S]*?window\.history\.back\(\);[\s\S]*?\}/
      );
    });

    it("should use replaceState in scrollToMap instead of pushState to prevent ghost back-steps", () => {
      expect(trackerFile).toMatch(
        /scrollToMap\s*=\s*useCallback\([\s\S]*?window\.history\.replaceState\(null,\s*"",\s*"#mapa"\);/
      );
    });

    it("should use replaceState on Atlas brand click instead of pushState", () => {
      expect(trackerFile).toMatch(
        /className="brand"[\s\S]*?if\s*\(window\.location\.hash\)\s*\{[\s\S]*?window\.history\.replaceState\(null,\s*"",/
      );
    });
  });
});
