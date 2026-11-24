"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

export function FitWorld({
  isActive,
  persistSessionState = true,
}: {
  isActive?: boolean;
  persistSessionState?: boolean;
}) {
  const map = useMap();
  const hasFittedRef = useRef(false);

  useEffect(() => {
    if (isActive === false) return;
    if (hasFittedRef.current) return;

    let rafId: number | null = null;
    let attempts = 0;

    const tryFit = () => {
      const container = map.getContainer();
      if (container && container.clientWidth > 0 && container.clientHeight > 0) {
        hasFittedRef.current = true;
        map.invalidateSize({ animate: false, pan: false });

        if (persistSessionState && typeof window !== "undefined" && window.location.hash.startsWith("#panel=")) {
          try {
            const saved = sessionStorage.getItem("mapState_world");
            if (saved) {
              const { zoom, center } = JSON.parse(saved);
              if (Number.isFinite(zoom) && Number.isFinite(center?.lat) && Number.isFinite(center?.lng)) {
                map.setView(center, zoom, { animate: false });
                return;
              }
            }
          } catch {
            /* ignore corrupt saved state */
          }
        }

        const aspectRatio = typeof window !== "undefined" ? window.innerWidth / Math.max(1, window.innerHeight) : 1.5;
        if (aspectRatio > 1) {
          map.fitBounds(
            [
              [-60, -180],
              [78, 180],
            ],
            { padding: [24, 24], animate: false }
          );
        } else {
          map.fitBounds(
            [
              [-60, -180],
              [80, 180],
            ],
            { padding: [0, 0], animate: false }
          );
        }
      } else if (attempts < 20) {
        attempts++;
        rafId = requestAnimationFrame(tryFit);
      }
    };

    tryFit();

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [map, isActive, persistSessionState]);

  return null;
}

export function FitSpain({
  isActive,
  persistSessionState = true,
}: {
  isActive?: boolean;
  persistSessionState?: boolean;
}) {
  const map = useMap();
  const hasFittedRef = useRef(false);

  useEffect(() => {
    if (isActive === false) return;
    if (hasFittedRef.current) return;

    let rafId: number | null = null;
    let attempts = 0;

    const tryFit = () => {
      const container = map.getContainer();
      if (container && container.clientWidth > 0 && container.clientHeight > 0) {
        hasFittedRef.current = true;
        map.invalidateSize({ animate: false, pan: false });

        if (persistSessionState && typeof window !== "undefined" && window.location.hash.startsWith("#panel=")) {
          try {
            const saved = sessionStorage.getItem("mapState_spain");
            if (saved) {
              const { zoom, center } = JSON.parse(saved);
              if (
                Number.isFinite(zoom) &&
                Number.isFinite(center?.lat) &&
                Number.isFinite(center?.lng) &&
                center.lat >= 26 &&
                center.lat <= 45 &&
                center.lng >= -20 &&
                center.lng <= 6
              ) {
                map.setView(center, zoom, { animate: false });
                return;
              }
            }
          } catch {
            /* ignore corrupt saved state */
          }
        }

        map.fitBounds(
          [
            [27.55, -18.65],
            [43.95, 4.95],
          ],
          { padding: [12, 12], animate: false }
        );
      } else if (attempts < 20) {
        attempts++;
        rafId = requestAnimationFrame(tryFit);
      }
    };

    tryFit();

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [map, isActive, persistSessionState]);

  return null;
}
