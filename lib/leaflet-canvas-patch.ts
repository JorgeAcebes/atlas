"use client";

import L from "leaflet";
import { isMobileOrTablet } from "@/lib/device-utils";

export type MapCanvasKind = "world" | "spain" | "collective";

function patchCanvasRenderer(): void {
  if (!L?.Canvas) return;
  const proto = L.Canvas.prototype as any;
  if (proto._atlasMovePatched) return;
  proto._atlasMovePatched = true;

  const originalGetEvents = proto.getEvents;
  proto.getEvents = function () {
    const events = originalGetEvents.call(this);
    events.move = this._onCanvasMove;

    const cancelPendingMoveRaf = (ctx: any) => {
      if (ctx._moveRaf) {
        cancelAnimationFrame(ctx._moveRaf);
        ctx._moveRaf = null;
      }
    };

    events.zoomstart = function () {
      this._isZooming = true;
      cancelPendingMoveRaf(this);
    };

    if (events.zoomanim) {
      const originalAnimZoom = events.zoomanim;
      events.zoomanim = function (e: any) {
        this._isZooming = true;
        cancelPendingMoveRaf(this);
        originalAnimZoom.call(this, e);
      };
    }

    const originalOnZoomEnd = events.zoomend;
    events.zoomend = function () {
      cancelPendingMoveRaf(this);
      this._isZooming = false;
      if (originalOnZoomEnd) {
        // Leaflet's _onZoomEnd invokes _update() once; avoid duplicate redundant redraws
        originalOnZoomEnd.call(this);
      } else {
        this._update();
      }
    };

    return events;
  };

  const originalOnMouseMove = proto._onMouseMove;
  proto._onMouseMove = function (e: any) {
    if (this._map?._isWheeling || this._isZooming || this._map?._animatingZoom) return;
    if (originalOnMouseMove) {
      originalOnMouseMove.call(this, e);
    }
  };

  proto._onCanvasMove = function () {
    if (!this._map || !this._bounds) return;

    if (
      this._isZooming ||
      this._map._animatingZoom ||
      (this._map.touchZoom && (this._map.touchZoom as any)._zooming) ||
      this._map.getZoom() !== this._zoom ||
      !(this._map.dragging && this._map.dragging.moving())
    ) {
      return;
    }

    const size = this._map.getSize();
    if (!size || size.x === 0 || size.y === 0) return;
    const vpMin = this._map.containerPointToLayerPoint([0, 0]);
    const vpMax = this._map.containerPointToLayerPoint(size);
    const padX = Math.min(120, Math.max(48, Math.round(size.x * 0.18)));
    const padY = Math.min(120, Math.max(48, Math.round(size.y * 0.18)));

    if (
      vpMin.x - padX < this._bounds.min.x ||
      vpMin.y - padY < this._bounds.min.y ||
      vpMax.x + padX > this._bounds.max.x ||
      vpMax.y + padY > this._bounds.max.y
    ) {
      if (this._moveRaf) return;
      this._moveRaf = requestAnimationFrame(() => {
        this._moveRaf = null;
        if (
          !this._isZooming &&
          this._map &&
          !this._map._animatingZoom &&
          !(this._map.touchZoom && (this._map.touchZoom as any)._zooming) &&
          this._map.getZoom() === this._zoom &&
          this._map.dragging &&
          this._map.dragging.moving()
        ) {
          this._update();
        }
      });
    }
  };
}

/**
 * Prevents Leaflet's first click/tap map container focus from calling window.scrollTo()
 * while html has scroll-behavior: smooth, which would otherwise hijack first-load scrolling.
 */
function patchKeyboardFocusScroll(): void {
  const KeyboardProto = (L.Map as any)?.Keyboard?.prototype;
  if (!KeyboardProto || KeyboardProto._atlasKeyboardFocusPatched) return;
  KeyboardProto._atlasKeyboardFocusPatched = true;

  KeyboardProto._onMouseDown = function () {
    if (this._focused || !this._map?._container) return;

    const container = this._map._container as HTMLElement;
    const prevX =
      typeof window.scrollX === "number"
        ? window.scrollX
        : document.documentElement?.scrollLeft || 0;
    const prevY =
      typeof window.scrollY === "number"
        ? window.scrollY
        : document.documentElement?.scrollTop || 0;

    try {
      container.focus({ preventScroll: true });
    } catch {
      container.focus();
    }

    const curX =
      typeof window.scrollX === "number"
        ? window.scrollX
        : document.documentElement?.scrollLeft || 0;
    const curY =
      typeof window.scrollY === "number"
        ? window.scrollY
        : document.documentElement?.scrollTop || 0;

    if (curX !== prevX || curY !== prevY) {
      const root = document.documentElement;
      const prevBehavior = root ? root.style.scrollBehavior : "";
      if (root) root.style.scrollBehavior = "auto";
      window.scrollTo(prevX, prevY);
      if (root) root.style.scrollBehavior = prevBehavior;
    }
  };
}

/**
 * Hardens Leaflet TouchZoom against aggressive pinch-out:
 * guards zero/tiny finger distance division, NaN centers, and negative/-Infinity zoom.
 */
function patchTouchZoomResilience(): void {
  const TouchZoomProto = (L.Map as any)?.TouchZoom?.prototype;
  if (!TouchZoomProto || TouchZoomProto._atlasTouchZoomPatched) return;
  TouchZoomProto._atlasTouchZoomPatched = true;

  const originalOnTouchStart = TouchZoomProto._onTouchStart;
  if (typeof originalOnTouchStart === "function") {
    TouchZoomProto._onTouchStart = function (e: TouchEvent) {
      originalOnTouchStart.call(this, e);
      if (this._zooming && (!Number.isFinite(this._startDist) || this._startDist < 8)) {
        this._startDist = 8;
      }
    };
  }

  TouchZoomProto._onTouchMove = function (e: TouchEvent) {
    const map = this._map;
    if (!e.touches || e.touches.length !== 2 || !this._zooming || !map) return;

    const p1 = map.mouseEventToContainerPoint(e.touches[0] as unknown as MouseEvent);
    const p2 = map.mouseEventToContainerPoint(e.touches[1] as unknown as MouseEvent);
    const startDist = Number.isFinite(this._startDist) && this._startDist >= 8 ? this._startDist : 8;
    const dist = Math.max(1, p1.distanceTo(p2));
    const scale = Math.min(32, Math.max(1 / 32, dist / startDist));

    let nextZoom = map.getScaleZoom(scale, this._startZoom);
    if (!Number.isFinite(nextZoom)) {
      nextZoom = Number.isFinite(this._startZoom) ? this._startZoom : map.getZoom();
    }

    const rawMinZoom = typeof map.getMinZoom === "function" ? map.getMinZoom() : 0;
    const rawMaxZoom = typeof map.getMaxZoom === "function" ? map.getMaxZoom() : 18;
    const minZoom = Number.isFinite(rawMinZoom) ? rawMinZoom : 0;
    const maxZoom = Number.isFinite(rawMaxZoom) ? rawMaxZoom : 18;

    if (map.options.bounceAtZoomLimits === false) {
      nextZoom = Math.min(maxZoom, Math.max(minZoom, nextZoom));
    } else {
      nextZoom = Math.min(maxZoom + 0.75, Math.max(minZoom - 0.75, nextZoom));
    }
    this._zoom = nextZoom;

    if (map.options.touchZoom === "center") {
      this._center = this._startLatLng;
      if (scale === 1) return;
    } else {
      const delta = p1.add(p2).divideBy(2).subtract(this._centerPoint);
      if (scale === 1 && delta.x === 0 && delta.y === 0) return;

      const pinchLatLng = this._pinchStartLatLng || this._startLatLng || map.getCenter();
      let computedCenter = map.unproject(
        map.project(pinchLatLng, this._zoom).subtract(delta),
        this._zoom
      );
      if (
        !computedCenter ||
        !Number.isFinite(computedCenter.lat) ||
        !Number.isFinite(computedCenter.lng)
      ) {
        computedCenter = this._startLatLng || map.getCenter();
      }
      const clampedLat = Math.max(-85, Math.min(85, computedCenter.lat));
      let nextCenter =
        clampedLat === computedCenter.lat
          ? computedCenter
          : L.latLng(clampedLat, computedCenter.lng);

      if (map.options.maxBounds && typeof map._limitCenter === "function") {
        const limited = map._limitCenter(nextCenter, this._zoom, map.options.maxBounds);
        if (limited && Number.isFinite(limited.lat) && Number.isFinite(limited.lng)) {
          const rawViscosity = map.options.maxBoundsViscosity;
          const viscosity = Math.max(
            0.5,
            Math.min(1, Number.isFinite(rawViscosity) ? Number(rawViscosity) : 1)
          );
          if (viscosity >= 1) {
            nextCenter = limited;
          } else {
            nextCenter = L.latLng(
              nextCenter.lat + (limited.lat - nextCenter.lat) * viscosity,
              nextCenter.lng + (limited.lng - nextCenter.lng) * viscosity
            );
          }
        }
      }
      this._center = nextCenter;
    }

    if (!this._moved) {
      map._moveStart(true, false);
      this._moved = true;
    }

    const cancelAnim = (L.Util as any)?.cancelAnimFrame || cancelAnimationFrame;
    const requestAnim = (L.Util as any)?.requestAnimFrame || requestAnimationFrame;
    cancelAnim(this._animRequest);

    const moveFn = L.Util.bind(
      map._move as (...args: any[]) => any,
      map,
      this._center,
      this._zoom,
      { pinch: true, round: false },
      undefined
    );
    this._animRequest = requestAnim(moveFn, this, true);

    if (L.DomEvent?.preventDefault) {
      L.DomEvent.preventDefault(e as unknown as Event);
    }
  };

  const originalOnTouchEnd = TouchZoomProto._onTouchEnd;
  if (typeof originalOnTouchEnd === "function") {
    TouchZoomProto._onTouchEnd = function () {
      const map = this._map;
      if (map && this._moved && this._zooming) {
        const limitedZoom =
          typeof map._limitZoom === "function" ? map._limitZoom(this._zoom) : this._zoom;
        this._zoom = Number.isFinite(limitedZoom) ? limitedZoom : map.getZoom();

        let safeCenter = this._center;
        if (
          !safeCenter ||
          !Number.isFinite(safeCenter.lat) ||
          !Number.isFinite(safeCenter.lng)
        ) {
          safeCenter = this._startLatLng || map.getCenter();
        }
        if (map.options?.maxBounds && typeof map._limitCenter === "function") {
          const limitedCenter = map._limitCenter(safeCenter, this._zoom, map.options.maxBounds);
          if (
            limitedCenter &&
            Number.isFinite(limitedCenter.lat) &&
            Number.isFinite(limitedCenter.lng)
          ) {
            safeCenter = limitedCenter;
          }
        }
        this._center = safeCenter;
      }
      return originalOnTouchEnd.call(this);
    };
  }
}

/**
 * Suspends mid-pinch tile grid teardown/reflows and prevents infinite/runaway tile crashes.
 */
function patchGridLayerPinchResilience(): void {
  const GridProto = (L as any)?.GridLayer?.prototype;
  if (!GridProto || GridProto._atlasGridZoomPatched) return;
  GridProto._atlasGridZoomPatched = true;

  const originalOnMoveEnd = GridProto._onMoveEnd;
  if (typeof originalOnMoveEnd === "function") {
    GridProto._onMoveEnd = function () {
      if (
        !this._map ||
        this._map._animatingZoom ||
        (this._map.touchZoom && (this._map.touchZoom as any)._zooming)
      ) {
        return;
      }
      return originalOnMoveEnd.call(this);
    };
  }

  const originalSetView = GridProto._setView;
  if (typeof originalSetView === "function") {
    GridProto._setView = function (
      center: L.LatLng,
      zoom: number,
      noPrune?: boolean,
      noUpdate?: boolean
    ) {
      if (
        !this._map ||
        !Number.isFinite(zoom) ||
        !center ||
        !Number.isFinite(center.lat) ||
        !Number.isFinite(center.lng)
      ) {
        return;
      }
      if (this._map.touchZoom && (this._map.touchZoom as any)._zooming) {
        if (typeof this._setZoomTransforms === "function") {
          this._setZoomTransforms(center, zoom);
        }
        return;
      }
      return originalSetView.call(this, center, zoom, noPrune, noUpdate);
    };
  }

  const originalUpdate = GridProto._update;
  if (typeof originalUpdate === "function") {
    GridProto._update = function (center?: L.LatLng) {
      const map = this._map;
      if (
        !map ||
        this._tileZoom === undefined ||
        (map.touchZoom && (map.touchZoom as any)._zooming)
      ) {
        return;
      }

      const resolvedCenter = center === undefined ? map.getCenter() : center;
      const rawZoom = map.getZoom();
      if (
        !resolvedCenter ||
        !Number.isFinite(resolvedCenter.lat) ||
        !Number.isFinite(resolvedCenter.lng) ||
        !Number.isFinite(rawZoom)
      ) {
        return;
      }

      const clampedZoom =
        typeof this._clampZoom === "function" ? this._clampZoom(rawZoom) : rawZoom;
      if (Math.abs(clampedZoom - this._tileZoom) > 1) {
        this._setView(resolvedCenter, clampedZoom);
        return;
      }

      if (
        typeof this._getTiledPixelBounds === "function" &&
        typeof this._pxBoundsToTileRange === "function"
      ) {
        try {
          const pixelBounds = this._getTiledPixelBounds(resolvedCenter);
          const tileRange = this._pxBoundsToTileRange(pixelBounds);
          if (
            !tileRange?.min ||
            !tileRange?.max ||
            !Number.isFinite(tileRange.min.x) ||
            !Number.isFinite(tileRange.min.y) ||
            !Number.isFinite(tileRange.max.x) ||
            !Number.isFinite(tileRange.max.y)
          ) {
            return;
          }
          const tileCount =
            (tileRange.max.x - tileRange.min.x + 1) * (tileRange.max.y - tileRange.min.y + 1);
          if (!Number.isFinite(tileCount) || tileCount <= 0 || tileCount > 400) {
            return;
          }
        } catch {
          return;
        }
      }

      return originalUpdate.call(this, center);
    };
  }
}

/**
 * Installs idempotent patches on Leaflet prototypes for smooth zoom/drag rendering,
 * extreme pinch-out resilience, and prevention of scroll-hijacking on map focus.
 * Never mutates global L.Canvas.prototype.options.padding.
 */
export function ensureLeafletCanvasPatched(): void {
  if (typeof window === "undefined" || !L) return;

  if (L.Polyline?.prototype?.options) {
    L.Polyline.prototype.options.smoothFactor = 1.2;
  }

  patchCanvasRenderer();
  patchKeyboardFocusScroll();
  patchTouchZoomResilience();
  patchGridLayerPinchResilience();
}

/**
 * Creates a dedicated Canvas renderer sized appropriately for desktop vs touch devices.
 * Avoids giant desktop HiDPI framebuffers (0.5 padding) while keeping headroom on mobile/tablet pinch-zoom.
 */
export function createAdaptiveCanvasRenderer(kind: MapCanvasKind): L.Canvas | undefined {
  if (typeof window === "undefined") return undefined;
  ensureLeafletCanvasPatched();
  const mobile = isMobileOrTablet();
  const padding = mobile ? (kind === "spain" ? 0.8 : 1.0) : 0.5;
  return L.canvas({ padding });
}

export function getAdaptiveKeepBuffer(): number {
  if (typeof window === "undefined") return 3;
  return isMobileOrTablet() ? 4 : 3;
}

export interface MapInertiaOptions {
  inertia: boolean;
  inertiaDeceleration: number;
  inertiaMaxSpeed: number;
  easeLinearity: number;
}

export function getAdaptiveInertiaOptions(): MapInertiaOptions {
  if (typeof window !== "undefined" && isMobileOrTablet()) {
    return {
      inertia: true,
      inertiaDeceleration: 6500,
      inertiaMaxSpeed: 420,
      easeLinearity: 0.28,
    };
  }
  return {
    inertia: true,
    inertiaDeceleration: 4500,
    inertiaMaxSpeed: 650,
    easeLinearity: 0.25,
  };
}
