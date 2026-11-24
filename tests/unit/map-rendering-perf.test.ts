import { describe, it, expect } from "vitest";
import {
  readAllStyles,
  readFeedSources,
  readFile,
  readMapSources,
  readRankingSources,
  readSocialSources,
  readTrackerSources,
} from "@/tests/utils/source-reader";

describe("Map Rendering Performance & Tile Streaming Optimizations", () => {
  it("1. spain-map.tsx: optimizes 47 vector markers with memoization, singleton icons, smooth tile streaming, and adaptive canvas bounds", () => {
    const content = readMapSources();
    const spainContent = readFile("components/spain-map.tsx");

    // Singleton marker icons cache & memoized PeakMarker
    expect(content).toContain("export function getPeakMarkerIcons()");
    expect(spainContent).toContain("const PeakMarker = memo(function PeakMarker");
    expect(spainContent).toContain("<PeakMarker");
    expect(spainContent).toContain("handleMarkerClick");

    // Continuous tile streaming and adaptive buffer
    expect(spainContent).toContain("keepBuffer={keepBuffer}");
    expect(content).toContain("getAdaptiveKeepBuffer");
    expect(spainContent).toContain("updateWhenIdle={false}");
    expect(spainContent).toContain("updateInterval={100}");
    expect(spainContent).toContain("maxNativeZoom={19}");
    expect(spainContent).not.toContain("updateWhenZooming={false}");

    // Canvas polygon simplification & no global prototype padding mutation
    expect(content).toContain("L.Polyline.prototype.options.smoothFactor = 1.2;");
    expect(content).not.toMatch(/L\.Canvas\.prototype\.options\.padding\s*=/);

    // Real-time canvas bounds expansion on drag with zoom protection
    expect(content).toContain("_atlasMovePatched");
    expect(content).toContain("_onCanvasMove");
    expect(content).toContain("_map._animatingZoom");
    expect(content).toContain("!(this._map.dragging && this._map.dragging.moving())");

    // Per-instance adaptive renderer and initial coordinate initialization
    expect(spainContent).toContain('createAdaptiveCanvasRenderer("spain")');
    expect(spainContent).toContain("renderer={canvasRenderer}");
    expect(spainContent).toContain("center={[40.4168, -3.7038]}");
    expect(spainContent).toContain("zoom={5}");
    expect(content).toContain("padding: [12, 12], animate: false");
  });

  it("2. world-map.tsx: throttles zoom listeners, memoizes country markers, streams tiles fluidly, and dynamically expands canvas bounds", () => {
    const content = readMapSources();
    const worldContent = readFile("components/world-map.tsx");

    // RAF throttling on zoom listener to avoid synchronous DOM attribute writes on every micro-tick
    expect(content).toContain("rafRef.current = requestAnimationFrame(() => {");

    // Memoized CountryMarker & zoomend-only update in CountryMarkersLayer
    expect(worldContent).toContain("const CountryMarker = memo(function CountryMarker");
    expect(worldContent).toContain("<CountryMarker");
    expect(worldContent).toMatch(/CountryMarkersLayer[\s\S]*?useMapEvents\(\{\s*zoomend:/);

    // Continuous tile streaming and adaptive buffer
    expect(worldContent).toContain("keepBuffer={keepBuffer}");
    expect(worldContent).toContain("updateWhenIdle={false}");
    expect(worldContent).toContain("updateInterval={50}");
    expect(worldContent).toContain("maxNativeZoom={19}");
    expect(worldContent).not.toContain("updateWhenZooming={false}");

    // Canvas polygon simplification & adaptive canvas renderer
    expect(content).toContain("L.Polyline.prototype.options.smoothFactor = 1.2;");
    expect(content).toContain("!(this._map.dragging && this._map.dragging.moving())");
    expect(content).toContain("_atlasMovePatched");
    expect(content).toContain("_onCanvasMove");

    // Dedicated instance renderer and coordinate initialization to prevent first zoom jump
    expect(worldContent).toContain("renderer={canvasRenderer}");
    expect(worldContent).toContain('createAdaptiveCanvasRenderer("world")');
    expect(worldContent).toContain("center={[20, 0]}");
    expect(worldContent).toContain("zoom={2}");
    expect(content).toContain("padding: [0, 0], animate: false");
  });

  it("3. collective-map.tsx: streams tiles smoothly, simplifies vector paths, and expands canvas dynamically", () => {
    const content = readMapSources();
    const collectiveContent = readFile("components/collective-map.tsx");

    expect(collectiveContent).toContain("keepBuffer={keepBuffer}");
    expect(collectiveContent).toContain("updateWhenIdle={false}");
    expect(collectiveContent).toContain("updateInterval={50}");
    expect(collectiveContent).toContain("maxNativeZoom={19}");

    // Polyline smoothFactor and canvas move patch on collective map
    expect(content).toContain("!(this._map.dragging && this._map.dragging.moving())");
    expect(content).toContain("L.Polyline.prototype.options.smoothFactor = 1.2;");
    expect(content).toContain("_atlasMovePatched");
    expect(content).toContain("_onCanvasMove");

    // Dedicated adaptive instance renderer and coordinate initialization
    expect(collectiveContent).toContain("renderer={canvasRenderer}");
    expect(collectiveContent).toContain('createAdaptiveCanvasRenderer("collective")');
  });

  it("4. styles/maps.css: isolates summit-pin & pane compositor layers without promoting every marker icon permanently", () => {
    const content = readAllStyles();

    // Hardware acceleration and containment for summit-pin
    expect(content).toContain("contain: layout style paint;");
    expect(content).toContain("transform: translateZ(0);");
    expect(content).toContain("backface-visibility: hidden;");

    // Disable CSS transition during drag/zoom so Leaflet transforms don't fight CSS transitions
    expect(content).toContain(".leaflet-dragging .summit-pin,");
    expect(content).toContain(".leaflet-drag-target .summit-pin,");

    // Pane-level will-change & marker pane containment without per-icon will-change bloat
    expect(content).toContain(".leaflet-tile-pane,");
    expect(content).toContain(".leaflet-marker-pane");
    expect(content).toContain("contain: layout style;");
    expect(content).not.toMatch(/\.leaflet-marker-icon\s*\{[^}]*will-change:\s*transform/);
  });

  it("5. public/sw.js: caches OpenStreetMap tiles across all subdomains", () => {
    const swContent = readFile("public/sw.js");
    expect(swContent).toContain('url.hostname.endsWith("tile.openstreetmap.org")');
  });

  it("6. feed-tab & social-tab: enables background prefetching and throttled photo preloading", () => {
    const feedContent = readFeedSources();
    const socialContent = readSocialSources();

    // Feed preloading via throttled preloader (maxConcurrent + maxCount cap)
    expect(feedContent).toContain("preloadImages");
    expect(feedContent).toContain("preloadUrls");
    expect(feedContent).toContain("maxConcurrent: 3");

    // Social background prefetching of user progress and connections
    expect(socialContent).toContain("fetchUserProgress()");
    expect(socialContent).toContain("loadConnections()");
  });

  it("7. ranking-tab & summit-tracker: preloads ranking data and summit photos with throttled preloader", () => {
    const rankingContent = readRankingSources();
    const trackerContent = readTrackerSources();

    // Ranking background prefetch
    expect(rankingContent).toContain("fetchRanking(true)");
    expect(rankingContent).toContain("globalRankingCache");

    // SummitTracker throttled photo preloading
    expect(trackerContent).toContain("preloadImages(urls, { maxConcurrent: 3, maxCount: 6 })");
    expect(trackerContent).toContain("photos.slice(0, 12)");
  });
});
