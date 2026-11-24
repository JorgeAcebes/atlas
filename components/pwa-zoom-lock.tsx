"use client";

import { useEffect } from "react";

export function PwaZoomLock() {
  useEffect(() => {
    const isExempt = (target: EventTarget | null) => {
      if (!target) return false;
      const el = target instanceof Element ? target : (target as Node | null)?.parentElement;
      if (!el?.closest) return false;
      return Boolean(
        el.closest(
          ".leaflet-container, .leaflet-control-container, .leaflet-pane, .lightbox-stage, .lightbox-backdrop, .lightbox-img-wrapper, .photo-editor-modal"
        )
      );
    };

    // WebKit gesturestart / gesturechange (iOS proprietary pinch-to-zoom outside maps & media viewers)
    const handleGesture = (e: Event) => {
      if (isExempt(e.target)) return;
      e.preventDefault();
    };

    document.addEventListener("gesturestart", handleGesture, { passive: false });
    document.addEventListener("gesturechange", handleGesture, { passive: false });

    return () => {
      document.removeEventListener("gesturestart", handleGesture);
      document.removeEventListener("gesturechange", handleGesture);
    };
  }, []);

  return null;
}
