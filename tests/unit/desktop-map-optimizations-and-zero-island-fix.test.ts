import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { isMobileOrTablet } from "@/lib/device-utils";

describe("Desktop Map Rendering Optimization & Spain Map 0,0 Zero-Island Prevention", () => {
  const rootDir = process.cwd();

  describe("Device Detection (isMobileOrTablet)", () => {
    afterEach(() => {
      delete (globalThis as any).window;
    });

    it("identifies desktop web when screen width is > 1024 and no mobile UA is present", () => {
      (globalThis as any).window = { innerWidth: 1440 };
      try {
        Object.defineProperty(navigator, "userAgent", {
          value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          configurable: true,
        });
        Object.defineProperty(navigator, "maxTouchPoints", {
          value: 0,
          configurable: true,
        });
      } catch {}

      expect(isMobileOrTablet()).toBe(false);
    });

    it("identifies mobile/tablet when screen width <= 1024", () => {
      (globalThis as any).window = { innerWidth: 768 };
      expect(isMobileOrTablet()).toBe(true);

      (globalThis as any).window = { innerWidth: 390 };
      expect(isMobileOrTablet()).toBe(true);
    });

    it("identifies mobile/tablet when touch UA is detected even on wider screens", () => {
      (globalThis as any).window = { innerWidth: 1200 };
      try {
        Object.defineProperty(navigator, "userAgent", {
          value: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
          configurable: true,
        });
        Object.defineProperty(navigator, "maxTouchPoints", {
          value: 5,
          configurable: true,
        });
      } catch {}

      expect(isMobileOrTablet()).toBe(true);
    });

    it("returns false if window is undefined (SSR safety)", () => {
      delete (globalThis as any).window;
      expect(isMobileOrTablet()).toBe(false);
    });
  });

  describe("Spain Map 0,0 Zero-Island Prevention", () => {
    const spainMapContent = fs.readFileSync(path.join(rootDir, "components/spain-map.tsx"), "utf-8");

    it("FitSpain uses requestAnimationFrame retry loop to wait until container has non-zero client dimensions", () => {
      expect(spainMapContent).toContain("let attempts = 0;");
      expect(spainMapContent).toContain("const tryFit = () => {");
      expect(spainMapContent).toContain("if (container && container.clientWidth > 0 && container.clientHeight > 0) {");
      expect(spainMapContent).toContain("rafId = requestAnimationFrame(tryFit);");
    });

    it("FitSpain calls map.invalidateSize before fitBounds so Leaflet internal _size matches real dimensions", () => {
      expect(spainMapContent).toContain("hasFittedRef.current = true;");
      expect(spainMapContent).toContain("map.invalidateSize({ animate: false, pan: false });");
      expect(spainMapContent).toContain("map.fitBounds(");
    });

    it("FitSpain validates sessionStorage coordinates to ensure they fall within Spain bounds and rejects 0,0", () => {
      expect(spainMapContent).toMatch(/center\.lat\s*>=\s*26\s*&&\s*center\.lat\s*<=\s*45/);
      expect(spainMapContent).toMatch(/center\.lng\s*>=\s*-20\s*&&\s*center\.lng\s*<=\s*6/);
    });

    it("MapActiveSynchronizer detects out-of-bounds or 0,0 center and recovers to Spain bounds", () => {
      expect(spainMapContent).toContain("isValidSpainCenter");
      expect(spainMapContent).toMatch(/if\s*\(isValidSpainCenter\s*&&\s*Number\.isFinite\(prevZoom\)\s*&&\s*prevZoom\s*>=\s*4\)/);
      expect(spainMapContent).toContain("map.setView(prevCenter, prevZoom, { animate: false });");
      expect(spainMapContent).toContain("map.fitBounds(");
    });

    it("MapZoomListener ensures coordinates are inside Spain before saving to sessionStorage", () => {
      expect(spainMapContent).toMatch(/sessionStorage\.setItem\("mapState_spain"/);
      expect(spainMapContent).toMatch(/center\.lat\s*>=\s*26\s*&&\s*center\.lat\s*<=\s*45/);
    });
  });

  describe("Desktop Web Reduced Pre-load & Adaptive Buffers", () => {
    it("spain-map.tsx uses 0.5 padding on web desktop and 2.0 on mobile/tablet", () => {
      const spainMapContent = fs.readFileSync(path.join(rootDir, "components/spain-map.tsx"), "utf-8");
      expect(spainMapContent).toContain("isMobile ? L.canvas({ padding: 2.0 }) : L.canvas({ padding: 0.5 })");
      expect(spainMapContent).toContain("keepBuffer={isMobileOrTablet() ? 16 : 4}");
      expect(spainMapContent).toContain("updateInterval={isMobileOrTablet() ? 100 : 150}");
    });

    it("world-map.tsx uses 0.5 padding on web desktop and 3.5 on mobile/tablet", () => {
      const worldMapContent = fs.readFileSync(path.join(rootDir, "components/world-map.tsx"), "utf-8");
      expect(worldMapContent).toContain("isMobile ? L.canvas({ padding: 3.5 }) : L.canvas({ padding: 0.5 })");
      expect(worldMapContent).toContain("keepBuffer={isMobileOrTablet() ? 32 : 4}");
      expect(worldMapContent).toContain("updateInterval={isMobileOrTablet() ? 50 : 150}");
    });

    it("collective-map.tsx uses 0.5 padding on web desktop and 3.5 on mobile/tablet", () => {
      const collectiveMapContent = fs.readFileSync(path.join(rootDir, "components/collective-map.tsx"), "utf-8");
      expect(collectiveMapContent).toContain("isMobile ? L.canvas({ padding: 3.5 }) : L.canvas({ padding: 0.5 })");
      expect(collectiveMapContent).toContain("keepBuffer={isMobileOrTablet() ? 32 : 4}");
      expect(collectiveMapContent).toContain("updateInterval={isMobileOrTablet() ? 50 : 150}");
    });
  });
});
