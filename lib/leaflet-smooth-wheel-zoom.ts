/**
 * Smooth Wheel Zoom for Leaflet (Google Maps-like continuous zooming on desktop web).
 * Replaces discrete integer zoom steps with smooth fractional zooming anchored to the cursor.
 */
import * as L from "leaflet";

if (typeof window !== "undefined" && L && L.Map && !(L.Map as any).SmoothWheelZoom) {
  (L.Map as any).mergeOptions({
    smoothWheelZoom: true,
    smoothSensitivity: 1,
  });

  const SmoothWheelZoom = (L.Handler as any).extend({
    addHooks: function () {
      const container = this._map?._container;
      if (!container) return;
      this._onWheelScrollBound = this._onWheelScroll.bind(this);
      container.addEventListener("wheel", this._onWheelScrollBound, { passive: false });
    },

    removeHooks: function () {
      const container = this._map?._container;
      if (container && this._onWheelScrollBound) {
        container.removeEventListener("wheel", this._onWheelScrollBound);
      }
      if (this._zoomAnimationId) {
        cancelAnimationFrame(this._zoomAnimationId);
        this._zoomAnimationId = null;
      }
      if (this._timeoutId) {
        clearTimeout(this._timeoutId);
        this._timeoutId = null;
      }
      this._isWheeling = false;
    },

    _onWheelScroll: function (e: WheelEvent) {
      if (!this._map?.options?.smoothWheelZoom) return;

      if (!this._isWheeling) {
        this._onWheelStart(e);
      }
      this._onWheeling(e);
    },

    _onWheelStart: function (e: WheelEvent) {
      const map = this._map;
      if (!map) return;
      this._isWheeling = true;
      this._wheelMousePosition = map.mouseEventToContainerPoint(e);
      this._centerPoint = map.getSize()._divideBy(2);
      this._startLatLng = map.containerPointToLatLng(this._centerPoint);
      this._wheelStartLatLng = map.containerPointToLatLng(this._wheelMousePosition);
      this._startZoom = map.getZoom();
      this._moved = false;

      map._stop();
      if (map._panAnim) map._panAnim.stop();

      this._goalZoom = map.getZoom();
      this._prevCenter = map.getCenter();
      this._prevZoom = map.getZoom();

      this._zoomAnimationId = requestAnimationFrame(this._updateWheelZoom.bind(this));
    },

    _onWheeling: function (e: WheelEvent) {
      const map = this._map;
      if (!map) return;

      // Extract normalized delta from Leaflet's DomEvent or native event
      let delta = (L.DomEvent as any).getWheelDelta ? (L.DomEvent as any).getWheelDelta(e) : 0;
      if (!delta && e.deltaY) {
        delta = -e.deltaY * (e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? 60 : 1);
      }

      const sensitivity = map.options.smoothSensitivity || 1;
      // 0.002 sensitivity factor gives ~0.24 zoom levels per standard notch (feels natural like Google Maps)
      this._goalZoom = this._goalZoom + delta * 0.002 * sensitivity;

      const min = map.getMinZoom();
      const max = map.getMaxZoom();
      if (this._goalZoom < min) this._goalZoom = min;
      if (this._goalZoom > max) this._goalZoom = max;

      this._wheelMousePosition = map.mouseEventToContainerPoint(e);

      if (this._timeoutId) clearTimeout(this._timeoutId);
      this._timeoutId = setTimeout(this._onWheelEnd.bind(this), 200);

      if (!this._zoomAnimationId) {
        this._zoomAnimationId = requestAnimationFrame(this._updateWheelZoom.bind(this));
      }

      e.preventDefault();
      e.stopPropagation();
    },

    _onWheelEnd: function () {
      this._isWheeling = false;
      if (this._zoomAnimationId) {
        cancelAnimationFrame(this._zoomAnimationId);
        this._zoomAnimationId = null;
      }
      if (this._map) {
        if (Math.abs(this._map.getZoom() - this._goalZoom) > 0.001) {
          const center = this._center || this._map.getCenter();
          this._map._move(center, this._goalZoom);
        }
        this._map._moveEnd(true);
      }
    },

    _updateWheelZoom: function () {
      const map = this._map;
      if (!map) return;

      if (!map.getCenter().equals(this._prevCenter) || map.getZoom() !== this._prevZoom) {
        return;
      }

      const currentZoom = map.getZoom();
      const diff = this._goalZoom - currentZoom;

      if (Math.abs(diff) < 0.001) {
        this._zoom = this._goalZoom;
      } else {
        this._zoom = currentZoom + diff * 0.28;
      }
      this._zoom = Math.round(this._zoom * 1000) / 1000;

      const delta = this._wheelMousePosition ? this._wheelMousePosition.subtract(this._centerPoint) : null;
      if (!delta || (delta.x === 0 && delta.y === 0) || map.options.smoothWheelZoom === "center") {
        this._center = this._startLatLng || map.getCenter();
      } else {
        this._center = map.unproject(
          map.project(this._wheelStartLatLng, this._zoom).subtract(delta),
          this._zoom
        );
      }

      if (map.options.maxBounds && (map as any)._limitCenter) {
        this._center = (map as any)._limitCenter(this._center, this._zoom, map.options.maxBounds);
      }

      if (!this._moved) {
        map._moveStart(true, false);
        this._moved = true;
      }

      map._move(this._center, this._zoom);
      this._prevCenter = map.getCenter();
      this._prevZoom = map.getZoom();

      if (Math.abs(this._goalZoom - this._zoom) >= 0.001) {
        this._zoomAnimationId = requestAnimationFrame(this._updateWheelZoom.bind(this));
      } else {
        this._zoomAnimationId = null;
      }
    },
  });

  (L.Map as any).SmoothWheelZoom = SmoothWheelZoom;
  (L.Map as any).addInitHook("addHandler", "smoothWheelZoom", SmoothWheelZoom);
}
