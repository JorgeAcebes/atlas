import { describe, it, expect, afterEach } from "vitest";
import { isMobileOrTablet } from "@/lib/device-utils";
import { readFile, readMapSources } from "@/tests/utils/source-reader";

describe("Desktop Map Rendering Optimization & Spain Map 0,0 Zero-Island Prevention", () => {

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
    const spainMapContent = readMapSources();

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
      expect(spainMapContent).toContain('storageKey !== "mapState_spain"');
      expect(spainMapContent).toContain("sessionStorage.setItem(storageKey");
      expect(spainMapContent).toMatch(/center\.lat\s*>=\s*26\s*&&\s*center\.lat\s*<=\s*45/);
    });
  });

  describe("Desktop Web Continuous Tile Streaming & Adaptive Canvas Performance", () => {
    it("spain-map.tsx streams tiles continuously during drag, uses adaptive canvas renderer/keepBuffer, and enables scrollWheelZoom={true}", () => {
      const spainMapContent = readFile("components/spain-map.tsx");
      const patchContent = readFile("lib/leaflet-canvas-patch.ts");
      expect(spainMapContent).toContain('createAdaptiveCanvasRenderer("spain")');
      expect(spainMapContent).toContain("keepBuffer={keepBuffer}");
      expect(patchContent).toContain("export function getAdaptiveKeepBuffer");
      expect(spainMapContent).toContain("updateInterval={100}");
      expect(spainMapContent).toContain("updateWhenIdle={false}");
      expect(spainMapContent).toContain("scrollWheelZoom={true}");
      expect(spainMapContent).toContain("zoomSnap={1}");
      expect(spainMapContent).toContain("updateWhenZooming={isMobileOrTablet() ? undefined : false}");
      expect(spainMapContent).not.toContain("if (!isMobileOrTablet()) return;");
    });

    it("world-map.tsx streams tiles continuously during drag, uses adaptive canvas renderer/keepBuffer, and enables scrollWheelZoom={true}", () => {
      const worldMapContent = readFile("components/world-map.tsx");
      const patchContent = readFile("lib/leaflet-canvas-patch.ts");
      expect(worldMapContent).toContain('createAdaptiveCanvasRenderer("world")');
      expect(worldMapContent).toContain("keepBuffer={keepBuffer}");
      expect(patchContent).toContain("return isMobileOrTablet() ? 4 : 3;");
      expect(worldMapContent).toContain("updateInterval={50}");
      expect(worldMapContent).toContain("updateWhenIdle={false}");
      expect(worldMapContent).toContain("scrollWheelZoom={true}");
      expect(worldMapContent).toContain("zoomSnap={isCompactMobile ? 0.5 : 1}");
      expect(worldMapContent).toContain("updateWhenZooming={isMobileOrTablet() ? undefined : false}");
      expect(worldMapContent).not.toContain("if (!isMobileOrTablet()) return;");
    });

    it("collective-map.tsx streams tiles continuously during drag and enables scrollWheelZoom={true} on desktop", () => {
      const collectiveMapContent = readFile("components/collective-map.tsx");
      expect(collectiveMapContent).toContain('createAdaptiveCanvasRenderer("collective")');
      expect(collectiveMapContent).toContain("keepBuffer={keepBuffer}");
      expect(collectiveMapContent).toContain("updateInterval={50}");
      expect(collectiveMapContent).toContain("updateWhenIdle={false}");
      expect(collectiveMapContent).toContain("scrollWheelZoom={true}");
      expect(collectiveMapContent).toContain("updateWhenZooming={isMobileOrTablet() ? undefined : false}");
    });
  });
});
