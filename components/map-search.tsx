"use client";

import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import * as L from "leaflet";

export type SearchItem = {
  id: string;
  name: string;
  nameLocal?: string;
  type: "peak" | "country" | "region";
  bounds?: any;
  coordinates?: [number, number];
};

type Props = {
  items: SearchItem[];
  /** Called once the map has finished moving to the selected result. */
  onSelect: (item: SearchItem) => void;
  placeholder?: string;
  offsetDown?: boolean;
};

export function MapSearchControl({ items, onSelect, placeholder = "Buscar...", offsetDown = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const map = useMap();
  const divRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRequestRef = useRef(0);

  useEffect(() => {
    if (divRef.current) {
      L.DomEvent.disableClickPropagation(divRef.current);
      L.DomEvent.disableScrollPropagation(divRef.current);
    }
  }, []);

  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }
    const q = query.toLowerCase();
    const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const qNorm = normalize(q);

    const matches = items.filter(item => {
      const name = item.name.toLowerCase();
      const nameLocal = (item.nameLocal || "").toLowerCase();
      const nameNorm = normalize(name);
      const nameLocalNorm = normalize(nameLocal);
      return nameNorm.includes(qNorm) || nameLocalNorm.includes(qNorm) || name.includes(q) || nameLocal.includes(q);
    }).slice(0, 8);
    setResults(matches);
  }, [query, items]);

  return (
    <div 
      ref={divRef} 
      className={`leaflet-control leaflet-bar map-search-control ${offsetDown ? "map-search-control--offset" : ""}`} 
      style={{ 
        position: "absolute", 
        zIndex: 1001, 
        background: "white", 
        borderRadius: expanded ? 8 : "50%", 
        boxShadow: "0 2px 10px rgba(0,0,0,0.15)", 
        overflow: "hidden", 
        pointerEvents: "auto", 
        display: "flex", 
        flexDirection: "column", 
        width: expanded ? 260 : 36, 
        height: expanded ? "auto" : 36, 
        transition: "width 0.2s, border-radius 0.2s" 
      }}
    >
      <div 
        style={{ 
          display: "flex", 
          alignItems: "center", 
          padding: expanded ? "6px 10px" : "0", 
          justifyContent: expanded ? "flex-start" : "center",
          height: expanded ? "auto" : "100%",
          background: expanded ? "#f8f9fa" : "white", 
          borderBottom: results.length ? "1px solid #eaeaea" : "none", 
          cursor: expanded ? "default" : "pointer" 
        }} 
        onClick={() => { if (!expanded) setExpanded(true); }}
      >
        <svg 
          width="18" 
          height="18" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          style={{ color: "#666", flexShrink: 0, cursor: expanded ? "pointer" : "pointer" }} 
          onClick={(e) => { 
            if (expanded) { 
              e.stopPropagation(); 
              setExpanded(false); 
              setQuery(""); 
              setResults([]); 
            } 
          }}
        >
          {expanded ? (
            <g>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </g>
          ) : (
            <g>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </g>
          )}
        </svg>
        {expanded && (
          <input 
            ref={inputRef}
            type="text" 
            placeholder={placeholder} 
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => {
              if (window.innerWidth <= 768) {
                const mapSection = document.querySelector(".map-section");
                if (mapSection) {
                  mapSection.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }
            }}
            style={{ border: "none", outline: "none", padding: "4px 8px", width: "100%", background: "transparent", fontSize: 14 }}
          />
        )}
      </div>
      {expanded && results.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 250, overflowY: "auto" }}>
          {results.map((item, i) => (
            <li 
              key={i} 
              style={{ padding: "10px 14px", cursor: "pointer", borderBottom: i < results.length - 1 ? "1px solid #f0f0f0" : "none", transition: "background 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.background = "#f5f5f5"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              onClick={() => {
                // The scan belongs to the destination, not the click. Listening before
                // starting the flight makes the callback work for both flyTo variants.
                const requestId = ++searchRequestRef.current;
                const notifyArrival = () => {
                  // A later result may have interrupted this flight. Its moveend event
                  // still arrives, but it must not start an additional scan.
                  if (searchRequestRef.current !== requestId) return;
                  // Damos margen para que las teselas del mapa terminen de cargar visualmente
                  setTimeout(() => {
                    if (searchRequestRef.current === requestId) {
                      onSelect(item);
                    }
                  }, 800);
                };
                if (item.bounds) {
                  map.once("moveend", notifyArrival);
                  map.flyToBounds(item.bounds, { padding: [20, 20], maxZoom: 10, duration: 0.8 });
                } else if (item.coordinates) {
                  map.once("moveend", notifyArrival);
                  map.flyTo(item.coordinates, 10, { duration: 0.8 });
                } else {
                  onSelect(item);
                }
                setExpanded(false);
                setQuery("");
                setResults([]);
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: "#333" }}>{item.name}</div>
              {item.nameLocal && item.nameLocal !== item.name && (
                <div style={{ fontSize: 11, color: "#777", marginTop: 2 }}>{item.nameLocal}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
