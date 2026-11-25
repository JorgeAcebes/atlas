---
name: geodata-and-maps
description: >-
  Use this skill whenever working with geographical datasets, Leaflet map components,
  Canvas vector rendering, TopoJSON/GeoJSON assets, coordinates, Spanish mountain peaks, or the 196 world countries in Atlas.
---

# Geodata and Map Visualizations

This skill provides domain rules, procedures, and technical specifications for the cartographic systems in **Atlas (47 Picos & 196 Países)**.

---

## 1. Domain Entities & Geodata

### Spain: 52 High Points / 47 Physical Summits (`data/peaks.ts`)
The challenge encompasses all 50 provinces of Spain plus Ceuta and Melilla:
- Total demarcation count: **52**
- Total unique physical mountains: **47**
- **5 Shared Summits** (sitting precisely on provincial borders):
  1. **Gorbea** (1482.5m) — Álava (`01`) & Vizcaya (`48`)
  2. **Torre Cerredo** (2651.9m) — León (`24`) & Asturias (`33`)
  3. **Peñalara** (2428.4m) — Madrid (`28`) & Segovia (`40`)
  4. **Peña Trevinca** (2128.7m) — Orense (`32`) & Zamora (`49`)
  5. **Moncayo** (2314.3m) — Soria (`42`) & Zaragoza (`50`)

> [!IMPORTANT]
> Shared peaks share the **same string `id`** in `data/peaks.ts` and identical `coordinates` and `altitude`. Completed peak progress must always be calculated by unique peak names (`uniquePeakNames.size`), never by demarcation count.

For the full list of 52 peaks, refer to [Peaks Reference Guide](./references/peaks-guide.md).

### World: 196 Countries (`data/countries.ts`)
- Data source: `data/countries.ts` (193 UN members + Palestine + Taiwan + Kosovo).
- **Kosovo identifier**: Uses `iso_n3: "-99"` to match Natural Earth / World-Atlas TopoJSON.
- *(Note: Sub-national regions were removed in `027_remove_regions.sql`; do not reintroduce `regions.ts` or `region-*` IDs.)*

---

## 2. Coordinate Conventions: GeoJSON vs. Leaflet

Be mindful of coordinate order inversion:
- **Leaflet**: Expects `[latitude, longitude]` (e.g., `[40.85, -3.95]`).
- **GeoJSON / TopoJSON**: Standard geometry format is `[longitude, latitude]` (e.g., `[-3.95, 40.85]`).

---

## 3. Map Components & Leaflet Canvas Architecture

Map components live in `components/` with lifecycle and helper utilities in `components/maps/` and `lib/`:
- `components/spain-map.tsx`: Spanish provincial choropleth + Lucide SVG peak markers (`lib/leaflet-icons.ts`).
- `components/world-map.tsx`: World choropleth with countries and conditional experience markers (rendered **only** when `experiencesMode` is true).
- `components/collective-map.tsx`: Community aggregated visits for both countries and peaks (`components/maps/collective-visitors-panel.tsx`, `components/maps/experiences-toggle-control.tsx`).
- `components/maps/map-lifecycle.tsx`: Shared `FitWorld`, `FitSpain`, `MapActiveSynchronizer`, `MapInvalidator`, and `MapZoomListener` helpers.

### Critical Leaflet & SSR Rules
1. **No SSR**: Always import map components with `dynamic(() => import("@/components/..."), { ssr: false })`.
2. **Adaptive Canvas Renderer (`lib/leaflet-canvas-patch.ts`)**:
   - Each map creates its own `createAdaptiveCanvasRenderer` instance passed to `<MapContainer renderer={...}>` — **never** mutate `L.Canvas.prototype.options.padding`.
   - Uses `padding: 0.5` on desktop HiDPI, `1.0` (world/collective) or `0.8` (Spain) on mobile/tablet, plus `getAdaptiveKeepBuffer()` (`3` desktop / `4` touch).
   - `ensureLeafletCanvasPatched()` patches `_onCanvasMove` for smooth panning and suspends repainting during zoom gestures/animations.
   - `L.Polyline.prototype.options.smoothFactor = 1.2`.
3. **Initial `<MapContainer>` Props & Zero-Island Guard (`lib/leaflet-bounds.ts`)**:
   - Always pass explicit `center` and `zoom` to `<MapContainer>`.
   - Initial `map.fitBounds` runs with `{ animate: false }`; Spain maps validate Spanish bounds on tab reactivation to prevent `(0, 0)` Zero-Island jumps.
4. **Passive UI Zoom Lock**: `components/pwa-zoom-lock.tsx` + `styles/maps.css` block accidental UI zoom without intercepting global map touch listeners.

---

## 4. Processing Boundary Geodata (`public/*.topo.json`)

Optimized TopoJSON topologies (`public/provincias_spain.topo.json`, `public/world-countries.topo.json`) are loaded via `lib/geo-loader.ts`.
Regeneration/simplification scripts in `scripts/`:
- `node scripts/generate-provinces-topo.mjs`
- `node scripts/simplify-topojson.mjs`

---

## 5. Automated Data Validation

```bash
npm test tests/unit/peaks.test.ts
npm test tests/unit/countries.test.ts
npm test tests/unit/map-rendering-perf.test.ts
npm test tests/unit/desktop-map-optimizations-and-zero-island-fix.test.ts
```
