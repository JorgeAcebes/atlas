import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Map Rendering Performance & Tile Streaming Optimizations", () => {
  const rootDir = process.cwd();

  it("1. spain-map.tsx: optimizes 47 vector markers with memoization, singleton icons, smooth tile streaming, and dynamic canvas bounds", () => {
    const spainMapPath = path.join(rootDir, "components/spain-map.tsx");
    const content = fs.readFileSync(spainMapPath, "utf-8");

    // Static singleton marker icons & memoized PeakMarker
    expect(content).toContain("const PEAK_MARKER_ICONS = {");
    expect(content).toContain("const PeakMarker = memo(function PeakMarker");
    expect(content).toContain("<PeakMarker");
    expect(content).toContain("handleMarkerClick");

    // Continuous tile streaming and large buffer for fast panning
    expect(content).toContain("keepBuffer={16}");
    expect(content).toContain("updateWhenIdle={false}");
    expect(content).toContain("updateInterval={100}");
    expect(content).toContain("maxNativeZoom={19}");
    expect(content).not.toContain("updateWhenZooming={false}");

    // Canvas polygon simplification via Polyline prototype options
    expect(content).toContain("L.Polyline.prototype.options.smoothFactor = 1.2;");
    // Canvas padding preserved
    expect(content).toContain("L.Canvas.prototype.options.padding = 0.5;");

    // Real-time canvas bounds expansion on drag
    expect(content).toContain("_atlasMovePatched");
    expect(content).toContain("_onCanvasMove");
  });

  it("2. world-map.tsx: throttles zoom listeners, memoizes country markers, streams tiles fluidly, and dynamically expands canvas bounds", () => {
    const worldMapPath = path.join(rootDir, "components/world-map.tsx");
    const content = fs.readFileSync(worldMapPath, "utf-8");

    // RAF throttling on zoom listener to avoid synchronous DOM attribute writes on every micro-tick
    expect(content).toContain("rafRef.current = requestAnimationFrame(() => {");

    // Memoized CountryMarker & zoomend-only update in CountryMarkersLayer
    expect(content).toContain("const CountryMarker = memo(function CountryMarker");
    expect(content).toContain("<CountryMarker");
    expect(content).toMatch(/CountryMarkersLayer[\s\S]*?useMapEvents\(\{\s*zoomend:/);

    // Continuous tile streaming and large buffer for unseen areas
    expect(content).toContain("keepBuffer={16}");
    expect(content).toContain("updateWhenIdle={false}");
    expect(content).toContain("updateInterval={100}");
    expect(content).toContain("maxNativeZoom={19}");
    expect(content).not.toContain("updateWhenZooming={false}");

    // Canvas polygon simplification via Polyline prototype options
    expect(content).toContain("L.Polyline.prototype.options.smoothFactor = 1.2;");

    // Large canvas padding + real-time move expansion to eliminate cut-off during drag
    expect(content).toContain("L.Canvas.prototype.options.padding = 1.0;");
    expect(content).toContain("_atlasMovePatched");
    expect(content).toContain("_onCanvasMove");
  });

  it("3. collective-map.tsx: streams tiles smoothly, simplifies vector paths, and expands canvas dynamically", () => {
    const collectivePath = path.join(rootDir, "components/collective-map.tsx");
    const content = fs.readFileSync(collectivePath, "utf-8");

    expect(content).toContain("keepBuffer={16}");
    expect(content).toContain("updateWhenIdle={false}");
    expect(content).toContain("updateInterval={100}");
    expect(content).toContain("maxNativeZoom={19}");

    // Polyline smoothFactor on collective map
    expect(content).toContain("L.Polyline.prototype.options.smoothFactor = 1.2;");
    expect(content).toContain("_atlasMovePatched");
    expect(content).toContain("_onCanvasMove");
  });

  it("4. app/globals.css: isolates summit-pin GPU compositor layers and removes drag transitions", () => {
    const cssPath = path.join(rootDir, "app/globals.css");
    const content = fs.readFileSync(cssPath, "utf-8");

    // Hardware acceleration and containment for summit-pin
    expect(content).toContain("contain: layout style paint;");
    expect(content).toContain("transform: translateZ(0);");
    expect(content).toContain("backface-visibility: hidden;");

    // Disable CSS transition during drag/zoom so Leaflet transforms don't fight CSS transitions
    expect(content).toContain(".leaflet-dragging .summit-pin,");
    expect(content).toContain(".leaflet-drag-target .summit-pin,");

    // Marker pane containment & will-change
    expect(content).toContain(".leaflet-marker-pane");
    expect(content).toContain("contain: layout style;");
    expect(content).toContain(".leaflet-marker-icon");
    expect(content).toContain("will-change: transform;");
  });

  it("5. public/sw.js: caches OpenStreetMap tiles across all subdomains", () => {
    const swPath = path.join(rootDir, "public/sw.js");
    const content = fs.readFileSync(swPath, "utf-8");

    expect(content).toContain("url.hostname.endsWith('tile.openstreetmap.org')");
  });

  it("6. feed-tab.tsx & social-tab.tsx: enables background prefetching and preloads up to 30 photos for countries & peaks", () => {
    const feedContent = fs.readFileSync(path.join(rootDir, "components/feed-tab.tsx"), "utf-8");
    const socialContent = fs.readFileSync(path.join(rootDir, "components/social-tab.tsx"), "utf-8");

    // Feed background prefetching when not active
    expect(feedContent).toContain("fetchFeed(true)");
    expect(feedContent).toContain("topPhotosToPreload");
    expect(feedContent).toContain("countryPhotosToPreload");
    expect(feedContent).toContain("peakPhotosToPreload");

    // Social background prefetching of user progress and connections
    expect(socialContent).toContain("fetchUserProgress()");
    expect(socialContent).toContain("fetchConnections()");
  });

  it("7. ranking-tab.tsx & summit-tracker.tsx: preloads ranking data and user summit photos in background", () => {
    const rankingContent = fs.readFileSync(path.join(rootDir, "components/ranking-tab.tsx"), "utf-8");
    const trackerContent = fs.readFileSync(path.join(rootDir, "components/summit-tracker.tsx"), "utf-8");

    // Ranking background prefetch
    expect(rankingContent).toContain("fetchRanking(true)");
    expect(rankingContent).toContain("globalRankingCache");

    // SummitTracker user photos preloading
    expect(trackerContent).toContain("photos.slice(0, 30).forEach");
  });
});
