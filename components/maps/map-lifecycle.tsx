"use client";

import { useEffect, useRef } from "react";
import type React from "react";
import L from "leaflet";
import { useMap, useMapEvents } from "react-leaflet";

export function safeCloseTooltip(layer: any): void {
  try {
    if (layer && layer._tooltip && typeof layer.closeTooltip === "function") {
      layer.closeTooltip();
    }
  } catch {
    /* ignore */
  }
}

function findTileLayer(map: L.Map): L.TileLayer | null {
  let tileLayer: L.TileLayer | null = null;
  map.eachLayer((layer) => {
    if (!tileLayer && typeof (layer as any).getTileUrl === "function") {
      tileLayer = layer as L.TileLayer;
    }
  });
  return tileLayer;
}

function revealCompletedTiles(tilePane: HTMLElement | undefined): {
  total: number;
  loaded: number;
} {
  if (!tilePane) return { total: 0, loaded: 0 };
  const imgs = Array.from(tilePane.querySelectorAll("img"));
  let loaded = 0;
  for (const img of imgs) {
    if (img.complete && img.naturalWidth > 0) {
      loaded++;
      if (!img.classList.contains("leaflet-tile-loaded")) {
        img.classList.add("leaflet-tile-loaded");
      }
      if (img.style.opacity === "0") {
        img.style.opacity = "1";
      }
    }
  }
  return { total: imgs.length, loaded };
}

/**
 * Invalidates Leaflet container dimensions cleanly without triggering a per-frame RAF loop:
 * - once synchronously on mount
 * - on container transitionend / single deferred timer (280ms) when `panelOpen` changes.
 */
export function MapInvalidator({ panelOpen, isActive }: { panelOpen?: boolean; isActive?: boolean }) {
  const map = useMap();
  const prevPanelOpenRef = useRef<boolean | undefined>(panelOpen);
  const isFirstMountRef = useRef(true);

  useEffect(() => {
    if (isActive === false) return;
    const container = map.getContainer();
    if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;

    if (!panelOpen) {
      try {
        container.querySelectorAll(".leaflet-tooltip").forEach((el) => {
          el.parentElement?.removeChild(el);
        });
      } catch {
        /* ignore */
      }
    }

    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      prevPanelOpenRef.current = panelOpen;
      map.invalidateSize({ animate: false, pan: false });
      return;
    }

    if (prevPanelOpenRef.current === panelOpen) return;
    prevPanelOpenRef.current = panelOpen;

    map.invalidateSize({ animate: false, pan: false });

    const handleTransitionEnd = () => {
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        map.invalidateSize({ animate: false, pan: false });
      }
    };

    const parent = container.parentElement;
    parent?.addEventListener("transitionend", handleTransitionEnd, { once: true });
    const timer = setTimeout(handleTransitionEnd, 280);

    return () => {
      clearTimeout(timer);
      parent?.removeEventListener("transitionend", handleTransitionEnd);
    };
  }, [map, panelOpen, isActive]);

  useEffect(() => {
    if (isActive === false || typeof ResizeObserver !== "function") return;
    const container = map.getContainer();
    if (!container) return;

    let lastWidth = container.clientWidth;
    let lastHeight = container.clientHeight;
    let rafId: number | null = null;

    const observer = new ResizeObserver(() => {
      const nextWidth = container.clientWidth;
      const nextHeight = container.clientHeight;
      if (nextWidth > 0 && nextHeight > 0 && (nextWidth !== lastWidth || nextHeight !== lastHeight)) {
        const wasZero = lastWidth === 0 || lastHeight === 0;
        lastWidth = nextWidth;
        lastHeight = nextHeight;
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          rafId = null;
          map.invalidateSize({ animate: false, pan: false });
          if (wasZero) {
            const tilePane = map.getPane("tilePane");
            if (revealCompletedTiles(tilePane).total === 0) {
              findTileLayer(map)?.redraw();
            }
          }
        });
      }
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [map, isActive]);

  return null;
}

/**
 * Ensures OpenStreetMap tiles paint reliably after late container sizing or route mounts.
 * Never aborts in-flight tiles early; reveals completed tiles stuck hidden and only redraws if stalled.
 */
export function MapTileWakeup({ isActive }: { isActive?: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (isActive === false) return;

    const ensureTiles = (allowRedrawWhenLoadedZero: boolean) => {
      const container = map.getContainer();
      if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;

      map.invalidateSize({ animate: false, pan: false });

      const tileLayer = findTileLayer(map);
      if (!tileLayer) return;

      const tilePane = map.getPane("tilePane");
      const { total, loaded } = revealCompletedTiles(tilePane);

      if (total === 0 || (allowRedrawWhenLoadedZero && loaded === 0)) {
        tileLayer.redraw();
      }
    };

    const earlyTimer = setTimeout(() => ensureTiles(false), 200);
    const stallTimer = setTimeout(() => ensureTiles(true), 1600);
    const settleTimer = setTimeout(() => {
      revealCompletedTiles(map.getPane("tilePane"));
    }, 3200);

    return () => {
      clearTimeout(earlyTimer);
      clearTimeout(stallTimer);
      clearTimeout(settleTimer);
    };
  }, [map, isActive]);

  return null;
}

export function createTileRetryHandlers(): { tileerror: L.LeafletEventHandlerFn } {
  return {
    tileerror: (e: any) => {
      const tile = e?.tile as HTMLImageElement | undefined;
      if (!tile || !tile.src) return;
      const attempt = Number(tile.dataset.atlasRetry || "0");
      if (attempt >= 2) return;
      tile.dataset.atlasRetry = String(attempt + 1);
      const delay = attempt === 0 ? 350 : 1000;
      setTimeout(() => {
        if (!tile.isConnected) return;
        if (!tile.dataset.atlasLoadBound) {
          tile.dataset.atlasLoadBound = "1";
          tile.addEventListener("load", () => {
            tile.classList.add("leaflet-tile-loaded");
            tile.style.opacity = "1";
          });
        }
        const cleanSrc = tile.src.replace(/([?&])_r=\d+/, "");
        tile.src = `${cleanSrc}${cleanSrc.includes("?") ? "&" : "?"}_r=${attempt + 1}`;
        if (tile.complete && tile.naturalWidth > 0) {
          tile.classList.add("leaflet-tile-loaded");
          tile.style.opacity = "1";
        }
      }, delay);
    },
  };
}

export function MapActiveSynchronizer({
  isActive,
  kind,
}: {
  isActive?: boolean;
  kind?: "spain" | "world";
}) {
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
          const prevCenter = map.getCenter();
          const prevZoom = map.getZoom();
          map.invalidateSize({ animate: false, pan: false });
          if (kind === "spain") {
            const isValidSpainCenter =
              Number.isFinite(prevCenter?.lat) &&
              Number.isFinite(prevCenter?.lng) &&
              prevCenter.lat >= 26 &&
              prevCenter.lat <= 45 &&
              prevCenter.lng >= -20 &&
              prevCenter.lng <= 6;
            if (isValidSpainCenter && Number.isFinite(prevZoom) && prevZoom >= 4) {
              map.setView(prevCenter, prevZoom, { animate: false });
            } else {
              map.fitBounds(
                [
                  [35.8, -9.5],
                  [43.9, 4.35],
                ],
                { padding: [12, 12], animate: false }
              );
            }
          } else if (
            Number.isFinite(prevCenter?.lat) &&
            Number.isFinite(prevCenter?.lng) &&
            Number.isFinite(prevZoom)
          ) {
            map.setView(prevCenter, prevZoom, { animate: false });
          }
          const { total } = revealCompletedTiles(map.getPane("tilePane"));
          if (total === 0) {
            findTileLayer(map)?.redraw();
          }
        }
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [map, isActive, kind]);

  return null;
}

export function MapZoomListener({
  isActive,
  storageKey,
  onInteractionStart,
  onViewportChange,
}: {
  isActive?: boolean;
  storageKey?: "mapState_world" | "mapState_spain";
  onInteractionStart?: () => void;
  onViewportChange?: (zoom: number, bounds: L.LatLngBounds) => void;
}) {
  const rafRef = useRef<number | null>(null);
  const onInteractionStartRef = useRef(onInteractionStart);
  onInteractionStartRef.current = onInteractionStart;
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  const map = useMapEvents({
    zoomstart: () => {
      onInteractionStartRef.current?.();
    },
    movestart: () => {
      onInteractionStartRef.current?.();
    },
    zoom: () => {
      if (isActive === false || (map as any)._isWheeling || (map.touchZoom as any)?._zooming) return;
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if ((map as any)._isWheeling || (map.touchZoom as any)?._zooming) return;
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
      if (storageKey && Number.isFinite(zoom) && Number.isFinite(center?.lat) && Number.isFinite(center?.lng)) {
        const isSpainValid =
          storageKey !== "mapState_spain" ||
          (center.lat >= 26 && center.lat <= 45 && center.lng >= -20 && center.lng <= 6);
        if (isSpainValid) {
          try {
            sessionStorage.setItem(storageKey, JSON.stringify({ zoom, center }));
          } catch {
            /* ignore */
          }
        }
      }
      const rounded = Math.max(0, Math.round(zoom || 0)).toString();
      if (container.getAttribute("data-zoom") !== rounded) {
        container.setAttribute("data-zoom", rounded);
      }
      if (onViewportChangeRef.current && Number.isFinite(zoom)) {
        onViewportChangeRef.current(zoom, map.getBounds());
      }
    },
    moveend: () => {
      if (isActive === false) return;
      const container = map.getContainer();
      if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;
      const zoom = map.getZoom();
      const center = map.getCenter();
      if (storageKey && Number.isFinite(zoom) && Number.isFinite(center?.lat) && Number.isFinite(center?.lng)) {
        const isSpainValid =
          storageKey !== "mapState_spain" ||
          (center.lat >= 26 && center.lat <= 45 && center.lng >= -20 && center.lng <= 6);
        if (isSpainValid) {
          try {
            sessionStorage.setItem(storageKey, JSON.stringify({ zoom, center }));
          } catch {
            /* ignore */
          }
        }
      }
      if (onViewportChangeRef.current && Number.isFinite(zoom)) {
        onViewportChangeRef.current(zoom, map.getBounds());
      }
    },
  });

  useEffect(() => {
    const container = map.getContainer();
    if (!container) return;
    let wheelTimer: ReturnType<typeof setTimeout> | null = null;

    const handlePassiveWheel = () => {
      (map as any)._isWheeling = true;
      container.classList.add("is-wheeling");
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        wheelTimer = null;
        (map as any)._isWheeling = false;
        container.classList.remove("is-wheeling");
      }, 150);
    };

    container.addEventListener("wheel", handlePassiveWheel, { passive: true });
    return () => {
      container.removeEventListener("wheel", handlePassiveWheel);
      if (wheelTimer) clearTimeout(wheelTimer);
      (map as any)._isWheeling = false;
      container.classList.remove("is-wheeling");
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [map]);

  useEffect(() => {
    if (isActive === false) return;
    const container = map.getContainer();
    if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;
    const zoom = map.getZoom();
    const rounded = Math.max(0, Math.round(zoom || 0)).toString();
    if (container.getAttribute("data-zoom") !== rounded) {
      container.setAttribute("data-zoom", rounded);
    }
    if (onViewportChangeRef.current && Number.isFinite(zoom)) {
      onViewportChangeRef.current(zoom, map.getBounds());
    }
  }, [map, isActive]);

  return null;
}

export function HoverHighlightBridge({
  highlightLayerRef,
}: {
  highlightLayerRef: React.MutableRefObject<L.GeoJSON | null>;
}) {
  const map = useMap();

  useEffect(() => {
    const svgRenderer = L.svg({ padding: 0.25 });
    const layer = L.geoJSON(undefined, {
      interactive: false,
      renderer: svgRenderer,
    } as L.GeoJSONOptions).addTo(map);
    highlightLayerRef.current = layer;

    return () => {
      highlightLayerRef.current = null;
      try {
        map.removeLayer(layer);
      } catch {
        /* ignore */
      }
    };
  }, [map, highlightLayerRef]);

  return null;
}

export function MapClickListener({
  onMapClick,
  selectingLocation,
}: {
  onMapClick?: (lat: number, lng: number, placeName?: string) => void;
  selectingLocation?: boolean;
}) {
  const onMapClickRef = useRef(onMapClick);
  const selectingLocationRef = useRef(selectingLocation);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
    selectingLocationRef.current = selectingLocation;
  }, [onMapClick, selectingLocation]);

  useMapEvents({
    click: (e: L.LeafletMouseEvent) => {
      if (selectingLocationRef.current && onMapClickRef.current) {
        onMapClickRef.current(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}
