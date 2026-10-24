"use client";

import { useEffect } from "react";

/**
 * PwaZoomLock
 * 
 * Prevents native browser viewport pinch-to-zoom and multi-touch page scaling in PWA / mobile,
 * while strictly preserving gesture support in Leaflet maps and Photo Lightbox.
 */
export function PwaZoomLock() {
  useEffect(() => {
    // Check if touch target is inside Leaflet map or Photo Lightbox
    const isExempt = (target: EventTarget | null): boolean => {
      if (!target || !(target instanceof Element)) return false;
      return Boolean(
        target.closest(
          ".leaflet-container, .leaflet-control-container, .leaflet-pane, .lightbox-stage, .lightbox-backdrop, .lightbox-img-wrapper, .photo-editor-overlay"
        )
      );
    };

    // 1. WebKit gesturestart / gesturechange / gestureend (iOS proprietary pinch-to-zoom events)
    const handleGesture = (e: Event) => {
      if (isExempt(e.target)) return;
      e.preventDefault();
    };

    // 2. Multi-touch touchstart (2+ fingers pinch gesture outside of map / lightbox)
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        if (isExempt(e.target)) return;
        e.preventDefault();
      }
    };

    // 3. Double-tap zoom prevention fallback outside interactive elements, map and lightbox
    let lastTouchEnd = 0;
    const handleTouchEnd = (e: TouchEvent) => {
      const now = Date.now();
      const target = e.target as Element | null;
      if (
        isExempt(target) ||
        target?.closest?.("input, textarea, select, button, a, [role='button'], [tabindex]")
      ) {
        lastTouchEnd = now;
        return;
      }
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    };

    document.addEventListener("gesturestart", handleGesture, { passive: false });
    document.addEventListener("gesturechange", handleGesture, { passive: false });
    document.addEventListener("touchstart", handleTouchStart, { passive: false });
    document.addEventListener("touchend", handleTouchEnd, { passive: false });

    return () => {
      document.removeEventListener("gesturestart", handleGesture);
      document.removeEventListener("gesturechange", handleGesture);
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  return null;
}
