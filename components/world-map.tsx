"use client";

import * as L from "leaflet";
import {
  GeoJSON,
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { Path } from "leaflet";
import type { FeatureCollection, Position } from "geojson";
import { useCallback, useEffect, useState, useMemo, useRef, memo } from "react";
import * as ReactDOMServer from "react-dom/server";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import { countries, resolveCountryFromFeature, type Country } from "@/data/countries";
import { MapSearchControl, type SearchItem } from "./map-search";
import { SweepOverlay } from "./sweep-overlay";
import { X } from "lucide-react";

// Override Leaflet's default canvas padding to preload vector shapes far outside the viewport
L.Canvas.prototype.options.padding = 0.5;
L.Polyline.prototype.options.smoothFactor = 1.2;

const WORLD_TOPO_URL = "/world-countries.topo.json";
const WORLD_TOPO_FALLBACK_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";

// ── Module-level GeoJSON cache ────────────
const expIconCache = new Map<string, L.DivIcon>();
let _worldGeoCache: FeatureCollection | null = null;
let _worldGeoPromise: Promise<FeatureCollection> | null = null;

function fetchWorldGeo(): Promise<FeatureCollection> {
  if (_worldGeoCache) return Promise.resolve(_worldGeoCache);
  if (!_worldGeoPromise) {
    _worldGeoPromise = fetch(WORLD_TOPO_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .catch(() => {
        return fetch(WORLD_TOPO_FALLBACK_URL).then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        });
      })
      .then((topology: Topology) => {
        const countriesGeo = feature(
          topology,
          topology.objects.countries as any,
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


function fixAntimeridian(geo: FeatureCollection) {
  const fixRing = (ring: Position[]) => {
    for (let i = 1; i < ring.length; i++) {
      const prev = ring[i - 1][0];
      let curr = ring[i][0];
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

type Props = {
  completed: Set<string>;
  wishlist: Set<string>;
  onInformation: (country: Country) => void;
  onComplete: (country: Country) => void;
  diffMode?: boolean;
  diffOnlyViewer?: Set<string>;
  diffOnlyTarget?: Set<string>;
  diffBoth?: Set<string>;
  activeId?: string;
  experiencesMode?: boolean;
  experienceRecords?: any[];
  selectingLocation?: boolean;
  onMapClick?: (lat: number, lng: number, placeName?: string) => void;
  onCancelSelectingLocation?: () => void;
  onExperienceClick?: (record: any) => void;
  onAddExperience?: () => void;
  panelOpen?: boolean;
  hasCompareButton?: boolean;
  /** Whether the map tab is currently visible. When false, Leaflet operations
   *  that depend on the container having a non-zero size are skipped to prevent
   *  the map from jumping/zooming-in when navigating back from other tabs. */
  isActive?: boolean;
};

function FitWorld({ isActive }: { isActive?: boolean }) {
  const map = useMap();
  const hasFittedRef = useRef(false);

  useEffect(() => {
    if (isActive === false) return;
    const container = map.getContainer();
    if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;
    if (hasFittedRef.current) return;
    hasFittedRef.current = true;

    if (window.location.hash.startsWith("#panel=")) {
      const saved = sessionStorage.getItem("mapState_world");
      if (saved) {
        try {
          const { zoom, center } = JSON.parse(saved);
          if (Number.isFinite(zoom) && Number.isFinite(center?.lat) && Number.isFinite(center?.lng)) {
            map.setView(center, zoom, { animate: false });
            return;
          }
        } catch (e) {}
      }
    }

    const aspectRatio = window.innerWidth / window.innerHeight;
    if (aspectRatio > 1) {
      // Desktop: Shift center north to crop Antarctica but keep South America
      const visibleHeight = 360 / Math.max(aspectRatio, 1);
      // Put the bottom edge around -58 (Cape Horn)
      const centerLat = Math.min(-58 + visibleHeight / 2, 50);
      
      map.fitBounds([
        [centerLat - 0.1, -180],
        [centerLat + 0.1, 180]
      ], { padding: [0, 0] });
    } else {
      // Mobile: standard vertical bounds
      map.fitBounds([
        [-60, -180],
        [80, 180]
      ], { padding: [0, 0] });
    }
  }, [map, isActive]);
  return null;
}

// Calls invalidateSize() repeatedly during the CSS panel transition (300ms)
// so Leaflet always knows the real container dimensions.
function safeCloseTooltip(layer: any) {
  try {
    if (layer && layer._tooltip && typeof layer.closeTooltip === 'function') {
      layer.closeTooltip();
    }
  } catch {}
}

function MapInvalidator({ panelOpen, isActive }: { panelOpen?: boolean; isActive?: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (isActive === false) return;
    const container = map.getContainer();
    if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;

    if (!panelOpen) {
      try {
        container.querySelectorAll(".leaflet-tooltip").forEach((el) => {
          el.parentElement?.removeChild(el);
        });
      } catch {}
    }
    if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;

    const TRANSITION_MS = 350; // slightly longer than the 0.3s CSS transition
    const start = performance.now();
    let rafId: number;

    function tick(now: number) {
      // pan: false ensures Leaflet updates canvas dimensions without shifting map center
      map.invalidateSize({ animate: false, pan: false });
      if (now - start < TRANSITION_MS) {
        rafId = requestAnimationFrame(tick);
      }
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [map, panelOpen, isActive]);
  return null;
}

function MapActiveSynchronizer({ isActive }: { isActive?: boolean }) {
  const map = useMap();
  const prevActiveRef = useRef(isActive);

  useEffect(() => {
    const wasInactive = prevActiveRef.current === false;
    prevActiveRef.current = isActive;

    if (!isActive) return;

    if (wasInactive) {
      const rafId = requestAnimationFrame(() => {
        const container = map.getContainer();
        if (container && container.clientWidth > 0 && container.clientHeight > 0) {
          map.invalidateSize({ animate: false, pan: false });
        }
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [map, isActive]);

  return null;
}

function MapZoomListener({ isActive }: { isActive?: boolean }) {
  const rafRef = useRef<number | null>(null);

  const map = useMapEvents({
    zoom: () => {
      if (isActive === false) return;
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const container = map.getContainer();
        if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;
        const rounded = Math.max(0, Math.round(map.getZoom() || 0)).toString();
        if (container.getAttribute("data-zoom") !== rounded) {
          container.setAttribute("data-zoom", rounded);
        }
      });
    },
    zoomend: () => {
      if (isActive === false) return;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const container = map.getContainer();
      if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;
      const zoom = map.getZoom();
      const center = map.getCenter();
      if (Number.isFinite(zoom) && Number.isFinite(center?.lat) && Number.isFinite(center?.lng)) {
        sessionStorage.setItem("mapState_world", JSON.stringify({ zoom, center }));
      }
      const rounded = Math.max(0, Math.round(zoom || 0)).toString();
      if (container.getAttribute("data-zoom") !== rounded) {
        container.setAttribute("data-zoom", rounded);
      }
    },
    moveend: () => {
      if (isActive === false) return;
      const container = map.getContainer();
      if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;
      const zoom = map.getZoom();
      const center = map.getCenter();
      if (Number.isFinite(zoom) && Number.isFinite(center?.lat) && Number.isFinite(center?.lng)) {
        sessionStorage.setItem("mapState_world", JSON.stringify({ zoom, center }));
      }
    },
  });

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isActive === false) return;
    const container = map.getContainer();
    if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;
    const rounded = Math.max(0, Math.round(map.getZoom() || 0)).toString();
    if (container.getAttribute("data-zoom") !== rounded) {
      container.setAttribute("data-zoom", rounded);
    }
  }, [map, isActive]);

  return null;
}

function MapClickListener({ onMapClick, selectingLocation }: { onMapClick?: (lat: number, lng: number, placeName?: string) => void, selectingLocation?: boolean }) {
  const onMapClickRef = useRef(onMapClick);
  const selectingLocationRef = useRef(selectingLocation);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
    selectingLocationRef.current = selectingLocation;
  }, [onMapClick, selectingLocation]);

  const map = useMapEvents({
    click(e) {
      if (onMapClickRef.current && selectingLocationRef.current) {
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.latlng.lat}&lon=${e.latlng.lng}&zoom=10`)
          .then(res => res.json())
          .then(data => {
            if (data.error) throw new Error("Nominatim error");
            const placeName = data.address?.city || data.address?.town || data.address?.village || data.address?.county || data.address?.state || data.name || undefined;
            if (onMapClickRef.current) onMapClickRef.current(e.latlng.lat, e.latlng.lng, placeName);
          })
          .catch(() => {
            fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${e.latlng.lat}&longitude=${e.latlng.lng}&localityLanguage=es`)
              .then(res => res.json())
              .then(data => {
                const placeName = data.locality || data.city || data.principalSubdivision || data.countryName || undefined;
                if (onMapClickRef.current) onMapClickRef.current(e.latlng.lat, e.latlng.lng, placeName);
              })
              .catch(() => {
                if (onMapClickRef.current) onMapClickRef.current(e.latlng.lat, e.latlng.lng);
              });
          });
      }
    }
  });
  
  useEffect(() => {
    const container = map.getContainer();
    if (selectingLocation) {
      container.style.cursor = 'crosshair';
    } else {
      container.style.cursor = '';
    }
  }, [selectingLocation, map]);
  
  return null;
}

type CountryMarkerProps = {
  country: Country;
  icon: L.DivIcon;
  onClick: (country: Country) => void;
};

const CountryMarker = memo(function CountryMarker({ country, icon, onClick }: CountryMarkerProps) {
  const eventHandlers = useMemo(
    () => ({
      click: () => onClick(country),
    }),
    [onClick, country]
  );

  return (
    <Marker
      position={country.coordinates!}
      icon={icon}
      eventHandlers={eventHandlers}
    />
  );
});

function CountryMarkersLayer({
  showCountryMarkers,
  countriesWithCoords,
  diffMode,
  getDiffIcon,
  completed,
  wishlist,
  icons,
  selectingLocation,
  onInformation,
}: {
  showCountryMarkers: boolean;
  countriesWithCoords: Country[];
  diffMode?: boolean;
  getDiffIcon: (countryId: string) => L.DivIcon;
  completed: Set<string>;
  wishlist: Set<string>;
  icons: { done: L.DivIcon; todo: L.DivIcon; wishlist: L.DivIcon };
  selectingLocation?: boolean;
  onInformation: (country: Country) => void;
}) {
  const map = useMap();
  const [currentZoom, setCurrentZoom] = useState(() => {
    try {
      return map.getZoom() || 0;
    } catch {
      return 0;
    }
  });

  useMapEvents({
    zoomend: () => {
      setCurrentZoom(map.getZoom() || 0);
    },
  });

  const selectingLocationRef = useRef(selectingLocation);
  selectingLocationRef.current = selectingLocation;
  const onInformationRef = useRef(onInformation);
  onInformationRef.current = onInformation;

  const handleCountryClick = useCallback((c: Country) => {
    if (selectingLocationRef.current) return;
    onInformationRef.current(c);
  }, []);

  if (!showCountryMarkers || currentZoom < 6) {
    return null;
  }

  return (
    <>
      {countriesWithCoords.map((c) => (
        <CountryMarker
          key={c.id}
          country={c}
          icon={
            diffMode
              ? getDiffIcon(c.id)
              : completed.has(c.id)
                ? icons.done
                : wishlist.has(c.id)
                  ? icons.wishlist
                  : icons.todo
          }
          onClick={handleCountryClick}
        />
      ))}
    </>
  );
}

// ── Pre-filter countries with coordinates (stable list) ──
const countriesWithCoords = countries.filter((c) => c.coordinates);

function getLargestPolygonBounds(feature: any) {
  if (!feature || !feature.geometry) return undefined;
  if (feature.geometry.type === "MultiPolygon") {
    let maxPoints = 0;
    let largestPoly = null;
    for (const polyCoords of feature.geometry.coordinates) {
      if (polyCoords[0] && polyCoords[0].length > maxPoints) {
        maxPoints = polyCoords[0].length;
        largestPoly = {
          type: "Feature",
          properties: feature.properties,
          geometry: {
            type: "Polygon",
            coordinates: polyCoords
          }
        };
      }
    }
    if (largestPoly) {
      return L.geoJSON(largestPoly as any).getBounds();
    }
  }
  return L.geoJSON(feature).getBounds();
}

import { getIconComponent } from "./icons";

export const WorldMap = memo(function WorldMap({ completed, wishlist, onInformation, onComplete, diffMode, diffOnlyViewer, diffOnlyTarget, diffBoth, activeId, experiencesMode, experienceRecords, selectingLocation, onMapClick, onCancelSelectingLocation, onExperienceClick, onAddExperience, panelOpen, hasCompareButton, isActive = true }: Props) {
  const [geo, setGeo] = useState<FeatureCollection | null>(_worldGeoCache);
  const [searchedId, setSearchedId] = useState<string | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanFrameRef = useRef<number | null>(null);

  // Use refs for values accessed inside Leaflet event handlers
  const completedRef = useRef(completed);
  const wishlistRef = useRef(wishlist);
  const diffModeRef = useRef(diffMode);
  const diffOnlyViewerRef = useRef(diffOnlyViewer);
  const diffOnlyTargetRef = useRef(diffOnlyTarget);
  const diffBothRef = useRef(diffBoth);
  const onInformationRef = useRef(onInformation);
  const selectingLocationRef = useRef(selectingLocation);
  const experiencesModeRef = useRef(experiencesMode);
  const layerRefs = useRef(new Map<string, L.Path>());

  completedRef.current = completed;
  wishlistRef.current = wishlist;
  diffModeRef.current = diffMode;
  diffOnlyViewerRef.current = diffOnlyViewer;
  diffOnlyTargetRef.current = diffOnlyTarget;
  diffBothRef.current = diffBoth;
  onInformationRef.current = onInformation;
  selectingLocationRef.current = selectingLocation;
  experiencesModeRef.current = experiencesMode;

  useEffect(() => {
    if (!_worldGeoCache) {
      fetchWorldGeo().then(setGeo).catch(() => setGeo(null));
    }
  }, []);

  useEffect(() => {
    if (!selectingLocation) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (onCancelSelectingLocation) onCancelSelectingLocation();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectingLocation, onCancelSelectingLocation]);

  const searchItems = useMemo<SearchItem[]>(() => {
    return countriesWithCoords.map(c => {
      let bounds: any;
      if (geo) {
        const feature = geo.features.find((f: any) => resolveCountryFromFeature(f)?.id === c.id);
        if (feature) {
          bounds = getLargestPolygonBounds(feature);
        }
      }
      return {
        id: c.id,
        name: c.name,
        nameLocal: c.name,
        type: "country",
        coordinates: c.coordinates,
        bounds,
        originalData: c
      };
    });
  }, [geo]);

  const handleSearchSelect = useCallback((item: SearchItem) => {
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    if (scanFrameRef.current) cancelAnimationFrame(scanFrameRef.current);

    // Resetting first also restarts the effect when the same result is chosen twice.
    setSearchedId(null);
    scanFrameRef.current = requestAnimationFrame(() => {
      setSearchedId(item.id);
      scanTimerRef.current = setTimeout(() => {
        setSearchedId((current) => current === item.id ? null : current);
      }, 900);
    });
  }, []);

  useEffect(() => () => {
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    if (scanFrameRef.current) cancelAnimationFrame(scanFrameRef.current);
  }, []);

  const icons = useMemo(
    () => ({
      done: L.divIcon({
        className: "",
        html: '<span class="summit-pin summit-pin--done"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
      todo: L.divIcon({
        className: "",
        html: '<span class="summit-pin"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z"></path></svg></span>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
      wishlist: L.divIcon({
        className: "",
        html: '<span class="summit-pin summit-pin--wishlist"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"></path></svg></span>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
      diffOnlyMe: L.divIcon({
        className: "",
        html: '<span class="summit-pin summit-pin--diff-only-me"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
      diffOnlyThem: L.divIcon({
        className: "",
        html: '<span class="summit-pin summit-pin--diff-only-them"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></span>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
      diffBoth: L.divIcon({
        className: "",
        html: '<span class="summit-pin summit-pin--diff-both"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.83 2.38a2 2 0 0 1 2.34 0l8 5.74a2 2 0 0 1 .73 2.25l-3.04 9.26a2 2 0 0 1-1.9 1.37H7.04a2 2 0 0 1-1.9-1.37L2.1 10.37a2 2 0 0 1 .73-2.25z"></path></svg></span>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
      diffNone: L.divIcon({
        className: "",
        html: '<span class="summit-pin summit-pin--diff-none"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z"></path></svg></span>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    }),
    [],
  );

  function getDiffIcon(countryId: string) {
    if (diffOnlyViewer?.has(countryId)) return icons.diffOnlyMe;
    if (diffOnlyTarget?.has(countryId)) return icons.diffOnlyThem;
    if (diffBoth?.has(countryId)) return icons.diffBoth;
    return icons.diffNone;
  }

  // ── Stable getDiffGeoStyle (reads from refs) ──
  const getDiffGeoStyleRef = useCallback((countryId: string) => {
    if (diffOnlyViewerRef.current?.has(countryId)) {
      return { color: "#4a2878", weight: 1.5, fillColor: "#7b52ab", fillOpacity: 0.8 };
    }
    if (diffOnlyTargetRef.current?.has(countryId)) {
      return { color: "#8c3a25", weight: 1.5, fillColor: "#c75a3a", fillOpacity: 0.75 };
    }
    if (diffBothRef.current?.has(countryId)) {
      return { color: "#9583ad", weight: 1.15, fillColor: "#c5b3da", fillOpacity: 0.65 };
    }
    return { color: "#c4bfb6", weight: 0.8, fillColor: "#e8e4df", fillOpacity: 0.4 };
  }, []);

  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    const oldId = activeIdRef.current;
    if (oldId && oldId !== activeId) {
      const layer = layerRefs.current.get(oldId);
      if (layer) {
        if (diffModeRef.current) {
          const ds = getDiffGeoStyleRef(oldId);
          (layer as Path).setStyle({ weight: ds.weight, fillOpacity: ds.fillOpacity });
        } else {
          if (layerRefs.current.has(oldId)) {
            const isWishlist = wishlistRef.current.has(oldId);
            (layer as Path).setStyle({
              weight: 1.15,
              fillOpacity: completedRef.current.has(oldId) ? 0.83 : isWishlist ? 0.83 : 0.55,
            });
          }
        }
        safeCloseTooltip(layer);
      }
    }

    if (activeId) {
      const layer = layerRefs.current.get(activeId);
      if (layer) {
        if (diffModeRef.current) {
          (layer as Path).setStyle({ weight: 2.5, fillOpacity: 0.9 });
        } else {
          if (layerRefs.current.has(activeId)) {
            const isWishlist = wishlistRef.current.has(activeId);
            (layer as Path).setStyle({
              weight: 2.5,
              fillOpacity: completedRef.current.has(activeId) ? 0.9 : isWishlist ? 0.9 : 0.75,
            });
          }
        }
      }
    } else {
      layerRefs.current.forEach((layer, id) => {
        safeCloseTooltip(layer);
        if (diffModeRef.current) {
          const ds = getDiffGeoStyleRef(id);
          (layer as Path).setStyle({ weight: ds.weight, fillOpacity: ds.fillOpacity });
        } else {
          const isWishlist = wishlistRef.current.has(id);
          (layer as Path).setStyle({
            weight: 1.15,
            fillOpacity: completedRef.current.has(id) ? 0.83 : isWishlist ? 0.83 : 0.55,
          });
        }
      });
    }
    activeIdRef.current = activeId || null;
  }, [activeId, getDiffGeoStyleRef]);

  // ── Memoized style functions ──
  const geoStyle = useCallback(
    (f: any) => {
      const country = f ? resolveCountryFromFeature(f as any) : undefined;

      if (diffMode && country) return getDiffGeoStyleRef(country.id);
      const isDone = country ? completed.has(country.id) : false;
      const isWishlist = country ? wishlist.has(country.id) : false;
      return {
        color: isDone ? "#4a2878" : isWishlist ? "#d2a54b" : "#9b8ab8",
        weight: 1.15,
        fillColor: isDone ? "#7b52ab" : isWishlist ? "#ecd9a5" : "#ece5f3",
        fillOpacity: isDone ? 0.83 : isWishlist ? 0.83 : 0.55
      };
    },
    [completed, wishlist, diffMode, getDiffGeoStyleRef],
  );

  // ── Reactively update layer styles without remounting GeoJSON ──
  useEffect(() => {
    layerRefs.current.forEach((layer) => {
      const feature = (layer as any).feature;
      if (feature) {
        layer.setStyle(geoStyle(feature));
      }
    });
  }, [geoStyle]);

  // ── Stable onEachFeature (uses refs) ──
  const onEachFeature = useCallback(
    (f: any, layer: L.Layer) => {
      const country = resolveCountryFromFeature(f as any);
      if (country) {
        layerRefs.current.set(country.id, layer as Path);
        const isDone = completedRef.current.has(country.id);
        const isWishlist = wishlistRef.current.has(country.id);
        const statusClass = isDone ? "tooltip-done" : isWishlist ? "tooltip-wishlist" : "tooltip-todo";
        layer.bindTooltip(country.name, { 
          sticky: true,
          className: `summit-tooltip ${statusClass}`,
        });
        layer.on("click", (e: L.LeafletMouseEvent) => {
          if (selectingLocationRef.current) return;
          safeCloseTooltip(layer);
          onInformationRef.current(country);
        });

        layer.on("mouseover", () => {
          if (diffModeRef.current) {
            (layer as Path).setStyle({ weight: 2.5, fillOpacity: 0.9 });
          } else {
            const isWishlist = wishlistRef.current.has(country.id);
            (layer as Path).setStyle({
              weight: 2.5,
              fillOpacity: completedRef.current.has(country.id) ? 0.9 : isWishlist ? 0.9 : 0.75,
            });
          }
        });
        layer.on("mouseout", () => {
          if (country.id === activeIdRef.current) return;
          if (diffModeRef.current) {
            const ds = getDiffGeoStyleRef(country.id);
            (layer as Path).setStyle({ weight: ds.weight, fillOpacity: ds.fillOpacity });
          } else {
            const isWishlist = wishlistRef.current.has(country.id);
            (layer as Path).setStyle({
              weight: 1.15,
              fillOpacity: completedRef.current.has(country.id) ? 0.83 : isWishlist ? 0.83 : 0.55,
            });
          }
        });
      }
    },
    [getDiffGeoStyleRef],
  );



  // ── Memoized experiences markers ──
  const experiencesMarkers = useMemo(() => {
    if (experiencesMode && experienceRecords) {
      return experienceRecords.map((r, i) => {
        let expIcon = expIconCache.get(r.icon_name);
        if (!expIcon) {
          const iconHtml = ReactDOMServer.renderToString(
            <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <span className="summit-pin summit-pin--experience summit-pin--done" style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
                {getIconComponent(r.icon_name)}
              </span>
            </div>
          );
          expIcon = L.divIcon({
            className: "experience-hitbox",
            html: iconHtml,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          });
          expIconCache.set(r.icon_name, expIcon);
        }
        
        return (
          <Marker
            key={`exp-${r.id || i}`}
            position={[r.lat, r.lng]}
            icon={expIcon}
            zIndexOffset={1000}
            eventHandlers={{
              click: () => {
                if (experiencesModeRef.current && onExperienceClick) {
                  onExperienceClick(r);
                }
              },
            }}
          />
        );
      });
    }
    return null;
  }, [experiencesMode, experienceRecords, onExperienceClick]);

  return (
    <>
      <MapContainer
        className="map"
      scrollWheelZoom={true}
      preferCanvas={true}
      minZoom={1}
      maxZoom={12}
      maxBounds={[
        [-85, -180],
        [85, 180]
      ]}
      maxBoundsViscosity={0.5}
    >
      <FitWorld isActive={isActive} />
      <MapInvalidator panelOpen={panelOpen} isActive={isActive} />
      <MapActiveSynchronizer isActive={isActive} />
      <MapZoomListener isActive={isActive} />
      <MapClickListener onMapClick={onMapClick} selectingLocation={selectingLocation} />
      <SweepOverlay searchedId={searchedId} layerRefs={layerRefs} />

      {experiencesMode && onAddExperience && !selectingLocation && (
        <div
          className="leaflet-control"
          style={{
            position: 'absolute',
            top: 56,
            right: 10,
            zIndex: 1000,
            background: 'white',
            borderRadius: '50%',
            boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'auto',
            cursor: 'pointer'
          }}
          title="Añadir experiencia en el mapa"
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAddExperience();
          }}
        >
          <svg style={{ width: 18, height: 18, color: '#666' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" />
          </svg>
        </div>
      )}

      {selectingLocation && (
        <div className="leaflet-control-container">
          <div className="leaflet-top leaflet-center" style={{ pointerEvents: 'none', zIndex: 1000, width: '100%', display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <div 
              className="leaflet-control selecting-location-banner" 
              ref={(el) => {
                if (el) {
                  L.DomEvent.disableClickPropagation(el);
                  L.DomEvent.disableScrollPropagation(el);
                }
              }} 
              style={{ 
                position: 'relative',
                pointerEvents: 'auto', 
                background: 'var(--pine)', 
                color: '#fff', 
                padding: '12px 42px 12px 20px', 
                borderRadius: 16, 
                boxShadow: '0 4px 14px rgba(0,0,0,0.2)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontWeight: 500, 
                fontSize: '0.9rem', 
                maxWidth: 420, 
                width: '90%', 
                textAlign: 'center',
              }}
            >
              <span style={{ display: 'inline', lineHeight: 1.4, fontSize: '14px' }}>
                Haz clic en el mapa para situar la experiencia o busca el lugar aquí
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, display: 'inline-block', verticalAlign: 'text-bottom', marginLeft: 4, opacity: 0.85 }}>
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </span>
              <button
                type="button"
                className="selecting-location-cancel-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onCancelSelectingLocation) onCancelSelectingLocation();
                }}
                aria-label="Cerrar solicitud de ubicación"
                title="Cerrar solicitud de ubicación"
                style={{
                  position: 'absolute',
                  top: '50%',
                  right: 8,
                  transform: 'translateY(-50%)',
                  background: 'rgba(255, 255, 255, 0.18)',
                  border: 'none',
                  color: '#ffffff',
                  cursor: 'pointer',
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.35)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.18)';
                }}
              >
                <X size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      )}
      {!selectingLocation && (
        <MapSearchControl 
          items={searchItems} 
          onSelect={handleSearchSelect} 
          placeholder="Buscar país..." 
          offsetDown={hasCompareButton}
        />
      )}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        minZoom={1}
        keepBuffer={16}
        updateWhenIdle={false}
        updateInterval={100}
        maxNativeZoom={19}
      />
      {geo && (
        <GeoJSON
          key="countries"
          data={geo}
          style={geoStyle}
          onEachFeature={onEachFeature}
        />
      )}
      <CountryMarkersLayer
        showCountryMarkers={true}
        countriesWithCoords={countriesWithCoords}
        diffMode={diffMode}
        getDiffIcon={getDiffIcon}
        completed={completed}
        wishlist={wishlist}
        icons={icons}
        selectingLocation={selectingLocation}
        onInformation={onInformation}
      />
      {experiencesMarkers}
    </MapContainer>
    </>
  );
});
