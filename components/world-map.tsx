"use client";

import L, { Path } from "leaflet";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import type { FeatureCollection } from "geojson";
import { countries, resolveCountryFromFeature, type Country } from "@/data/countries";
import { isMobileOrTablet } from "@/lib/device-utils";
import {
  createAdaptiveCanvasRenderer,
  getAdaptiveInertiaOptions,
  getAdaptiveKeepBuffer,
} from "@/lib/leaflet-canvas-patch";
import { fetchWorldGeo, getCachedWorldGeo, getLargestPolygonBounds } from "@/lib/geo-loader";
import { FitWorld } from "@/lib/leaflet-bounds";
import { getExperienceIcon, getWorldMarkerIcons } from "@/lib/leaflet-icons";
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
import { X } from "lucide-react";

if (typeof window !== "undefined") {
  fetchWorldGeo().catch(() => {});
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
  isActive?: boolean;
};

function ExperienceMapClickListener({
  onMapClick,
  selectingLocation,
}: {
  onMapClick?: (lat: number, lng: number, placeName?: string) => void;
  selectingLocation?: boolean;
}) {
  const onMapClickRef = useRef(onMapClick);
  const selectingLocationRef = useRef(selectingLocation);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
    selectingLocationRef.current = selectingLocation;
  }, [onMapClick, selectingLocation]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const map = useMapEvents({
    click(e) {
      if (onMapClickRef.current && selectingLocationRef.current) {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.latlng.lat}&lon=${e.latlng.lng}&zoom=10`,
          { signal: controller.signal }
        )
          .then((res) => res.json())
          .then((data) => {
            if (controller.signal.aborted) return;
            if (data.error) throw new Error("Nominatim error");
            const placeName =
              data.address?.city ||
              data.address?.town ||
              data.address?.village ||
              data.address?.county ||
              data.address?.state ||
              data.name ||
              undefined;
            onMapClickRef.current?.(e.latlng.lat, e.latlng.lng, placeName);
          })
          .catch(() => {
            if (controller.signal.aborted) return;
            fetch(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${e.latlng.lat}&longitude=${e.latlng.lng}&localityLanguage=es`,
              { signal: controller.signal }
            )
              .then((res) => res.json())
              .then((data) => {
                if (controller.signal.aborted) return;
                const placeName =
                  data.locality || data.city || data.principalSubdivision || data.countryName || undefined;
                onMapClickRef.current?.(e.latlng.lat, e.latlng.lng, placeName);
              })
              .catch(() => {
                if (!controller.signal.aborted) {
                  onMapClickRef.current?.(e.latlng.lat, e.latlng.lng);
                }
              });
          });
      }
    },
  });

  useEffect(() => {
    const container = map.getContainer();
    container.style.cursor = selectingLocation ? "crosshair" : "";
  }, [selectingLocation, map]);

  return null;
}

const CountryMarker = memo(function CountryMarker({
  country,
  icon,
  onClick,
}: {
  country: Country;
  icon: L.DivIcon;
  onClick: (country: Country) => void;
}) {
  const eventHandlers = useMemo(
    () => ({
      click: () => onClick(country),
    }),
    [onClick, country]
  );

  return <Marker position={country.coordinates!} icon={icon} eventHandlers={eventHandlers} />;
});

function CountryMarkersLayer({
  showCountryMarkers,
  countriesWithCoords,
  diffMode,
  diffOnlyViewer,
  diffOnlyTarget,
  diffBoth,
  completed,
  wishlist,
  selectingLocation,
  onInformation,
}: {
  showCountryMarkers: boolean;
  countriesWithCoords: Country[];
  diffMode?: boolean;
  diffOnlyViewer?: Set<string>;
  diffOnlyTarget?: Set<string>;
  diffBoth?: Set<string>;
  completed: Set<string>;
  wishlist: Set<string>;
  selectingLocation?: boolean;
  onInformation: (country: Country) => void;
}) {
  const map = useMap();
  const [viewport, setViewport] = useState<{ zoom: number; bounds: L.LatLngBounds | null }>(() => {
    try {
      return { zoom: map.getZoom() || 0, bounds: map.getBounds() };
    } catch {
      return { zoom: 0, bounds: null };
    }
  });

  const syncViewport = useCallback(() => {
    try {
      const nextZoom = map.getZoom() || 0;
      setViewport((prev) => {
        if (prev.zoom < 6 && nextZoom < 6) return prev;
        return { zoom: nextZoom, bounds: map.getBounds() };
      });
    } catch {
      /* ignore */
    }
  }, [map]);

  useMapEvents({
    zoomend: syncViewport,
    moveend: syncViewport,
  });

  const selectingLocationRef = useRef(selectingLocation);
  selectingLocationRef.current = selectingLocation;
  const onInformationRef = useRef(onInformation);
  onInformationRef.current = onInformation;

  const handleCountryClick = useCallback((c: Country) => {
    if (selectingLocationRef.current) return;
    onInformationRef.current(c);
  }, []);

  const visibleCountries = useMemo(() => {
    if (!showCountryMarkers || viewport.zoom < 6) return [];
    if (!viewport.bounds) return countriesWithCoords;
    const padded = viewport.bounds.pad(0.25);
    return countriesWithCoords.filter((c) => c.coordinates && padded.contains(c.coordinates));
  }, [showCountryMarkers, viewport, countriesWithCoords]);

  if (visibleCountries.length === 0) {
    return null;
  }

  const icons = getWorldMarkerIcons();

  return (
    <>
      {visibleCountries.map((c) => {
        const icon = diffMode
          ? diffOnlyViewer?.has(c.id)
            ? icons.diffOnlyMe
            : diffOnlyTarget?.has(c.id)
              ? icons.diffOnlyThem
              : diffBoth?.has(c.id)
                ? icons.diffBoth
                : icons.diffNone
          : completed.has(c.id)
            ? icons.done
            : wishlist.has(c.id)
              ? icons.wishlist
              : icons.todo;
        return <CountryMarker key={c.id} country={c} icon={icon} onClick={handleCountryClick} />;
      })}
    </>
  );
}

function ExperienceMarkersLayer({
  experienceRecords,
  onExperienceClick,
  experiencesMode,
}: {
  experienceRecords: any[];
  onExperienceClick?: (record: any) => void;
  experiencesMode?: boolean;
}) {
  const map = useMap();
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(() => {
    try {
      return map.getBounds();
    } catch {
      return null;
    }
  });

  const syncBounds = useCallback(() => {
    try {
      setBounds(map.getBounds());
    } catch {
      /* ignore */
    }
  }, [map]);

  useMapEvents({
    zoomend: syncBounds,
    moveend: syncBounds,
  });

  const visibleRecords = useMemo(() => {
    if (!experiencesMode || !experienceRecords.length) return [];
    if (!bounds) return experienceRecords;
    const padded = bounds.pad(0.25);
    return experienceRecords.filter(
      (r) => typeof r.lat === "number" && typeof r.lng === "number" && padded.contains([r.lat, r.lng])
    );
  }, [experiencesMode, experienceRecords, bounds]);

  return (
    <>
      {visibleRecords.map((r, i) => (
        <Marker
          key={`exp-${r.id || i}`}
          position={[r.lat, r.lng]}
          icon={getExperienceIcon(r.icon_name)}
          zIndexOffset={1000}
          eventHandlers={{
            click: () => {
              if (experiencesMode && onExperienceClick) {
                onExperienceClick(r);
              }
            },
          }}
        />
      ))}
    </>
  );
}

const countriesWithCoords = countries.filter((c) => c.coordinates);

export const WorldMap = memo(function WorldMap({
  completed,
  wishlist,
  onInformation,
  onComplete: _onComplete,
  diffMode,
  diffOnlyViewer,
  diffOnlyTarget,
  diffBoth,
  activeId,
  experiencesMode,
  experienceRecords,
  selectingLocation,
  onMapClick,
  onCancelSelectingLocation,
  onExperienceClick,
  onAddExperience,
  panelOpen,
  hasCompareButton,
  isActive = true,
}: Props) {
  void _onComplete;
  const canvasRenderer = useMemo(() => createAdaptiveCanvasRenderer("world"), []);
  const keepBuffer = useMemo(() => getAdaptiveKeepBuffer(), []);
  const inertiaOptions = useMemo(() => getAdaptiveInertiaOptions(), []);
  const tileEventHandlers = useMemo(() => createTileRetryHandlers(), []);
  const isCompactMobile = useMemo(
    () => typeof window !== "undefined" && window.innerWidth <= 700,
    []
  );
  const [geo, setGeo] = useState<FeatureCollection | null>(() => getCachedWorldGeo());
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
  const selectingLocationRef = useRef(selectingLocation);
  const layerRefs = useRef(new Map<string, L.Path>());
  const hoverHighlightRef = useRef<L.GeoJSON | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentHoveredIdRef = useRef<string | null>(null);
  const activeIdRef = useRef<string | null>(null);

  completedRef.current = completed;
  wishlistRef.current = wishlist;
  diffModeRef.current = diffMode;
  diffOnlyViewerRef.current = diffOnlyViewer;
  diffOnlyTargetRef.current = diffOnlyTarget;
  diffBothRef.current = diffBoth;
  onInformationRef.current = onInformation;
  selectingLocationRef.current = selectingLocation;

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedWorldGeo();
    if (cached) {
      setGeo((prev) => prev ?? cached);
      return;
    }
    fetchWorldGeo()
      .then((data) => {
        if (!cancelled) setGeo(data);
      })
      .catch(() => {
        if (!cancelled) setGeo(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectingLocation) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancelSelectingLocation?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectingLocation, onCancelSelectingLocation]);

  const searchItems = useMemo<SearchItem[]>(() => {
    const featureMap = new Map<string, any>();
    if (geo) {
      for (const f of geo.features) {
        const country = resolveCountryFromFeature(f as any);
        if (country) {
          featureMap.set(country.id, f);
        }
      }
    }

    return countriesWithCoords.map((c) => {
      const f = featureMap.get(c.id);
      const bounds = f ? getLargestPolygonBounds(f) : undefined;
      return {
        id: c.id,
        name: c.name,
        nameLocal: c.name,
        type: "country",
        coordinates: c.coordinates,
        bounds,
        originalData: c,
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

  const restoreLayerStyle = useCallback(
    (countryId: string, layer: Path) => {
      if (diffModeRef.current) {
        const ds = getDiffGeoStyleRef(countryId);
        layer.setStyle({ weight: ds.weight, fillOpacity: ds.fillOpacity });
      } else {
        const isWishlist = wishlistRef.current.has(countryId);
        layer.setStyle({
          weight: 1.15,
          fillOpacity: completedRef.current.has(countryId) ? 0.83 : isWishlist ? 0.83 : 0.55,
        });
      }
    },
    [getDiffGeoStyleRef]
  );

  const clearHoverState = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    hoverHighlightRef.current?.clearLayers();
    if (currentHoveredIdRef.current) {
      const prevId = currentHoveredIdRef.current;
      currentHoveredIdRef.current = null;
      const prevLayer = layerRefs.current.get(prevId);
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

  // O(1) activeId selection style update (avoids scanning all 196 layers)
  useEffect(() => {
    const oldId = activeIdRef.current;
    if (oldId && oldId !== activeId) {
      const prevLayer = layerRefs.current.get(oldId);
      if (prevLayer) {
        restoreLayerStyle(oldId, prevLayer);
        safeCloseTooltip(prevLayer);
      }
    }

    if (activeId) {
      const layer = layerRefs.current.get(activeId);
      if (layer) {
        if (diffModeRef.current) {
          layer.setStyle({ weight: 2.5, fillOpacity: 0.9 });
        } else {
          const isWishlist = wishlistRef.current.has(activeId);
          layer.setStyle({
            weight: 2.5,
            fillOpacity: completedRef.current.has(activeId) ? 0.9 : isWishlist ? 0.9 : 0.75,
          });
        }
      }
    }
    activeIdRef.current = activeId || null;
  }, [activeId, restoreLayerStyle]);

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
        fillOpacity: isDone ? 0.83 : isWishlist ? 0.83 : 0.55,
      };
    },
    [completed, wishlist, diffMode, getDiffGeoStyleRef]
  );

  useEffect(() => {
    layerRefs.current.forEach((layer) => {
      const f = (layer as any).feature;
      if (f) {
        layer.setStyle(geoStyle(f));
      }
    });
  }, [geoStyle]);

  const onEachFeature = useCallback(
    (f: any, layer: L.Layer) => {
      const country = resolveCountryFromFeature(f as any);
      if (!country) return;

      const pathLayer = layer as Path;
      layerRefs.current.set(country.id, pathLayer);
      const isDone = completedRef.current.has(country.id);
      const isWishlist = wishlistRef.current.has(country.id);
      const statusClass = isDone ? "tooltip-done" : isWishlist ? "tooltip-wishlist" : "tooltip-todo";

      pathLayer.bindTooltip(country.name, {
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
        if (selectingLocationRef.current) return;
        safeCloseTooltip(pathLayer);
        onInformationRef.current(country);
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

        if (currentHoveredIdRef.current && currentHoveredIdRef.current !== country.id) {
          const prevId = currentHoveredIdRef.current;
          currentHoveredIdRef.current = null;
          hoverHighlightRef.current?.clearLayers();
          const prevLayer = layerRefs.current.get(prevId);
          if (prevLayer) {
            safeCloseTooltip(prevLayer);
          }
        }

        if (country.id === activeIdRef.current) {
          return;
        }

        const latlng = e.latlng;
        hoverTimeoutRef.current = setTimeout(() => {
          hoverTimeoutRef.current = null;
          const currentMap = (pathLayer as any)._map;
          if (!currentMap || currentMap._isWheeling || currentMap._animatingZoom || (currentMap.dragging && currentMap.dragging.moving())) {
            return;
          }

          currentHoveredIdRef.current = country.id;
          let highlightStyle: L.PathOptions;
          if (diffModeRef.current) {
            const ds = getDiffGeoStyleRef(country.id);
            highlightStyle = { ...ds, weight: 2.5, fillOpacity: 0.9 };
          } else {
            const isDone = completedRef.current.has(country.id);
            const isWishlist = wishlistRef.current.has(country.id);
            highlightStyle = {
              color: isDone ? "#4a2878" : isWishlist ? "#d2a54b" : "#9b8ab8",
              weight: 2.5,
              fillColor: isDone ? "#7b52ab" : isWishlist ? "#ecd9a5" : "#ece5f3",
              fillOpacity: isDone ? 0.9 : isWishlist ? 0.9 : 0.75,
            };
          }
          const hl = hoverHighlightRef.current;
          if (hl) {
            hl.clearLayers();
            hl.addData(f);
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

        if (country.id === currentHoveredIdRef.current) {
          currentHoveredIdRef.current = null;
          hoverHighlightRef.current?.clearLayers();
          safeCloseTooltip(pathLayer);
        }
      });
    },
    [getDiffGeoStyleRef]
  );

  return (
    <MapContainer
      className="map"
      center={[20, 0]}
      zoom={2}
      renderer={canvasRenderer}
      preferCanvas={true}
      scrollWheelZoom={true}
      zoomSnap={isCompactMobile ? 0.5 : 1}
      zoomDelta={isCompactMobile ? 0.5 : 1}
      wheelPxPerZoomLevel={60}
      wheelDebounceTime={25}
      inertia={inertiaOptions.inertia}
      inertiaDeceleration={inertiaOptions.inertiaDeceleration}
      inertiaMaxSpeed={inertiaOptions.inertiaMaxSpeed}
      easeLinearity={inertiaOptions.easeLinearity}
      bounceAtZoomLimits={false}
      minZoom={isCompactMobile ? 1.5 : 2}
      maxZoom={12}
      maxBounds={[
        [-60, -180],
        [83, 180],
      ]}
      maxBoundsViscosity={1.0}
    >
      <FitWorld isActive={isActive} />
      <MapInvalidator panelOpen={panelOpen} isActive={isActive} />
      <MapActiveSynchronizer isActive={isActive} />
      <MapTileWakeup isActive={isActive} />
      <MapZoomListener
        isActive={isActive}
        storageKey="mapState_world"
        onInteractionStart={clearHoverState}
      />
      <HoverHighlightBridge highlightLayerRef={hoverHighlightRef} />
      <ExperienceMapClickListener onMapClick={onMapClick} selectingLocation={selectingLocation} />
      <SweepOverlay searchedId={searchedId} layerRefs={layerRefs} />

      {experiencesMode && onAddExperience && !selectingLocation && (
        <div
          className="leaflet-control"
          style={{
            position: "absolute",
            top: 56,
            right: 10,
            zIndex: 1000,
            background: "white",
            borderRadius: "50%",
            boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
            width: 36,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "auto",
            cursor: "pointer",
          }}
          title="Añadir experiencia en el mapa"
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8f9fa")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#fff")}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAddExperience();
          }}
        >
          <svg
            style={{ width: 18, height: 18, color: "#666" }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" />
          </svg>
        </div>
      )}

      {selectingLocation && (
        <div className="leaflet-control-container">
          <div
            className="leaflet-top leaflet-center"
            style={{
              pointerEvents: "none",
              zIndex: 1000,
              width: "100%",
              display: "flex",
              justifyContent: "center",
              marginTop: 16,
            }}
          >
            <div
              className="leaflet-control selecting-location-banner"
              ref={(el) => {
                if (el) {
                  L.DomEvent.disableClickPropagation(el);
                  L.DomEvent.disableScrollPropagation(el);
                }
              }}
              style={{
                position: "relative",
                pointerEvents: "auto",
                background: "var(--pine)",
                color: "#fff",
                padding: "12px 42px 12px 20px",
                borderRadius: 16,
                boxShadow: "0 4px 14px rgba(0,0,0,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 500,
                fontSize: "0.9rem",
                maxWidth: 420,
                width: "90%",
                textAlign: "center",
              }}
            >
              <span style={{ display: "inline", lineHeight: 1.4, fontSize: "14px" }}>
                Haz clic en el mapa para situar la experiencia o busca el lugar aquí
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    width: 16,
                    height: 16,
                    display: "inline-block",
                    verticalAlign: "text-bottom",
                    marginLeft: 4,
                    opacity: 0.85,
                  }}
                >
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </span>
              <button
                type="button"
                className="selecting-location-cancel-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelSelectingLocation?.();
                }}
                title="Cancelar selección (Esc)"
                aria-label="Cancelar"
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "rgba(255,255,255,0.18)",
                  border: "none",
                  borderRadius: "50%",
                  width: 24,
                  height: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  cursor: "pointer",
                  padding: 0,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.32)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.18)")}
              >
                <X size={14} strokeWidth={2.5} />
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
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        crossOrigin="anonymous"
        minZoom={1}
        maxZoom={12}
        keepBuffer={keepBuffer}
        updateWhenIdle={false}
        updateInterval={50}
        maxNativeZoom={19}
        updateWhenZooming={isMobileOrTablet() ? undefined : false}
        eventHandlers={tileEventHandlers}
      />

      {geo && <GeoJSON key="countries" data={geo} style={geoStyle} onEachFeature={onEachFeature} />}

      <CountryMarkersLayer
        showCountryMarkers={true}
        countriesWithCoords={countriesWithCoords}
        diffMode={diffMode}
        diffOnlyViewer={diffOnlyViewer}
        diffOnlyTarget={diffOnlyTarget}
        diffBoth={diffBoth}
        completed={completed}
        wishlist={wishlist}
        selectingLocation={selectingLocation}
        onInformation={onInformation}
      />

      {experiencesMode && experienceRecords && experienceRecords.length > 0 && (
        <ExperienceMarkersLayer
          experienceRecords={experienceRecords}
          experiencesMode={experiencesMode}
          onExperienceClick={onExperienceClick}
        />
      )}
    </MapContainer>
  );
});
