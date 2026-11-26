import fs from "fs";
import path from "path";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import type { FeatureCollection } from "geojson";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile } from "@/tests/utils/source-reader";

describe("Peaks Zoom Resilience, Pinch Performance & First-Time Map Focus Scroll", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalDocument = (globalThis as { document?: unknown }).document;
  const originalNavigator = (globalThis as { navigator?: unknown }).navigator;
  const originalRaf = (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
  const originalCaf = (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();

    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
    if (originalDocument === undefined) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      (globalThis as { document?: unknown }).document = originalDocument;
    }
    if (originalNavigator !== undefined) {
      try {
        Object.defineProperty(globalThis, "navigator", {
          value: originalNavigator,
          configurable: true,
        });
      } catch {
        /* ignore */
      }
    }
    if (originalRaf === undefined) {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    } else {
      (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = originalRaf;
    }
    if (originalCaf === undefined) {
      delete (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame;
    } else {
      (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = originalCaf;
    }
  });

  function setupMockLeaflet() {
    const focusedCalls: Array<FocusOptions | undefined> = [];
    const scrollToSpy = vi.fn();
    const rootStyle: Record<string, string> = { scrollBehavior: "smooth" };

    (globalThis as any).window = {
      innerWidth: 390,
      scrollX: 0,
      scrollY: 240,
      scrollTo: scrollToSpy,
    };
    (globalThis as any).document = {
      documentElement: {
        scrollLeft: 0,
        scrollTop: 240,
        style: rootStyle,
      },
    };
    (globalThis as any).requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    (globalThis as any).cancelAnimationFrame = vi.fn();

    const makePoint = (x: number, y: number) => ({
      x,
      y,
      add(other: any) {
        return makePoint(x + other.x, y + other.y);
      },
      divideBy(n: number) {
        return makePoint(x / n, y / n);
      },
      subtract(other: any) {
        return makePoint(x - other.x, y - other.y);
      },
      distanceTo(other: any) {
        return Math.hypot(x - other.x, y - other.y);
      },
    });

    const originalTouchStart = vi.fn(function (this: any, _e?: any) {
      this._zooming = true;
      this._moved = false;
      this._startDist = 0;
      this._startZoom = 5;
      this._centerPoint = makePoint(195, 210);
      this._startLatLng = { lat: 40.4, lng: -3.7 };
      this._pinchStartLatLng = { lat: 40.4, lng: -3.7 };
    });

    const originalTouchEnd = vi.fn(function (this: any) {
      this._zooming = false;
      this._map._animateZoom(this._center, this._map._limitZoom(this._zoom), true, 1);
    });

    const originalGridOnMoveEnd = vi.fn();
    const originalGridSetView = vi.fn();
    const originalGridUpdate = vi.fn();

    const mockL = {
      Polyline: { prototype: { options: { smoothFactor: 1 } } },
      Canvas: {
        prototype: {
          getEvents: () => ({}),
          _onMouseMove: vi.fn(),
        },
      },
      canvas: vi.fn((opts: any) => ({ options: opts })),
      latLng: (lat: number, lng: number) => ({ lat, lng }),
      Util: {
        bind: (fn: (...args: any[]) => any, ctx: any, ...args: any[]) => () => fn.apply(ctx, args),
        requestAnimFrame: (fn: () => void) => {
          fn();
          return 10;
        },
        cancelAnimFrame: vi.fn(),
      },
      DomEvent: {
        preventDefault: vi.fn(),
      },
      Map: {
        Keyboard: {
          prototype: {
            _onMouseDown: vi.fn(),
          },
        },
        TouchZoom: {
          prototype: {
            _onTouchStart: originalTouchStart,
            _onTouchMove: vi.fn((..._args: any[]) => undefined),
            _onTouchEnd: originalTouchEnd,
          },
        },
      },
      GridLayer: {
        prototype: {
          _onMoveEnd: originalGridOnMoveEnd,
          _setView: originalGridSetView,
          _update: originalGridUpdate,
        },
      },
    };

    return {
      mockL,
      focusedCalls,
      scrollToSpy,
      originalGridOnMoveEnd,
      originalGridSetView,
      originalGridUpdate,
      makePoint,
      recordFocus: (opts?: FocusOptions) => focusedCalls.push(opts),
    };
  }

  it("1. ensureLeafletCanvasPatched prevents Keyboard._onMouseDown smooth-scroll hijack on first map click/tap", async () => {
    const { mockL, scrollToSpy, focusedCalls, recordFocus } = setupMockLeaflet();
    vi.doMock("leaflet", () => ({ default: mockL }));

    const { ensureLeafletCanvasPatched } = await import("@/lib/leaflet-canvas-patch");
    ensureLeafletCanvasPatched();

    const focusSpy = vi.fn((opts?: FocusOptions) => recordFocus(opts));
    const keyboardCtx = {
      _focused: false,
      _map: {
        _container: { focus: focusSpy },
      },
    };

    mockL.Map.Keyboard.prototype._onMouseDown.call(keyboardCtx);
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(focusedCalls).toEqual([{ preventScroll: true }]);
    // Must not call window.scrollTo(left, top) when scroll position did not change
    expect(scrollToSpy).not.toHaveBeenCalled();

    // If a browser ignores preventScroll and jumps viewport, restore instantaneously (scrollBehavior="auto")
    const jumpFocusSpy = vi.fn(() => {
      (globalThis as any).window.scrollY = 480;
    });
    mockL.Map.Keyboard.prototype._onMouseDown.call({
      _focused: false,
      _map: { _container: { focus: jumpFocusSpy } },
    });
    expect(scrollToSpy).toHaveBeenCalledWith(0, 240);
    expect((globalThis as any).document.documentElement.style.scrollBehavior).toBe("smooth");
  });

  it("2. TouchZoom patch clamps extreme pinch-out zoom, guards startDist=0, and clamps center within maxBounds", async () => {
    const { mockL, makePoint } = setupMockLeaflet();
    vi.doMock("leaflet", () => ({ default: mockL }));

    const { ensureLeafletCanvasPatched } = await import("@/lib/leaflet-canvas-patch");
    ensureLeafletCanvasPatched();

    const moveSpy = vi.fn();
    const moveStartSpy = vi.fn();
    const animateZoomSpy = vi.fn();
    const spainBounds = [
      [26.0, -19.8],
      [47.5, 11.0],
    ];

    const map = {
      options: {
        bounceAtZoomLimits: false,
        maxBounds: spainBounds,
        maxBoundsViscosity: 0.5,
        zoomSnap: 1,
      },
      mouseEventToContainerPoint: (t: any) => makePoint(t.clientX, t.clientY),
      getScaleZoom: (scale: number, fromZoom: number) => fromZoom + Math.log2(scale),
      getMinZoom: () => 5,
      getMaxZoom: () => 10,
      getZoom: () => 5,
      getCenter: () => ({ lat: 40.4, lng: -3.7 }),
      project: (latLng: any, zoom: number) =>
        makePoint(latLng.lng * Math.pow(2, zoom), latLng.lat * Math.pow(2, zoom)),
      unproject: (pt: any, zoom: number) => {
        if (zoom < -100) return { lat: Number.NaN, lng: Number.NaN };
        return { lat: pt.y / Math.pow(2, zoom), lng: pt.x / Math.pow(2, zoom) };
      },
      _limitZoom: (z: number) => Math.min(10, Math.max(5, Math.round(z))),
      _limitCenter: (c: any) => ({
        lat: Math.min(47.5, Math.max(26.0, c.lat)),
        lng: Math.min(11.0, Math.max(-19.8, c.lng)),
      }),
      _moveStart: moveStartSpy,
      _move: moveSpy,
      _animateZoom: animateZoomSpy,
    };

    const touchZoomCtx: any = { _map: map };
    mockL.Map.TouchZoom.prototype._onTouchStart.call(touchZoomCtx, {});
    expect(touchZoomCtx._startDist).toBeGreaterThanOrEqual(8);

    // Collapsing two fingers to the exact same pixel (dist = 0) must not produce -Infinity or NaN
    mockL.Map.TouchZoom.prototype._onTouchMove.call(touchZoomCtx, {
      touches: [
        { clientX: 195, clientY: 210 },
        { clientX: 195, clientY: 210 },
      ],
    });

    expect(touchZoomCtx._zoom).toBe(5);
    expect(Number.isFinite(touchZoomCtx._zoom)).toBe(true);
    expect(Number.isFinite(touchZoomCtx._center.lat)).toBe(true);
    expect(Number.isFinite(touchZoomCtx._center.lng)).toBe(true);
    expect(moveStartSpy).toHaveBeenCalledTimes(1);
    expect(moveSpy).toHaveBeenCalled();

    // Out-of-bounds center must be clamped to maxBounds on touch end
    touchZoomCtx._center = { lat: 5.0, lng: -45.0 };
    touchZoomCtx._zoom = 2;
    mockL.Map.TouchZoom.prototype._onTouchEnd.call(touchZoomCtx);

    expect(animateZoomSpy).toHaveBeenCalledTimes(1);
    const [endCenter, endZoom] = animateZoomSpy.mock.calls[0];
    expect(endZoom).toBe(5);
    expect(endCenter.lat).toBeGreaterThanOrEqual(26.0);
    expect(endCenter.lng).toBeGreaterThanOrEqual(-19.8);
  });

  it("3. GridLayer patch suppresses mid-pinch tile teardown and prevents infinite-tile crash", async () => {
    const { mockL, originalGridOnMoveEnd, originalGridSetView, originalGridUpdate, makePoint } =
      setupMockLeaflet();
    vi.doMock("leaflet", () => ({ default: mockL }));

    const { ensureLeafletCanvasPatched } = await import("@/lib/leaflet-canvas-patch");
    ensureLeafletCanvasPatched();

    const setZoomTransformsSpy = vi.fn();
    const gridCtx: any = {
      _tileZoom: 8,
      _setZoomTransforms: setZoomTransformsSpy,
      _clampZoom: (z: number) => z,
      _getTiledPixelBounds: vi.fn(),
      _pxBoundsToTileRange: vi.fn(),
      _map: {
        _animatingZoom: false,
        touchZoom: { _zooming: true },
        getZoom: () => 5,
        getCenter: () => ({ lat: 40.4, lng: -3.7 }),
      },
    };

    // During active pinch-zoom, _onMoveEnd, _setView tile rebuilds, and _update must be skipped
    mockL.GridLayer.prototype._onMoveEnd.call(gridCtx);
    expect(originalGridOnMoveEnd).not.toHaveBeenCalled();

    mockL.GridLayer.prototype._setView.call(gridCtx, { lat: 40.4, lng: -3.7 }, 5, false, false);
    expect(originalGridSetView).not.toHaveBeenCalled();
    expect(setZoomTransformsSpy).toHaveBeenCalledTimes(1);

    mockL.GridLayer.prototype._update.call(gridCtx);
    expect(originalGridUpdate).not.toHaveBeenCalled();

    // Multi-level zoom jump delegates immediately to _setView without computing huge stale tile bounds
    gridCtx._map.touchZoom._zooming = false;
    const jumpSetViewSpy = vi.fn();
    mockL.GridLayer.prototype._update.call({
      ...gridCtx,
      _setView: jumpSetViewSpy,
    });
    expect(jumpSetViewSpy).toHaveBeenCalledWith({ lat: 40.4, lng: -3.7 }, 5);
    expect(gridCtx._getTiledPixelBounds).not.toHaveBeenCalled();
    expect(originalGridUpdate).not.toHaveBeenCalled();

    // After pinch finishes, non-finite / runaway (>400 tiles) tileRange bails gracefully without throwing
    gridCtx._getTiledPixelBounds.mockReturnValue({});
    gridCtx._pxBoundsToTileRange.mockReturnValue({
      min: makePoint(Number.NEGATIVE_INFINITY, 0),
      max: makePoint(Number.POSITIVE_INFINITY, 0),
    });
    expect(() => mockL.GridLayer.prototype._update.call({ ...gridCtx, _map: { ...gridCtx._map, getZoom: () => 8 } })).not.toThrow();
    expect(originalGridUpdate).not.toHaveBeenCalled();

    gridCtx._pxBoundsToTileRange.mockReturnValue({
      min: makePoint(0, 0),
      max: makePoint(100, 100),
    });
    expect(() => mockL.GridLayer.prototype._update.call({ ...gridCtx, _map: { ...gridCtx._map, getZoom: () => 8 } })).not.toThrow();
    expect(originalGridUpdate).not.toHaveBeenCalled();

    // Valid small tileRange delegates to original _update
    gridCtx._pxBoundsToTileRange.mockReturnValue({
      min: makePoint(10, 10),
      max: makePoint(14, 14),
    });
    mockL.GridLayer.prototype._update.call({ ...gridCtx, _map: { ...gridCtx._map, getZoom: () => 8 } });
    expect(originalGridUpdate).toHaveBeenCalledTimes(1);
  });

  it("4. SpainMap, WorldMap, CollectiveMap, and MapZoomListener configure bounceAtZoomLimits={false}, culling, and pinch deferral", () => {
    const spainContent = readFile("components/spain-map.tsx");
    const worldContent = readFile("components/world-map.tsx");
    const collectiveContent = readFile("components/collective-map.tsx");
    const lifecycleContent = readFile("components/maps/map-lifecycle.tsx");

    expect(spainContent).toContain("bounceAtZoomLimits={false}");
    expect(worldContent).toContain("bounceAtZoomLimits={false}");
    expect(collectiveContent).toContain("bounceAtZoomLimits={false}");

    // TileLayer minZoom stays below MapContainer minZoom to avoid mid-zoom tile wiping
    expect(spainContent).toMatch(/<TileLayer[\s\S]*minZoom=\{4\}/);
    expect(collectiveContent).toMatch(/<TileLayer[\s\S]*minZoom=\{isPeaks \? 4 : 1\}/);

    // SpainPeakMarkersLayer mirrors WorldMap viewport culling (hidden below zoom 8)
    expect(spainContent).toMatch(/SpainPeakMarkersLayer[\s\S]*useMapEvents\(\{\s*zoomend:\s*syncViewport/);
    expect(spainContent).toContain("if (viewport.zoom < 8) return [];");
    expect(spainContent).toContain("viewport.bounds.pad(0.25)");

    // MapZoomListener skips data-zoom DOM attribute churn during active pinch gestures
    expect(lifecycleContent).toContain("(map.touchZoom as any)?._zooming");
  });

  it("5. pruneMicroPolygons drops tiny sea-rock specks from provincias_spain.topo.json while preserving all 52 provinces", async () => {
    vi.doMock("leaflet", () => ({ default: {} }));
    const { pruneMicroPolygons } = await import("@/lib/geo-loader");

    const raw = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "public/provincias_spain.topo.json"), "utf8")
    ) as Topology;
    const fc = feature(
      raw,
      (raw.objects.provincias || Object.values(raw.objects)[0]) as any
    ) as unknown as FeatureCollection;

    const countRings = (geo: FeatureCollection) =>
      geo.features.reduce((acc, f) => {
        if (f.geometry.type === "Polygon") return acc + 1;
        if (f.geometry.type === "MultiPolygon") return acc + f.geometry.coordinates.length;
        return acc;
      }, 0);

    const beforeRings = countRings(fc);
    const pruned = pruneMicroPolygons(fc);
    const afterRings = countRings(pruned);

    expect(pruned.features).toHaveLength(52);
    expect(beforeRings).toBeGreaterThan(400);
    expect(afterRings).toBeLessThan(200);
    expect(afterRings).toBeGreaterThanOrEqual(52);
  });
});
