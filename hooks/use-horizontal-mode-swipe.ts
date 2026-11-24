"use client";

import { useCallback, useEffect, useRef } from "react";
import type React from "react";

interface UseHorizontalModeSwipeOptions {
  isActive: boolean;
  isPeaks: boolean;
  canShowPeaks: boolean;
  canShowCountries: boolean;
  onSwitchMode: (mode: "peaks" | "countries") => void;
  attachGlobal?: boolean;
}

const EXCLUDED_TOUCH_SELECTOR =
  ".lightbox-backdrop, .lightbox-stage, .leaflet-container, input, textarea, select, .info-panel, .record-dialog, .auth-dialog, button, a";

export function useHorizontalModeSwipe({
  isActive,
  isPeaks,
  canShowPeaks,
  canShowCountries,
  onSwitchMode,
  attachGlobal = true,
}: UseHorizontalModeSwipeOptions) {
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);

  const onSwitchModeRef = useRef(onSwitchMode);
  onSwitchModeRef.current = onSwitchMode;

  const evaluateSwipe = useCallback(
    (endX: number, endY: number) => {
      if (swipeStartXRef.current === null || swipeStartYRef.current === null) return;
      const diffX = endX - swipeStartXRef.current;
      const diffY = endY - swipeStartYRef.current;
      swipeStartXRef.current = null;
      swipeStartYRef.current = null;

      if (Math.abs(diffX) >= 50 && Math.abs(diffY) <= 35 && Math.abs(diffX) >= Math.abs(diffY) * 2.0) {
        if (diffX < 0) {
          if (isPeaks && canShowCountries) onSwitchModeRef.current("countries");
        } else {
          if (!isPeaks && canShowPeaks) onSwitchModeRef.current("peaks");
        }
      }
    },
    [isPeaks, canShowPeaks, canShowCountries]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!isActive || e.touches.length !== 1) return;
      swipeStartXRef.current = e.touches[0].clientX;
      swipeStartYRef.current = e.touches[0].clientY;
    },
    [isActive]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!isActive || e.changedTouches.length === 0) return;
      evaluateSwipe(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    },
    [isActive, evaluateSwipe]
  );

  useEffect(() => {
    if (!isActive || !attachGlobal) return;

    const handleGlobalTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        document.body.classList.contains("lightbox-open") ||
        document.querySelector(".lightbox-backdrop") ||
        target?.closest?.(EXCLUDED_TOUCH_SELECTOR)
      ) {
        return;
      }
      if (e.touches.length === 1) {
        swipeStartXRef.current = e.touches[0].clientX;
        swipeStartYRef.current = e.touches[0].clientY;
      }
    };

    const handleGlobalTouchEnd = (e: TouchEvent) => {
      if (
        document.body.classList.contains("lightbox-open") ||
        document.querySelector(".lightbox-backdrop")
      ) {
        swipeStartXRef.current = null;
        swipeStartYRef.current = null;
        return;
      }
      if (e.changedTouches.length === 0) return;
      evaluateSwipe(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    };

    window.addEventListener("touchstart", handleGlobalTouchStart, { passive: true });
    window.addEventListener("touchend", handleGlobalTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleGlobalTouchStart);
      window.removeEventListener("touchend", handleGlobalTouchEnd);
    };
  }, [isActive, attachGlobal, evaluateSwipe]);

  return {
    handleTouchStart,
    handleTouchEnd,
  };
}
