import { describe, it, expect } from "vitest";
import { readFile, readMapSources } from "@/tests/utils/source-reader";

describe("Map Hover Intent Debounce & Responsive Fast Zoom Optimizations", () => {
  describe("1. Native Wheel Zoom & Canvas Redraw Shield (lib/leaflet-canvas-patch.ts)", () => {
    const patchContent = readFile("lib/leaflet-canvas-patch.ts");
    const mapSources = readMapSources();

    it("removes legacy JS-hijacking smooth wheel zoom in favor of crisp native Leaflet scrollWheelZoom", () => {
      expect(mapSources).not.toContain("leaflet-smooth-wheel-zoom");
      expect(mapSources).toContain("scrollWheelZoom={true}");
      expect(mapSources).toContain("zoomSnap={1}");
      expect(mapSources).toContain("wheelPxPerZoomLevel={60}");
    });

    it("uses per-instance adaptive canvas renderer without mutating L.Canvas.prototype.options.padding", () => {
      expect(patchContent).toContain("export function createAdaptiveCanvasRenderer");
      expect(patchContent).toContain("export function getAdaptiveKeepBuffer");
      expect(patchContent).toContain("return L.canvas({ padding });");
      expect(patchContent).not.toMatch(/L\.Canvas\.prototype\.options\.padding\s*=/);
    });

    it("guards Canvas redraws and hover checks during active zoom animations and pinch zoom", () => {
      expect(patchContent).toContain("proto._atlasMovePatched = true;");
      expect(patchContent).toContain("if (this._map?._isWheeling || this._isZooming || this._map?._animatingZoom) return;");
      expect(patchContent).toContain("this._isZooming = true;");
      expect(patchContent).toContain("this._isZooming = false;");
      expect(patchContent).toContain("cancelAnimationFrame(ctx._moveRaf);");
    });

    it("applies polyline smoothing and triggers a single clean redraw on zoomend", () => {
      expect(patchContent).toContain("L.Polyline.prototype.options.smoothFactor = 1.2;");
      expect(patchContent).toContain("originalOnZoomEnd.call(this);");
    });
  });

  describe("2. World Map Hover Intent Debounce & Eager TopoJSON Loading (world-map.tsx)", () => {
    const content = readMapSources();
    const worldContent = readFile("components/world-map.tsx");

    it("eagerly triggers fetchWorldGeo upon client module evaluation", () => {
      expect(worldContent).toContain('if (typeof window !== "undefined") {');
      expect(worldContent).toContain("fetchWorldGeo().catch(() => {});");
    });

    it("detaches Leaflet's default immediate 0ms _openTooltip so hover intent controls tooltip display", () => {
      expect(worldContent).toContain('pathLayer.off("mouseover", (pathLayer as any)._openTooltip);');
    });

    it("debounces mouseover with 80ms hover intent to prevent canvas redraw thrashing on fast sweeps", () => {
      expect(worldContent).toContain("hoverTimeoutRef.current = setTimeout(() => {");
      expect(worldContent).toContain("currentHoveredIdRef.current = country.id;");
      expect(worldContent).toContain("pathLayer.openTooltip(latlng);");
      expect(worldContent).toContain("}, 80);");
    });

    it("cancels pending hover intent on mouseout, drag, or zoom without triggering redraws", () => {
      expect(worldContent).toContain("if (hoverTimeoutRef.current) {");
      expect(worldContent).toContain("clearTimeout(hoverTimeoutRef.current);");
      expect(worldContent).toContain("safeCloseTooltip(pathLayer);");
      expect(worldContent).toContain("clearHoverState");
    });

    it("computes largest polygon bounds once during search item memoization via geo-loader helper", () => {
      expect(worldContent).toContain("getLargestPolygonBounds");
      expect(worldContent).toContain("featureMap.set(country.id, f);");
      expect(content).toContain("export function getLargestPolygonBounds");
    });

    it("clears hover state on movestart and zoomstart", () => {
      expect(worldContent).toContain("onInteractionStart={clearHoverState}");
      expect(content).toContain("onInteractionStartRef.current?.();");
    });

    it("shields Canvas prototype _onMouseMove during wheeling and zooming", () => {
      expect(content).toContain("if (this._map?._isWheeling || this._isZooming || this._map?._animatingZoom) return;");
    });

    it("fits all inhabited continents comfortably on desktop web so the whole map is well visible", () => {
      expect(content).toContain("[-60, -180]");
      expect(content).toContain("[78, 180]");
      expect(content).toContain("{ padding: [24, 24], animate: false }");
    });
  });

  describe("3. Spain Map Hover Intent Debounce & Eager TopoJSON Loading (spain-map.tsx)", () => {
    const content = readMapSources();
    const spainContent = readFile("components/spain-map.tsx");

    it("eagerly triggers fetchSpainGeo upon client module evaluation", () => {
      expect(spainContent).toContain('if (typeof window !== "undefined") {');
      expect(spainContent).toContain("fetchSpainGeo().catch(() => {});");
    });

    it("detaches Leaflet's default immediate 0ms _openTooltip so hover intent controls tooltip display", () => {
      expect(spainContent).toContain('pathLayer.off("mouseover", (pathLayer as any)._openTooltip);');
    });

    it("debounces mouseover with 80ms hover intent to prevent canvas redraw thrashing on fast sweeps", () => {
      expect(spainContent).toContain("hoverTimeoutRef.current = setTimeout(() => {");
      expect(spainContent).toContain("currentHoveredCodeRef.current = peak.code;");
      expect(spainContent).toContain("pathLayer.openTooltip(latlng);");
      expect(spainContent).toContain("}, 80);");
    });

    it("cancels pending hover intent on mouseout, drag, or zoom without triggering redraws", () => {
      expect(spainContent).toContain("if (hoverTimeoutRef.current) {");
      expect(spainContent).toContain("clearTimeout(hoverTimeoutRef.current);");
      expect(spainContent).toContain("safeCloseTooltip(pathLayer);");
      expect(spainContent).toContain("clearHoverState");
    });

    it("uses pure numeric coordinate boundary calculation instead of instantiating L.geoJSON layers", () => {
      expect(spainContent).toContain("function getFeaturesBounds(");
      expect(spainContent).not.toMatch(/searchItems[\s\S]*?L\.geoJSON\(relatedFeatures/);
      expect(spainContent).toContain("featuresByCode.set(code, f);");
    });

    it("clears hover state on movestart and zoomstart", () => {
      expect(spainContent).toContain("onInteractionStart={clearHoverState}");
      expect(content).toContain("onInteractionStartRef.current?.();");
    });

    it("shields Canvas prototype _onMouseMove during wheeling and zooming", () => {
      expect(content).toContain("if (this._map?._isWheeling || this._isZooming || this._map?._animatingZoom) return;");
    });
  });

  describe("4. Collective Map Hover Intent Debounce (collective-map.tsx)", () => {
    const content = readMapSources();
    const collectiveContent = readFile("components/collective-map.tsx");

    it("detaches immediate _openTooltip for both peaks and countries via attachInteractiveHandlers", () => {
      expect(collectiveContent).toContain('pathLayer.off("mouseover", (pathLayer as any)._openTooltip);');
      expect(collectiveContent).toMatch(/onEachFeature[\s\S]*?if\s*\(isPeaks\)[\s\S]*?attachInteractiveHandlers[\s\S]*?else[\s\S]*?attachInteractiveHandlers/);
    });

    it("debounces hover with 80ms timer and cancels on mouseout or interaction", () => {
      expect(collectiveContent).toContain("hoverTimeoutRef.current = setTimeout(() => {");
      expect(collectiveContent).toContain("clearHoverState");
    });

    it("shields Canvas prototype _onMouseMove during wheeling and zooming", () => {
      expect(content).toContain("if (this._map?._isWheeling || this._isZooming || this._map?._animatingZoom) return;");
    });
  });
});
