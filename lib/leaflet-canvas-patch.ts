"use client";

import L from "leaflet";
import { isMobileOrTablet } from "@/lib/device-utils";

export type MapCanvasKind = "world" | "spain" | "collective";

/**
 * Installs an idempotent patch on L.Canvas so dragging near canvas edges expands smoothly
 * while strictly suspending re-renders during zoom animations/gestures to avoid lag & flicker.
 * Never mutates global L.Canvas.prototype.options.padding.
 */
export function ensureLeafletCanvasPatched(): void {
  if (typeof window === "undefined" || !L || !L.Canvas) return;

  if (L.Polyline?.prototype?.options) {
    L.Polyline.prototype.options.smoothFactor = 1.2;
  }

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
    const padX = Math.max(300, size.x * 0.8);
    const padY = Math.max(300, size.y * 0.8);

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
