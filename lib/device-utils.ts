/**
 * Device and platform detection utilities for responsive performance tuning.
 *
 * Used to tune Leaflet map rendering parameters (e.g. canvas padding, tile buffer)
 * so that desktop web does not perform aggressive pre-loading that burdens desktop CPUs/GPUs,
 * while preserving high preloading on mobile/tablet devices where screen resolutions are small
 * and pinch-to-zoom gestures require wide vector buffers.
 */

export function isMobileOrTablet(): boolean {
  if (typeof window === "undefined") return false;

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isIPad = /Macintosh/i.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1;
  const isTouchDevice = isMobileUA || isIPad;

  // Screen width <= 1024px covers standard mobile and tablet viewports
  const isMobileOrTabletWidth = window.innerWidth <= 1024;

  return isMobileOrTabletWidth || isTouchDevice;
}
