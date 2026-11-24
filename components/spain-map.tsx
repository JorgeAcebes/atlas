"use client";

import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Marker,
} from "react-leaflet";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import type { FeatureCollection, Position } from "geojson";
import { peakByCode, peaks, type Peak } from "@/data/peaks";
import { isMobileOrTablet } from "@/lib/device-utils";
import { createAdaptiveCanvasRenderer, getAdaptiveKeepBuffer } from "@/lib/leaflet-canvas-patch";
import { fetchSpainGeo, getCachedSpainGeo } from "@/lib/geo-loader";
import { FitSpain } from "@/lib/leaflet-bounds";
import { getPeakMarkerIcons } from "@/lib/leaflet-icons";
import {
  createTileRetryHandlers,
  HoverHighlightBridge,
  MapActiveSynchronizer,
  MapInvalidator,
  MapTileWakeup,
  MapZoomListener,
  safeCloseTooltip,
} from "./maps/map-lifecycle";
import { MapSearchControl, type SearchItem } from "./map-search";
import { SweepOverlay } from "./sweep-overlay";

if (typeof window !== "undefined") {
  fetchSpainGeo().catch(() => {});
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
  isActive?: boolean;
};

function getFeaturesBounds(features: any[]): L.LatLngBounds | undefined {
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  let count = 0;

  function scan(coords: any) {
    if (!coords) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const lng = coords[0];
      const lat = coords[1];
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      count++;
    } else if (Array.isArray(coords)) {
      for (const c of coords as Position[]) scan(c);
    }
  }

  for (const f of features) {
    if (f?.geometry?.coordinates) {
      scan(f.geometry.coordinates);
    }
  }
  if (count === 0) return undefined;
  return L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
}

const peakEntries = Object.values(peakByCode);
const uniquePeakEntries = Array.from(new Map(peaks.map((p) => [p.id, p])).values());

const PeakMarker = memo(function PeakMarker({
  peak,
  icon,
  onClick,
}: {
  peak: Peak;
  icon: L.DivIcon;
  onClick: (peak: Peak) => void;
}) {
  const eventHandlers = useMemo(
    () => ({
      click: () => onClick(peak),
    }),
    [onClick, peak]
  );

  return <Marker position={peak.coordinates} icon={icon} eventHandlers={eventHandlers} />;
});

function SpainPeakMarkersLayer({
  diffMode,
  diffOnlyViewer,
  diffOnlyTarget,
  diffBoth,
  completed,
  wishlist,
  onPeakClick,
}: {
  diffMode?: boolean;
  diffOnlyViewer?: Set<string>;
  diffOnlyTarget?: Set<string>;
  diffBoth?: Set<string>;
  completed: Set<string>;
  wishlist: Set<string>;
  onPeakClick: (peak: Peak) => void;
}) {
  const icons = getPeakMarkerIcons();

  return (
    <>
      {uniquePeakEntries.map((peak) => (
        <PeakMarker
          key={peak.id}
          peak={peak}
          icon={
            diffMode
              ? diffOnlyViewer?.has(peak.code)
                ? icons.diffOnlyMe
                : diffOnlyTarget?.has(peak.code)
                  ? icons.diffOnlyThem
                  : diffBoth?.has(peak.code)
                    ? icons.diffBoth
                    : icons.diffNone
              : completed.has(peak.code)
                ? icons.done
                : wishlist.has(peak.code)
                  ? icons.wishlist
                  : icons.todo
          }
          onClick={onPeakClick}
        />
      ))}
    </>
  );
}

export const SpainMap = memo(function SpainMap({
  completed,
  wishlist,
  onInformation,
  onComplete: _onComplete,
  diffMode,
  diffOnlyViewer,
  diffOnlyTarget,
  diffBoth,
  activeId,
  panelOpen,
  hasCompareButton,
  isActive = true,
}: Props) {
  void _onComplete;
  const canvasRenderer = useMemo(() => createAdaptiveCanvasRenderer("spain"), []);
  const keepBuffer = useMemo(() => getAdaptiveKeepBuffer(), []);
  const tileEventHandlers = useMemo(() => createTileRetryHandlers(), []);
  const [geo, setGeo] = useState<FeatureCollection | null>(() => getCachedSpainGeo());
  const [searchedId, setSearchedId] = useState<string | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanFrameRef = useRef<number | null>(null);

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

  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentHoveredCodeRef = useRef<string | null>(null);
  const hoverHighlightRef = useRef<L.GeoJSON | null>(null);

  const activeCodes = useMemo(() => {
    if (!activeId) return [] as string[];
    return peakEntries.filter((p) => p.id === activeId).map((p) => p.code);
  }, [activeId]);

  const activeCodesRef = useRef<string[]>([]);

  useEffect(() => {
    if (!getCachedSpainGeo()) {
      fetchSpainGeo().then(setGeo).catch(() => setGeo(null));
    }
  }, []);

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

  const restoreLayerStyle = useCallback(
    (code: string, layer: L.Path) => {
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
    },
    [getDiffStyleRef]
  );

  const clearHoverState = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    hoverHighlightRef.current?.clearLayers();
    if (currentHoveredCodeRef.current) {
      const prevCode = currentHoveredCodeRef.current;
      currentHoveredCodeRef.current = null;
      const prevLayer = layerRefs.current.get(prevCode);
      if (prevLayer) {
        safeCloseTooltip(prevLayer);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
    };
  }, []);

  // O(k) activeCodes transition update (highlights all provinces of shared summits)
  useEffect(() => {
    const oldCodes = activeCodesRef.current;
    for (const oldCode of oldCodes) {
      if (!activeCodes.includes(oldCode)) {
        const prevLayer = layerRefs.current.get(oldCode);
        if (prevLayer) {
          restoreLayerStyle(oldCode, prevLayer);
          safeCloseTooltip(prevLayer);
        }
      }
    }

    for (const code of activeCodes) {
      const layer = layerRefs.current.get(code);
      if (layer) {
        if (diffModeRef.current) {
          layer.setStyle({ weight: 2.5, fillOpacity: 0.9 });
        } else {
          const isWishlist = wishlistRef.current.has(code);
          layer.setStyle({
            weight: 2.5,
            fillOpacity: completedRef.current.has(code) ? 0.9 : isWishlist ? 0.9 : 0.85,
          });
        }
      }
    }
    activeCodesRef.current = activeCodes;
  }, [activeCodes, restoreLayerStyle]);

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
        fillOpacity: isDone ? 0.83 : isWishlist ? 0.83 : 0.72,
      };
    },
    [completed, wishlist, diffMode, getDiffStyleRef]
  );

  const onEachFeature = useCallback(
    (feature: any, layer: L.Layer) => {
      const peak = peakByCode[String(feature.properties?.Codigo ?? "")];
      if (!peak) return;

      const pathLayer = layer as L.Path;
      layerRefs.current.set(peak.code, pathLayer);
      const isDone = completedRef.current.has(peak.code);
      const isWishlist = wishlistRef.current.has(peak.code);
      const statusClass = isDone ? "tooltip-done" : isWishlist ? "tooltip-wishlist" : "tooltip-todo";

      pathLayer.bindTooltip(`${peak.province}: ${peak.name}`, {
        sticky: true,
        className: `summit-tooltip ${statusClass}`,
      });
      pathLayer.off("mouseover", (pathLayer as any)._openTooltip);

      pathLayer.on("click", () => {
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = null;
        }
        hoverHighlightRef.current?.clearLayers();
        safeCloseTooltip(pathLayer);
        onInformationRef.current(peak);
      });

      pathLayer.on("mouseover", (e: L.LeafletMouseEvent) => {
        const map = (pathLayer as any)._map;
        if (!map || map._isWheeling || map._animatingZoom || (map.dragging && map.dragging.moving())) {
          return;
        }

        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = null;
        }

        if (currentHoveredCodeRef.current && currentHoveredCodeRef.current !== peak.code) {
          const prevCode = currentHoveredCodeRef.current;
          currentHoveredCodeRef.current = null;
          hoverHighlightRef.current?.clearLayers();
          const prevLayer = layerRefs.current.get(prevCode);
          if (prevLayer) {
            safeCloseTooltip(prevLayer);
          }
        }

        if (activeCodesRef.current.includes(peak.code)) {
          return;
        }

        const latlng = e.latlng;
        hoverTimeoutRef.current = setTimeout(() => {
          hoverTimeoutRef.current = null;
          const currentMap = (pathLayer as any)._map;
          if (!currentMap || currentMap._isWheeling || currentMap._animatingZoom || (currentMap.dragging && currentMap.dragging.moving())) {
            return;
          }

          currentHoveredCodeRef.current = peak.code;
          let highlightStyle: L.PathOptions;
          if (diffModeRef.current) {
            const ds = getDiffStyleRef(peak.code);
            highlightStyle = { ...ds, weight: 2.5, fillOpacity: 0.9 };
          } else {
            const isDone = completedRef.current.has(peak.code);
            const isWishlist = wishlistRef.current.has(peak.code);
            highlightStyle = {
              color: isDone ? "#245f52" : isWishlist ? "#d2a54b" : "#8bb8ae",
              weight: 2.5,
              fillColor: isDone ? "#5c9b7d" : isWishlist ? "#ecd9a5" : "#e7f1ea",
              fillOpacity: isDone ? 0.9 : isWishlist ? 0.9 : 0.85,
            };
          }
          const hl = hoverHighlightRef.current;
          if (hl) {
            hl.clearLayers();
            hl.addData(feature);
            hl.setStyle(highlightStyle);
          }
          if (latlng && typeof pathLayer.openTooltip === "function") {
            pathLayer.openTooltip(latlng);
          }
        }, 80);
      });

      pathLayer.on("mouseout", () => {
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = null;
        }

        if (peak.code === currentHoveredCodeRef.current) {
          currentHoveredCodeRef.current = null;
          hoverHighlightRef.current?.clearLayers();
          safeCloseTooltip(pathLayer);
        }
      });
    },
    [getDiffStyleRef]
  );

  useEffect(() => {
    layerRefs.current.forEach((layer) => {
      const f = (layer as any).feature;
      if (f) {
        layer.setStyle(geoStyle(f));
      }
    });
  }, [geoStyle]);

  const searchItems = useMemo<SearchItem[]>(() => {
    const featuresByCode = new Map<string, any>();
    if (geo) {
      for (const f of geo.features) {
        const code = String(f.properties?.Codigo ?? "");
        if (code) {
          featuresByCode.set(code, f);
        }
      }
    }

    return peakEntries.map((peak) => {
      let bounds: any;
      if (geo) {
        const relatedCodes = peakEntries.filter((p) => p.id === peak.id).map((p) => p.code);
        const relatedFeatures = relatedCodes.map((c) => featuresByCode.get(c)).filter(Boolean);
        if (relatedFeatures.length > 0) {
          bounds = getFeaturesBounds(relatedFeatures);
        }
      }
      return {
        id: peak.code,
        name: peak.name,
        nameLocal: peak.province,
        type: "peak",
        coordinates: peak.coordinates,
        bounds,
        originalData: peak,
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
        setSearchedId((current) => (current === item.id ? null : current));
      }, 900);
    });
  }, []);

  useEffect(
    () => () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
      if (scanFrameRef.current) cancelAnimationFrame(scanFrameRef.current);
    },
    []
  );

  const handleMarkerClick = useCallback((peak: Peak) => {
    onInformationRef.current(peak);
  }, []);

  return (
    <MapContainer
      className="map map-spain"
      center={[40.4168, -3.7038]}
      zoom={5}
      renderer={canvasRenderer}
      preferCanvas={true}
      scrollWheelZoom={true}
      zoomSnap={1}
      zoomDelta={1}
      wheelPxPerZoomLevel={85}
      wheelDebounceTime={20}
      inertia={true}
      inertiaDeceleration={1600}
      inertiaMaxSpeed={1800}
      easeLinearity={0.18}
      minZoom={5}
      maxZoom={10}
      maxBounds={[
        [26.0, -19.8],
        [45.0, 6.0],
      ]}
      maxBoundsViscosity={0.5}
    >
      <FitSpain isActive={isActive} />
      <MapInvalidator panelOpen={panelOpen} isActive={isActive} />
      <MapActiveSynchronizer isActive={isActive} kind="spain" />
      <MapTileWakeup isActive={isActive} />
      <MapZoomListener
        isActive={isActive}
        storageKey="mapState_spain"
        onInteractionStart={clearHoverState}
      />
      <HoverHighlightBridge highlightLayerRef={hoverHighlightRef} />
      <SweepOverlay searchedId={searchedId} layerRefs={layerRefs} />
      <MapSearchControl
        items={searchItems}
        onSelect={handleSearchSelect}
        placeholder="Buscar pico o provincia..."
        offsetDown={hasCompareButton}
      />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        minZoom={5}
        maxZoom={10}
        keepBuffer={keepBuffer}
        updateWhenIdle={false}
        updateInterval={100}
        maxNativeZoom={19}
        updateWhenZooming={isMobileOrTablet() ? undefined : false}
        eventHandlers={tileEventHandlers}
      />
      {geo && <GeoJSON key="spain-provinces" data={geo} style={geoStyle} onEachFeature={onEachFeature} />}
      <SpainPeakMarkersLayer
        diffMode={diffMode}
        diffOnlyViewer={diffOnlyViewer}
        diffOnlyTarget={diffOnlyTarget}
        diffBoth={diffBoth}
        completed={completed}
        wishlist={wishlist}
        onPeakClick={handleMarkerClick}
      />
    </MapContainer>
  );
});
