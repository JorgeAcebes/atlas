"use client";

import { useEffect, useRef } from "react";
import type L from "leaflet";
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

  return null;
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
                  [27.55, -18.65],
                  [43.95, 4.95],
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
      if (isActive === false || (map as any)._isWheeling) return;
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if ((map as any)._isWheeling) return;
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
