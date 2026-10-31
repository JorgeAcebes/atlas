"use client";

import L from "leaflet";
import {
  GeoJSON,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { FeatureCollection } from "geojson";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { peakByCode, type Peak } from "@/data/peaks";
import { MapSearchControl, type SearchItem } from "./map-search";
import { SweepOverlay } from "./sweep-overlay";

// Override Leaflet's default canvas padding to preload vector shapes outside the viewport
L.Canvas.prototype.options.padding = 0.5;
L.Polyline.prototype.options.smoothFactor = 1.2;

// Ensure Leaflet Canvas expands dynamically during dragging when nearing canvas edge
if (typeof window !== "undefined" && L && L.Canvas) {
  const proto = L.Canvas.prototype as any;
  if (!proto._atlasMovePatched) {
    proto._atlasMovePatched = true;
    const originalGetEvents = proto.getEvents;
    proto.getEvents = function () {
      const events = originalGetEvents.call(this);
      events.move = this._onCanvasMove;
      return events;
    };
    proto._onCanvasMove = function () {
      if (!this._map || !this._bounds) return;
      const size = this._map.getSize();
      if (!size || size.x === 0 || size.y === 0) return;
      const vpMin = this._map.containerPointToLayerPoint([0, 0]);
      const vpMax = this._map.containerPointToLayerPoint(size);
      const pad = 60;
      if (
        vpMin.x - pad < this._bounds.min.x ||
        vpMin.y - pad < this._bounds.min.y ||
        vpMax.x + pad > this._bounds.max.x ||
        vpMax.y + pad > this._bounds.max.y
      ) {
        if (this._moveRaf) return;
        this._moveRaf = requestAnimationFrame(() => {
          this._moveRaf = null;
          if (this._map) {
            this._update();
          }
        });
      }
    };
  }
}

const PROVINCES_TOPO_URL = "/provincias_spain.topo.json";
const PROVINCES_URL = "/provincias_spain.geojson";
const PROVINCES_FALLBACK_URL =
  "https://gist.githubusercontent.com/josemamira/3af52a4698d42b3f676fbc23f807a605/raw/cc5e247b63b05520c167639ed51d61acd560b1c1/provincias_spain.geojson";

// ── Module-level GeoJSON cache ────────────
let _geoCache: FeatureCollection | null = null;
let _geoPromise: Promise<FeatureCollection> | null = null;

function fetchProvinces(): Promise<FeatureCollection> {
  if (_geoCache) return Promise.resolve(_geoCache);
  if (!_geoPromise) {
    _geoPromise = fetch(PROVINCES_TOPO_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((topology: Topology) => {
        const provincesGeo = feature(
          topology,
          (topology.objects.provincias || Object.values(topology.objects)[0]) as any
        ) as unknown as FeatureCollection;
        _geoCache = provincesGeo;
        return provincesGeo;
      })
      .catch(() => {
        return fetch(PROVINCES_URL)
          .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          })
          .catch(() => {
            return fetch(PROVINCES_FALLBACK_URL).then((r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              return r.json();
            });
          })
          .then((data: FeatureCollection) => {
            _geoCache = data;
            return data;
          });
      })
      .catch((err) => {
        _geoPromise = null;
        throw err;
      });
  }
  return _geoPromise;
}

type Props = {
  completed: Set<string>;
  wishlist: Set<string>;
  onInformation: (peak: Peak) => void;
  onComplete: (peak: Peak) => void;
  diffMode?: boolean;
  diffOnlyViewer?: Set<string>;
  diffOnlyTarget?: Set<string>;
  diffBoth?: Set<string>;
  activeId?: string;
  panelOpen?: boolean;
  hasCompareButton?: boolean;
  /** Whether the map tab is currently visible. When false, Leaflet operations
   *  that depend on the container having a non-zero size are skipped to prevent
   *  the map from jumping/zooming-in when navigating back from other tabs. */
  isActive?: boolean;
};

function FitSpain({ isActive }: { isActive?: boolean }) {
  const map = useMap();
  const hasFittedRef = useRef(false);

  useEffect(() => {
    if (isActive === false) return;
    const container = map.getContainer();
    if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;
    if (hasFittedRef.current) return;
    hasFittedRef.current = true;

    if (window.location.hash.startsWith("#panel=")) {
      const saved = sessionStorage.getItem("mapState_spain");
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
    map.fitBounds(
      [
        [27.55, -18.65],
        [43.95, 4.95],
      ],
      { padding: [12, 12] },
    );
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
        const rounded = Math.round(map.getZoom()).toString();
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
        sessionStorage.setItem("mapState_spain", JSON.stringify({ zoom, center }));
      }
      const rounded = Math.round(zoom).toString();
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
        sessionStorage.setItem("mapState_spain", JSON.stringify({ zoom, center }));
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
    const rounded = Math.round(map.getZoom()).toString();
    if (container.getAttribute("data-zoom") !== rounded) {
      container.setAttribute("data-zoom", rounded);
    }
  }, [map, isActive]);
  return null;
}

// ── Stable marker list (never changes) ────
const peakEntries = Object.values(peakByCode);

const PEAK_MARKER_ICONS = {
  done: L.divIcon({
    className: "",
    html: '<span class="summit-pin summit-pin--done"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  }),
  todo: L.divIcon({
    className: "",
    html: '<span class="summit-pin"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path></svg></span>',
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
    html: '<span class="summit-pin summit-pin--diff-none"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path></svg></span>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  }),
};

type PeakMarkerProps = {
  peak: Peak;
  icon: L.DivIcon;
  onClick: (peak: Peak) => void;
};

const PeakMarker = memo(function PeakMarker({ peak, icon, onClick }: PeakMarkerProps) {
  const eventHandlers = useMemo(
    () => ({
      click: () => onClick(peak),
    }),
    [onClick, peak]
  );

  return (
    <Marker
      position={peak.coordinates}
      icon={icon}
      eventHandlers={eventHandlers}
    />
  );
});

export const SpainMap = memo(function SpainMap({ completed, wishlist, onInformation, onComplete, diffMode, diffOnlyViewer, diffOnlyTarget, diffBoth, activeId, panelOpen, hasCompareButton, isActive = true }: Props) {
  const [geo, setGeo] = useState<FeatureCollection | null>(_geoCache);
  const [searchedId, setSearchedId] = useState<string | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanFrameRef = useRef<number | null>(null);

  // Use refs for values accessed inside Leaflet event handlers
  // so we don't recreate onEachFeature on every prop change
  const completedRef = useRef(completed);
  const wishlistRef = useRef(wishlist);
  const diffModeRef = useRef(diffMode);
  const diffOnlyViewerRef = useRef(diffOnlyViewer);
  const diffOnlyTargetRef = useRef(diffOnlyTarget);
  const diffBothRef = useRef(diffBoth);
  const onInformationRef = useRef(onInformation);
  const layerRefs = useRef(new Map<string, L.Path>());

  completedRef.current = completed;
  wishlistRef.current = wishlist;
  diffModeRef.current = diffMode;
  diffOnlyViewerRef.current = diffOnlyViewer;
  diffOnlyTargetRef.current = diffOnlyTarget;
  diffBothRef.current = diffBoth;
  onInformationRef.current = onInformation;

  const activeCode = useMemo(() => {
    if (!activeId) return null;
    const peak = peakEntries.find(p => p.id === activeId);
    return peak ? peak.code : null;
  }, [activeId]);

  const activeCodeRef = useRef<string | null>(null);


  useEffect(() => {
    if (!_geoCache) {
      fetchProvinces().then(setGeo).catch(() => setGeo(null));
    }
  }, []);

  const markerIcons = PEAK_MARKER_ICONS;

  function getDiffIcon(code: string) {
    if (diffOnlyViewer?.has(code)) return PEAK_MARKER_ICONS.diffOnlyMe;
    if (diffOnlyTarget?.has(code)) return PEAK_MARKER_ICONS.diffOnlyThem;
    if (diffBoth?.has(code)) return PEAK_MARKER_ICONS.diffBoth;
    return PEAK_MARKER_ICONS.diffNone;
  }

  // ── Stable getDiffStyle (reads from refs) ──
  const getDiffStyleRef = useCallback((code: string) => {
    if (diffOnlyViewerRef.current?.has(code)) {
      return { color: "#245f52", weight: 1.5, fillColor: "#5c9b7d", fillOpacity: 0.8 };
    }
    if (diffOnlyTargetRef.current?.has(code)) {
      return { color: "#8c3a25", weight: 1.5, fillColor: "#c75a3a", fillOpacity: 0.75 };
    }
    if (diffBothRef.current?.has(code)) {
      return { color: "#7da894", weight: 1.15, fillColor: "#bcd4c8", fillOpacity: 0.7 };
    }
    return { color: "#c4bfb6", weight: 0.8, fillColor: "#e8e4df", fillOpacity: 0.45 };
  }, []);

  useEffect(() => {
    const oldCode = activeCodeRef.current;
    if (oldCode && oldCode !== activeCode) {
      const layer = layerRefs.current.get(oldCode);
      if (layer) {
        if (diffModeRef.current) {
          const ds = getDiffStyleRef(oldCode);
          layer.setStyle({ weight: ds.weight, fillOpacity: ds.fillOpacity });
        } else {
          const isWishlist = wishlistRef.current.has(oldCode);
          layer.setStyle({
            weight: 1.15,
            fillOpacity: completedRef.current.has(oldCode) ? 0.83 : isWishlist ? 0.83 : 0.72,
          });
        }
        safeCloseTooltip(layer);
      }
    }

    if (activeCode) {
      const layer = layerRefs.current.get(activeCode);
      if (layer) {
        if (diffModeRef.current) {
          layer.setStyle({ weight: 2.5, fillOpacity: 0.9 });
        } else {
          const isWishlist = wishlistRef.current.has(activeCode);
          layer.setStyle({
            weight: 2.5,
            fillOpacity: completedRef.current.has(activeCode) ? 0.9 : isWishlist ? 0.9 : 0.85,
          });
        }
      }
    } else {
      layerRefs.current.forEach((layer, code) => {
        safeCloseTooltip(layer);
        if (diffModeRef.current) {
          const ds = getDiffStyleRef(code);
          layer.setStyle({ weight: ds.weight, fillOpacity: ds.fillOpacity });
        } else {
          const isWishlist = wishlistRef.current.has(code);
          layer.setStyle({
            weight: 1.15,
            fillOpacity: completedRef.current.has(code) ? 0.83 : isWishlist ? 0.83 : 0.72,
          });
        }
      });
    }
    activeCodeRef.current = activeCode || null;
  }, [activeCode, getDiffStyleRef]);


  // ── Memoized style function (recreated only when data deps change) ──
  const geoStyle = useCallback(
    (feature: any) => {
      const code = String(feature?.properties?.Codigo ?? "");
      if (diffMode) return getDiffStyleRef(code);
      const isDone = completed.has(code);
      const isWishlist = wishlist.has(code);
      return {
        color: isDone ? "#245f52" : isWishlist ? "#d2a54b" : "#8bb8ae",
        weight: 1.15,
        fillColor: isDone ? "#5c9b7d" : isWishlist ? "#ecd9a5" : "#e7f1ea",
        fillOpacity: isDone ? 0.83 : isWishlist ? 0.83 : 0.72
      };
    },
    [completed, wishlist, diffMode, getDiffStyleRef],
  );

  // ── Stable onEachFeature (uses refs to avoid GeoJSON remount) ──
  const onEachFeature = useCallback(
    (feature: any, layer: L.Layer) => {
      const peak = peakByCode[String(feature.properties?.Codigo ?? "")];
      if (peak) {
        layerRefs.current.set(peak.code, layer as L.Path);
        const isDone = completedRef.current.has(peak.code);
        const isWishlist = wishlistRef.current.has(peak.code);
        const statusClass = isDone ? "tooltip-done" : isWishlist ? "tooltip-wishlist" : "tooltip-todo";

        layer.bindTooltip(`${peak.province}: ${peak.name}`, {
          sticky: true,
          className: `summit-tooltip ${statusClass}`,
        });
        layer.on("click", () => {
          safeCloseTooltip(layer);
          onInformationRef.current(peak);
        });

        layer.on("mouseover", () => {
          if (diffModeRef.current) {
            (layer as L.Path).setStyle({ weight: 2.5, fillOpacity: 0.9 });
          } else {
            const isWishlist = wishlistRef.current.has(peak.code);
            (layer as L.Path).setStyle({
              weight: 2.5,
              fillOpacity: completedRef.current.has(peak.code) ? 0.9 : isWishlist ? 0.9 : 0.85,
            });
          }
        });
        layer.on("mouseout", () => {
          if (peak.code === activeCodeRef.current) return;
          if (diffModeRef.current) {
            const ds = getDiffStyleRef(peak.code);
            (layer as L.Path).setStyle({ weight: ds.weight, fillOpacity: ds.fillOpacity });
          } else {
            const isWishlist = wishlistRef.current.has(peak.code);
            (layer as L.Path).setStyle({
              weight: 1.15,
              fillOpacity: completedRef.current.has(peak.code) ? 0.83 : isWishlist ? 0.83 : 0.72,
            });
          }
        });
      }
    },
    [getDiffStyleRef],
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

  const searchItems = useMemo<SearchItem[]>(() => {
    return peakEntries.map(peak => {
      let bounds: any = undefined;
      if (geo) {
        // Encontrar los códigos de provincia que comparten este pico (por su id)
        const relatedCodes = peakEntries
          .filter(p => p.id === peak.id)
          .map(p => p.code);
        
        const relatedFeatures = geo.features.filter(f => 
          relatedCodes.includes(String(f.properties?.Codigo ?? ""))
        );

        if (relatedFeatures.length > 0) {
          bounds = L.geoJSON(relatedFeatures as any).getBounds();
        }
      }
      return {
        id: peak.code,
        name: peak.name,
        nameLocal: peak.province,
        type: "peak",
        coordinates: peak.coordinates,
        bounds,
        originalData: peak
      };
    });
  }, [geo]);

  const handleSearchSelect = useCallback((item: SearchItem) => {
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    if (scanFrameRef.current) cancelAnimationFrame(scanFrameRef.current);

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

  const handleMarkerClick = useCallback((peak: Peak) => {
    onInformationRef.current(peak);
  }, []);

  const markers = useMemo(
    () =>
      peakEntries.map((peak) => (
        <PeakMarker
          key={peak.code}
          peak={peak}
          icon={
            diffMode
              ? getDiffIcon(peak.code)
              : completed.has(peak.code)
                ? PEAK_MARKER_ICONS.done
                : wishlist.has(peak.code)
                  ? PEAK_MARKER_ICONS.wishlist
                  : PEAK_MARKER_ICONS.todo
          }
          onClick={handleMarkerClick}
        />
      )),
    [completed, wishlist, diffMode, diffOnlyViewer, diffOnlyTarget, diffBoth, handleMarkerClick],
  );

  return (
    <>
      <MapContainer
        className="map map-spain"
        scrollWheelZoom={true}
        preferCanvas={true}
        minZoom={4}
        maxZoom={10}
        maxBounds={[
          [18, -28],
          [52, 18]
        ]}
        maxBoundsViscosity={0.5}
      >
        <FitSpain isActive={isActive} />
        <MapInvalidator panelOpen={panelOpen} isActive={isActive} />
        <MapActiveSynchronizer isActive={isActive} />
        <MapZoomListener isActive={isActive} />
      <SweepOverlay searchedId={searchedId} layerRefs={layerRefs} />
      <MapSearchControl 
        items={searchItems} 
        onSelect={handleSearchSelect} 
        placeholder="Buscar pico o provincia..." 
        offsetDown={hasCompareButton}
      />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        keepBuffer={16}
        updateWhenIdle={false}
        updateInterval={100}
        maxNativeZoom={19}
      />
      {geo && (
        <GeoJSON
          key="spain-provinces"
          data={geo}
          style={geoStyle}
          onEachFeature={onEachFeature}
        />
      )}
      {markers}
    </MapContainer>
    </>
  );
});
