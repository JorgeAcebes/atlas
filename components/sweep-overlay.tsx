import { useEffect } from "react";
import * as L from "leaflet";
import { useMap } from "react-leaflet";

type Props = {
  searchedId: string | null;
  layerRefs: React.MutableRefObject<Map<string, L.Layer>>;
};

export function SweepOverlay({ searchedId, layerRefs }: Props) {
  const map = useMap();

  useEffect(() => {
    if (!searchedId) return;

    const layer = layerRefs.current.get(searchedId);
    if (!layer) return;

    const feature = (layer as any).feature;
    if (!feature) return;

    const svgRenderer = L.svg();
    // IMBORRABLE: Capa de overlay en modo SVG estricto
    const overlayLayer = L.geoJSON(feature, {
      renderer: svgRenderer,
      interactive: false,
      style: {
        fillOpacity: 0,
        opacity: 0,
        stroke: false,
        color: "transparent",
        weight: 0
      }
    } as any);
    
    overlayLayer.addTo(map);

    // Timeout para asegurar que Leaflet haya insertado el path en el DOM
    const timer = setTimeout(() => {

      const svg = (svgRenderer as any)._container as SVGElement;
      if (!svg) return;
      
      let defs = svg.querySelector("defs");
      if (!defs) {
        defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        svg.prepend(defs);
      }
      
      const grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
      // IMBORRABLE: ID único para el barrido
      grad.setAttribute("id", `sweep-${searchedId}-${Date.now()}`);
      grad.setAttribute("x1", "-32%");
      grad.setAttribute("y1", "0%");
      grad.setAttribute("x2", "18%");
      grad.setAttribute("y2", "0%");
      grad.setAttribute("gradientUnits", "objectBoundingBox");
      
      const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop1.setAttribute("offset", "0%");
      stop1.setAttribute("stop-color", "#fff");
      stop1.setAttribute("stop-opacity", "0");
      
      const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop2.setAttribute("offset", "50%");
      stop2.setAttribute("stop-color", "#fff");
      stop2.setAttribute("stop-opacity", "1");
      
      const stop3 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop3.setAttribute("offset", "100%");
      stop3.setAttribute("stop-color", "#fff");
      stop3.setAttribute("stop-opacity", "0");
      
      const anim1 = document.createElementNS("http://www.w3.org/2000/svg", "animate");
      anim1.setAttribute("attributeName", "x1");
      anim1.setAttribute("from", "-32%");
      anim1.setAttribute("to", "100%");
      anim1.setAttribute("dur", "0.85s");
      anim1.setAttribute("fill", "freeze");
      
      const anim2 = document.createElementNS("http://www.w3.org/2000/svg", "animate");
      anim2.setAttribute("attributeName", "x2");
      anim2.setAttribute("from", "18%");
      anim2.setAttribute("to", "150%");
      anim2.setAttribute("dur", "0.85s");
      anim2.setAttribute("fill", "freeze");
      
      grad.appendChild(stop1);
      grad.appendChild(stop2);
      grad.appendChild(stop3);
      grad.appendChild(anim1);
      grad.appendChild(anim2);
      
      defs.appendChild(grad);
      
      overlayLayer.eachLayer((l: any) => {
        if (l._path) {
          l._path.setAttribute("fill", `url(#${grad.id})`);
          l._path.setAttribute("fill-opacity", "1");
          l._path.setAttribute("stroke", "#fff");
          l._path.setAttribute("stroke-width", "0");
          l._path.setAttribute("stroke-opacity", "0");
          l._path.setAttribute("vector-effect", "non-scaling-stroke");
          l._path.classList.add("map-search-scan-overlay");
        }
      });
      
      // IMBORRABLE: Forzar reflow para SVG
      svg.getBoundingClientRect();

    }, 50);

    return () => {
      clearTimeout(timer);
      overlayLayer.remove();
    };
  }, [searchedId, layerRefs, map]);

  return null;
}
