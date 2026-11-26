"use client";

import L from "leaflet";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import type { FeatureCollection, Position } from "geojson";

export const WORLD_TOPO_URL = "/world-countries.topo.json";
export const WORLD_TOPO_FALLBACK_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";
export const PROVINCES_TOPO_URL = "/provincias_spain.topo.json";
export const PROVINCES_FALLBACK_URL =
  "https://gist.githubusercontent.com/josemamira/3af52a4698d42b3f676fbc23f807a605/raw/cc5e247b63b05520c167639ed51d61acd560b1c1/provincias_spain.geojson";

let _worldGeoCache: FeatureCollection | null = null;
let _worldGeoPromise: Promise<FeatureCollection> | null = null;
let _spainGeoCache: FeatureCollection | null = null;
let _spainGeoPromise: Promise<FeatureCollection> | null = null;

/**
 * Strips degenerate / sub-pixel sea-rock rings from MultiPolygon features while always
 * retaining the largest polygon per feature to avoid redundant Canvas path clipping on zoom.
 */
export function pruneMicroPolygons(
  geo: FeatureCollection,
  minSpanDegrees = 0.002
): FeatureCollection {
  for (const f of geo.features) {
    if (f?.geometry?.type !== "MultiPolygon") continue;
    const polys = f.geometry.coordinates;
    if (!Array.isArray(polys) || polys.length <= 1) continue;

    let largestIdx = 0;
    let largestArea = -1;
    const metrics = polys.map((poly, idx) => {
      const ring = poly?.[0] ?? [];
      let minLng = Infinity;
      let maxLng = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;
      for (const coord of ring) {
        const lng = coord[0];
        const lat = coord[1];
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      const spanLng = Number.isFinite(maxLng - minLng) ? maxLng - minLng : 0;
      const spanLat = Number.isFinite(maxLat - minLat) ? maxLat - minLat : 0;
      const span = Math.max(spanLng, spanLat);
      const area = spanLng * spanLat;
      if (area > largestArea) {
        largestArea = area;
        largestIdx = idx;
      }
      return { len: ring.length, span };
    });

    f.geometry.coordinates = polys.filter(
      (_poly, idx) =>
        idx === largestIdx || (metrics[idx].len >= 4 && metrics[idx].span >= minSpanDegrees)
    );
  }
  return geo;
}

export function fixAntimeridian(geo: FeatureCollection): void {
  const fixRing = (ring: Position[]) => {
    for (let i = 1; i < ring.length; i++) {
      const prev = ring[i - 1][0];
      const curr = ring[i][0];
      if (curr - prev > 180) {
        ring[i][0] -= 360;
      } else if (curr - prev < -180) {
        ring[i][0] += 360;
      }
    }
  };

  geo.features.forEach((f) => {
    if (f.geometry.type === "Polygon") {
      f.geometry.coordinates.forEach(fixRing);
    } else if (f.geometry.type === "MultiPolygon") {
      f.geometry.coordinates.forEach((poly) => poly.forEach(fixRing));
    }
  });
}

export function getCachedWorldGeo(): FeatureCollection | null {
  return _worldGeoCache;
}

export function getCachedSpainGeo(): FeatureCollection | null {
  return _spainGeoCache;
}

export function fetchWorldGeo(): Promise<FeatureCollection> {
  if (_worldGeoCache) return Promise.resolve(_worldGeoCache);
  if (!_worldGeoPromise) {
    _worldGeoPromise = fetch(WORLD_TOPO_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .catch(() =>
        fetch(WORLD_TOPO_FALLBACK_URL).then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
      )
      .then((topology: Topology) => {
        const countriesGeo = feature(
          topology,
          topology.objects.countries as any
        ) as unknown as FeatureCollection;
        fixAntimeridian(countriesGeo);
        _worldGeoCache = countriesGeo;
        return countriesGeo;
      })
      .catch((err) => {
        _worldGeoPromise = null;
        throw err;
      });
  }
  return _worldGeoPromise;
}

export function fetchSpainGeo(): Promise<FeatureCollection> {
  if (_spainGeoCache) return Promise.resolve(_spainGeoCache);
  if (!_spainGeoPromise) {
    _spainGeoPromise = fetch(PROVINCES_TOPO_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((topology: Topology) => {
        const provincesGeo = pruneMicroPolygons(
          feature(
            topology,
            (topology.objects.provincias || Object.values(topology.objects)[0]) as any
          ) as unknown as FeatureCollection
        );
        _spainGeoCache = provincesGeo;
        return provincesGeo;
      })
      .catch(() =>
        fetch(PROVINCES_FALLBACK_URL).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<FeatureCollection>;
        }).then((provincesGeo) => {
          const cleaned = pruneMicroPolygons(provincesGeo);
          _spainGeoCache = cleaned;
          return cleaned;
        })
      )
      .catch((err) => {
        _spainGeoPromise = null;
        throw err;
      });
  }
  return _spainGeoPromise;
}

export function getLargestPolygonBounds(geoFeature: any): L.LatLngBounds {
  if (geoFeature?.geometry?.type === "MultiPolygon") {
    const coords = geoFeature.geometry.coordinates;
    let maxLen = 0;
    let largestPoly: any = null;
    for (const polyCoords of coords) {
      const len = polyCoords?.[0]?.length || 0;
      if (len > maxLen) {
        maxLen = len;
        largestPoly = {
          type: "Feature",
          properties: geoFeature.properties,
          geometry: {
            type: "Polygon",
            coordinates: polyCoords,
          },
        };
      }
    }
    if (largestPoly) {
      return L.geoJSON(largestPoly as any).getBounds();
    }
  }
  return L.geoJSON(geoFeature).getBounds();
}
