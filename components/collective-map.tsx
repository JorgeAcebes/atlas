"use client";

import * as L from "leaflet";
import {
  GeoJSON,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
  Marker,
  Tooltip,
} from "react-leaflet";
import type { Path } from "leaflet";
import type { FeatureCollection, Position } from "geojson";
import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import { countries, resolveCountryFromFeature, type Country } from "@/data/countries";
import { peakByCode, type Peak } from "@/data/peaks";
import * as ReactDOMServer from "react-dom/server";
import { getIconComponent } from "./icons";
import { predefinedCategories } from "@/data/experiences";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-context";
import { AuthDialog } from "@/components/auth-dialog";
import { UserRoundCheck } from "lucide-react";
import { MapSearchControl, type SearchItem } from "./map-search";
import { SweepOverlay } from "./sweep-overlay";

// Override Leaflet's default canvas padding to preload vector shapes far outside the viewport
L.Canvas.prototype.options.padding = 0.5;

const WORLD_TOPO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";
const PROVINCES_TOPO_URL = "/provincias_spain.topo.json";
const PROVINCES_URL = "/provincias_spain.geojson";
const PROVINCES_FALLBACK_URL =
  "https://gist.githubusercontent.com/josemamira/3af52a4698d42b3f676fbc23f807a605/raw/cc5e247b63b05520c167639ed51d61acd560b1c1/provincias_spain.geojson";

// ── Module-level GeoJSON cache ────────────
const expIconCache = new Map<string, L.DivIcon>();
let _worldGeoCache: FeatureCollection | null = null;
let _worldGeoPromise: Promise<FeatureCollection> | null = null;
let _spainGeoCache: FeatureCollection | null = null;
let _spainGeoPromise: Promise<FeatureCollection> | null = null;

function fetchWorldGeo(): Promise<FeatureCollection> {
  if (_worldGeoCache) return Promise.resolve(_worldGeoCache);
  if (!_worldGeoPromise) {
    _worldGeoPromise = fetch(WORLD_TOPO_URL)
      .then((response) => response.json())
      .then((topology: Topology) => {
        const countriesGeo = feature(
          topology,
          topology.objects.countries as any,
        ) as unknown as FeatureCollection;
        fixAntimeridian(countriesGeo);
        _worldGeoCache = countriesGeo;
        return countriesGeo;
      });
  }
  return _worldGeoPromise;
}

function fetchProvinces(): Promise<FeatureCollection> {
  if (_spainGeoCache) return Promise.resolve(_spainGeoCache);
  if (!_spainGeoPromise) {
    _spainGeoPromise = fetch(PROVINCES_TOPO_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((topology: Topology) => {
        const provincesGeo = feature(
          topology,
          (topology.objects.provincias || Object.values(topology.objects)[0]) as any
        ) as unknown as FeatureCollection;
        _spainGeoCache = provincesGeo;
        return provincesGeo;
      })
      .catch(() => {
        return fetch(PROVINCES_URL)
          .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          })
          .catch(() => {
            return fetch(PROVINCES_FALLBACK_URL).then((r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              return r.json();
            });
          })
          .then((data: FeatureCollection) => {
            _spainGeoCache = data;
            return data;
          });
      })
      .catch((err) => {
        _spainGeoPromise = null;
        throw err;
      });
  }
  return _spainGeoPromise;
}

function fixAntimeridian(geo: FeatureCollection) {
  const fixRing = (ring: Position[]) => {
    for (let i = 1; i < ring.length; i++) {
      const prev = ring[i - 1][0];
      let curr = ring[i][0];
      if (curr - prev > 180) {
        ring[i][0] -= 360;
      } else if (curr - prev < -180) {
        ring[i][0] += 360;
      }
    }
  };

  geo.features.forEach((f) => {
    if (f.geometry.type === "Polygon") {
      f.geometry.coordinates.forEach(fixRing);
    } else if (f.geometry.type === "MultiPolygon") {
      f.geometry.coordinates.forEach((poly) => poly.forEach(fixRing));
    }
  });
}

function getLargestPolygonBounds(feature: any) {
  if (!feature || !feature.geometry) return undefined;
  if (feature.geometry.type === "MultiPolygon") {
    let maxPoints = 0;
    let largestPoly = null;
    for (const polyCoords of feature.geometry.coordinates) {
      if (polyCoords[0] && polyCoords[0].length > maxPoints) {
        maxPoints = polyCoords[0].length;
        largestPoly = {
          type: "Feature",
          properties: feature.properties,
          geometry: {
            type: "Polygon",
            coordinates: polyCoords
          }
        };
      }
    }
    if (largestPoly) {
      return L.geoJSON(largestPoly as any).getBounds();
    }
  }
  return L.geoJSON(feature).getBounds();
}

function FitWorld() {
  const map = useMap();
  useEffect(() => {
    map.fitBounds([[-60, -180], [80, 180]], { padding: [0, 0] });
  }, [map]);
  return null;
}

function FitSpain() {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(
      [
        [27.55, -18.65],
        [43.95, 4.95],
      ],
      { padding: [12, 12] },
    );
  }, [map]);
  return null;
}

function MapZoomListener() {
  const map = useMapEvents({
    zoom: () => {
      const container = map.getContainer();
      container.setAttribute("data-zoom", Math.round(map.getZoom()).toString());
    },
    zoomend: () => {
      const zoom = map.getZoom();
      const container = map.getContainer();
      if (zoom !== undefined) container.setAttribute("data-zoom", Math.round(zoom).toString());
    },
  });
  useEffect(() => {
    const container = map.getContainer();
    const zoom = map.getZoom();
    if (zoom !== undefined) container.setAttribute("data-zoom", Math.round(zoom).toString());
  }, [map]);
  return null;
}

type CollectiveSummitData = {
  summit_id: string;
  visitor_ids: string[];
  visitor_usernames: string[];
  visitor_avatars: string[];
};

type Props = {
  onClose: () => void;
  scope?: "all" | "following";
  onScopeChange?: (scope: "all" | "following") => void;
  mode?: "countries" | "peaks";
};

const peakEntries = Object.values(peakByCode);

function getPeakMarkerIcon(count: number) {
  const path = "M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z";
  if (count >= 3) {
    return L.divIcon({
      className: "",
      html: `<span class="summit-pin" style="background: #5c9b7d; border-color: #245f52; color: white;"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="none"><path d="${path}"></path></svg></span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  } else if (count === 2) {
    return L.divIcon({
      className: "",
      html: `<span class="summit-pin" style="background: #bcd4c8; border-color: #7da894; color: #1b4332;"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="none"><path d="${path}"></path></svg></span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  } else if (count === 1) {
    return L.divIcon({
      className: "",
      html: `<span class="summit-pin" style="background: #c75a3a; border-color: #8c3a25; color: white;"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="none"><path d="${path}"></path></svg></span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  } else {
    return L.divIcon({
      className: "",
      html: `<span class="summit-pin" style="background: #f0ede8; border-color: #c4bfb6; color: #888;"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><path d="${path}"></path></svg></span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }
}

function ExperiencesToggleControl({
  showExperiences,
  setShowExperiences,
  experienceMarkersCount,
}: {
  showExperiences: boolean;
  setShowExperiences: (v: boolean | ((prev: boolean) => boolean)) => void;
  experienceMarkersCount: number;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const lastToggleRef = useRef(0);

  const toggle = useCallback(() => {
    const now = Date.now();
    if (now - lastToggleRef.current < 200) return;
    lastToggleRef.current = now;
    setShowExperiences((prev) => !prev);
  }, [setShowExperiences]);

  useEffect(() => {
    const el = divRef.current;
    if (el) {
      L.DomEvent.disableClickPropagation(el);
      L.DomEvent.disableScrollPropagation(el);

      const handleClick = (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        toggle();
      };

      el.addEventListener("click", handleClick);
      return () => {
        el.removeEventListener("click", handleClick);
      };
    }
  }, [toggle]);

  return (
    <div
      ref={divRef}
      role="button"
      tabIndex={0}
      className={`leaflet-control leaflet-bar collective-exp-toggle-control ${showExperiences ? "collective-exp-toggle-control--active" : ""}`}
      style={{
        background: showExperiences ? "#cba6f7" : "white",
        color: showExperiences ? "#11111b" : "#666",
      }}
      title={showExperiences ? "Ocultar experiencias" : "Mostrar experiencias"}
      aria-label={showExperiences ? "Ocultar experiencias" : "Mostrar experiencias"}
      aria-pressed={showExperiences}
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
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
      >
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    </div>
  );
}

export function CollectiveMap({ onClose, scope: propScope, onScopeChange, mode = "countries" }: Props) {
  const router = useRouter();
  const { session } = useAuth();
  const [internalScope, setInternalScope] = useState<"all" | "following">("all");
  const scope = propScope !== undefined ? propScope : internalScope;
  const [authOpen, setAuthOpen] = useState<"login" | "register" | null>(null);

  const toggleScope = () => {
    if (!session) {
      setAuthOpen("login");
      return;
    }
    const next = scope === "following" ? "all" : "following";
    if (onScopeChange) {
      onScopeChange(next);
    } else {
      setInternalScope(next);
    }
  };

  const isPeaks = mode === "peaks";
  const [worldGeo, setWorldGeo] = useState<FeatureCollection | null>(_worldGeoCache);
  const [spainGeo, setSpainGeo] = useState<FeatureCollection | null>(_spainGeoCache);
  const [collectiveData, setCollectiveData] = useState<Map<string, CollectiveSummitData>>(new Map());
  const [loading, setLoading] = useState(true);
  
  const [selectedSummit, setSelectedSummit] = useState<{ id: string, name: string, visitors: { id: string; username: string; avatar: string }[], isExperience?: boolean } | null>(null);
  const [searchedId, setSearchedId] = useState<string | null>(null);
  const [showExperiences, setShowExperiences] = useState(false);
  const [experienceMarkers, setExperienceMarkers] = useState<any[]>([]);
  
  const layerRefs = useRef(new Map<string, L.Path>());
  const searchTimeoutRef = useRef<NodeJS.Timeout>(null);
  const scanFrameRef = useRef<number | null>(null);

  // Fetch GeoJSON
  useEffect(() => {
    if (isPeaks) {
      if (!spainGeo) {
        fetchProvinces().then(setSpainGeo).catch(() => setSpainGeo(null));
      }
    } else {
      if (!worldGeo) {
        fetchWorldGeo().then(setWorldGeo).catch(() => setWorldGeo(null));
      }
    }
  }, [isPeaks, spainGeo, worldGeo]);

  // Fetch collective data (summits / countries)
  useEffect(() => {
    async function fetchSummits() {
      if (!supabase) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setSelectedSummit(null);
      setSearchedId(null);
      layerRefs.current.clear();
      
      const { data, error } = await supabase.rpc('get_collective_summits', {
        p_mode: isPeaks ? "peaks" : "countries",
        p_following_only: scope === "following"
      });
      
      if (error) {
        console.error("Error fetching collective summits:", error);
        setLoading(false);
        return;
      }
      const map = new Map<string, CollectiveSummitData>();
      if (data) {
        for (const row of data as CollectiveSummitData[]) {
          map.set(row.summit_id, row);
        }
      }
      setCollectiveData(map);
      setLoading(false);
    }
    fetchSummits();
  }, [scope, isPeaks]);

  // Fetch experiences (only in countries mode)
  useEffect(() => {
    async function fetchExperiences() {
      if (isPeaks || !showExperiences || !supabase) {
        setExperienceMarkers([]);
        return;
      }
      
      let allowedUserIds: string[] | null = null;
      
      if (scope === "following") {
        if (session) {
          const { data: following } = await supabase
            .from('connections')
            .select('following_id')
            .eq('follower_id', session.user.id)
            .eq('status', 'accepted');
          if (following && following.length > 0) {
            allowedUserIds = following.map(f => f.following_id);
            allowedUserIds.push(session.user.id); // Incluirse a uno mismo
          } else {
            allowedUserIds = [session.user.id];
          }
        } else {
          allowedUserIds = [];
        }
      }

      if (allowedUserIds !== null && allowedUserIds.length === 0) {
        setExperienceMarkers([]);
        return;
      }
      
      let query = supabase
        .from('experience_records')
        .select('id, lat, lng, location_name, user_id, experience_id, sub_item_id, is_wishlist')
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .or('is_wishlist.is.null,is_wishlist.eq.false');
        
      if (allowedUserIds && allowedUserIds.length > 0) {
        query = query.in('user_id', allowedUserIds);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error("Error fetching experiences:", error);
        return;
      }
      
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(d => d.user_id))];
        
        let profilesQuery = supabase
          .from('profiles')
          .select('id, username, avatar_url, is_public, is_test')
          .in('id', userIds);
          
        if (scope === 'all') {
          if (session?.user?.id) {
            profilesQuery = profilesQuery.or(`is_public.eq.true,id.eq.${session.user.id}`);
          } else {
            profilesQuery = profilesQuery.eq('is_public', true);
          }
        }
        
        const { data: profilesData, error: profilesError } = await profilesQuery;
        
        if (profilesError) {
          console.error("Error fetching profiles:", profilesError);
          return;
        }
        
        const profilesMap = new Map();
        if (profilesData) {
          for (const p of profilesData) {
            if (!p.is_test) {
              profilesMap.set(p.id, p);
            }
          }
        }
        
        const markers = data
          .filter(d => profilesMap.has(d.user_id))
          .map(d => ({
            ...d,
            profiles: profilesMap.get(d.user_id)
          }));
          
        setExperienceMarkers(markers);
      } else {
        setExperienceMarkers([]);
      }
    }
    fetchExperiences();
  }, [scope, showExperiences, session, isPeaks]);

  const getVisitorCount = useCallback((summitId: string) => {
    const data = collectiveData.get(summitId);
    return data ? data.visitor_usernames.length : 0;
  }, [collectiveData]);

  // Color scheme based on number of visitors
  const getStyle = useCallback((summitId: string) => {
    const count = getVisitorCount(summitId);
    let color, weight, fillColor, fillOpacity;

    if (count === 0) {
      if (isPeaks) {
        color = "#6f9488"; weight = 1.25; fillColor = "#ebf2ee"; fillOpacity = 0.55;
      } else {
        color = "#c4bfb6"; weight = 0.8; fillColor = "#e8e4df"; fillOpacity = 0.4;
      }
    } else if (count === 1) {
      color = "#8c3a25"; weight = 1.5; fillColor = "#c75a3a"; fillOpacity = 0.75;
    } else if (count === 2) {
      if (isPeaks) {
        color = "#3d735f"; weight = 1.35; fillColor = "#bcd4c8"; fillOpacity = 0.75;
      } else {
        color = "#9583ad"; weight = 1.15; fillColor = "#c5b3da"; fillOpacity = 0.65;
      }
    } else {
      if (isPeaks) {
        color = "#18342d"; weight = 1.6; fillColor = "#5c9b7d"; fillOpacity = 0.85;
      } else {
        color = "#4a2878"; weight = 1.5; fillColor = "#7b52ab"; fillOpacity = 0.8;
      }
    }

    return { color, weight, fillColor, fillOpacity };
  }, [getVisitorCount, isPeaks]);

  const geoStyle = useCallback(
    (f: any) => {
      if (isPeaks) {
        const peak = peakByCode[String(f?.properties?.Codigo ?? "")];
        if (!peak) {
          return { color: "#6f9488", weight: 1.25, fillColor: "#ebf2ee", fillOpacity: 0.55 };
        }
        return getStyle(peak.id);
      } else {
        const country = resolveCountryFromFeature(f as any);
        const summitId = country ? country.id : "";

        if (!summitId) {
          return { color: "#c4bfb6", weight: 0.8, fillColor: "#e8e4df", fillOpacity: 0.4 };
        }
        return getStyle(summitId);
      }
    },
    [isPeaks, getStyle],
  );

  // ── Reactively update layer styles without remounting GeoJSON ──
  useEffect(() => {
    layerRefs.current.forEach((layer) => {
      const feature = (layer as any).feature;
      if (feature) {
        layer.setStyle(geoStyle(feature));
      }
    });
  }, [geoStyle]);

  const onEachFeature = useCallback(
    (f: any, layer: L.Layer) => {
      if (isPeaks) {
        const peak = peakByCode[String(f?.properties?.Codigo ?? "")];
        if (!peak) return;
        const summitId = peak.id;
        const code = peak.code;
        const name = `${peak.province}: ${peak.name}`;

        layerRefs.current.set(code, layer as Path);
        const count = getVisitorCount(summitId);
        const tooltipText = count > 0
          ? `${name} — ${count} ${count === 1 ? 'escalador' : 'escaladores'}`
          : name;

        const statusClass = count >= 3 ? "tooltip-done" : count > 0 ? "tooltip-wishlist" : "tooltip-todo";
        layer.bindTooltip(tooltipText, {
          sticky: true,
          className: `summit-tooltip ${statusClass}`,
        });

        layer.on("click", () => {
          const data = collectiveData.get(summitId);
          if (data && data.visitor_usernames.length > 0) {
            const visitors = data.visitor_usernames.map((username, i) => ({
              id: data.visitor_ids[i],
              username,
              avatar: data.visitor_avatars[i],
            }));
            setSelectedSummit({ id: summitId, name, visitors });
          } else {
            setSelectedSummit({ id: summitId, name, visitors: [] });
          }
        });

        layer.on("mouseover", () => {
          if (searchedId === code) return;
          const style = getStyle(summitId);
          (layer as Path).setStyle({ weight: 2.5, fillOpacity: Math.min(style.fillOpacity + 0.15, 1) });
        });
        layer.on("mouseout", () => {
          if (searchedId === code) return;
          const style = getStyle(summitId);
          (layer as Path).setStyle({ weight: style.weight, fillOpacity: style.fillOpacity });
        });
      } else {
        const country = resolveCountryFromFeature(f as any);
        if (!country) return;
        const summitId = country.id;
        const name = country.name;

        layerRefs.current.set(summitId, layer as Path);
        const count = getVisitorCount(summitId);
        const tooltipText = count > 0
          ? `${name} — ${count} ${count === 1 ? 'visitante' : 'visitantes'}`
          : name;

        const statusClass = count >= 3 ? "tooltip-done" : count > 0 ? "tooltip-wishlist" : "tooltip-todo";
        layer.bindTooltip(tooltipText, {
          sticky: true,
          className: `summit-tooltip ${statusClass}`,
        });

        layer.on("click", () => {
          const data = collectiveData.get(summitId);
          if (data && data.visitor_usernames.length > 0) {
            const visitors = data.visitor_usernames.map((username, i) => ({
              id: data.visitor_ids[i],
              username,
              avatar: data.visitor_avatars[i],
            }));
            setSelectedSummit({ id: summitId, name, visitors });
          } else {
            setSelectedSummit({ id: summitId, name, visitors: [] });
          }
        });

        layer.on("mouseover", () => {
          if (searchedId === summitId) return;
          const style = getStyle(summitId);
          (layer as Path).setStyle({ weight: 2.5, fillOpacity: Math.min(style.fillOpacity + 0.15, 1) });
        });
        layer.on("mouseout", () => {
          if (searchedId === summitId) return;
          const style = getStyle(summitId);
          (layer as Path).setStyle({ weight: style.weight, fillOpacity: style.fillOpacity });
        });
      }
    },
    [isPeaks, collectiveData, getVisitorCount, getStyle, searchedId],
  );

  const searchItems = useMemo<SearchItem[]>(() => {
    if (isPeaks) {
      return peakEntries.map((peak) => {
        let bounds: any = undefined;
        if (spainGeo) {
          const relatedCodes = peakEntries
            .filter((p) => p.id === peak.id)
            .map((p) => p.code);

          const relatedFeatures = spainGeo.features.filter((f) =>
            relatedCodes.includes(String(f.properties?.Codigo ?? ""))
          );

          if (relatedFeatures.length > 0) {
            bounds = L.geoJSON(relatedFeatures as any).getBounds();
          }
        }
        const count = getVisitorCount(peak.id);
        const st = count >= 3 ? "done" : count > 0 ? "wishlist" : "none";

        return {
          id: peak.code,
          name: peak.name,
          nameLocal: peak.province,
          status: st,
          type: "peak",
          coordinates: peak.coordinates,
          bounds,
        };
      });
    }

    return countries.map((c) => {
      const count = getVisitorCount(c.id);
      const st = count >= 3 ? "done" : count > 0 ? "wishlist" : "none";
      
      let bounds: any;
      if (worldGeo) {
        const feature = worldGeo.features.find((f: any) => resolveCountryFromFeature(f)?.id === c.id);
        if (feature) {
          bounds = getLargestPolygonBounds(feature);
        }
      }
      
      return {
        id: c.id,
        name: c.name,
        status: st,
        type: "country",
        coordinates: c.coordinates,
        bounds,
      };
    });
  }, [isPeaks, getVisitorCount, spainGeo, worldGeo]);

  const handleSearchSelect = useCallback((item: SearchItem) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (scanFrameRef.current) cancelAnimationFrame(scanFrameRef.current);
    
    setSearchedId(item.id);
    
    const layer = layerRefs.current.get(item.id);
    if (layer) {
      layer.bringToFront();
    }
    
    if (isPeaks) {
      const peak = peakByCode[item.id] || peakEntries.find((p) => p.id === item.id);
      const summitId = peak ? peak.id : item.id;
      const data = collectiveData.get(summitId);
      const name = peak ? `${peak.province}: ${peak.name}` : item.name;
      if (data && data.visitor_usernames.length > 0) {
        const visitors = data.visitor_usernames.map((username, i) => ({
          id: data.visitor_ids[i],
          username,
          avatar: data.visitor_avatars[i],
        }));
        setSelectedSummit({ id: summitId, name, visitors });
      } else {
        setSelectedSummit({ id: summitId, name, visitors: [] });
      }
    } else {
      const data = collectiveData.get(item.id);
      if (data && data.visitor_usernames.length > 0) {
        const visitors = data.visitor_usernames.map((username, i) => ({
          id: data.visitor_ids[i],
          username,
          avatar: data.visitor_avatars[i],
        }));
        setSelectedSummit({ id: item.id, name: item.name, visitors });
      } else {
        setSelectedSummit({ id: item.id, name: item.name, visitors: [] });
      }
    }

    searchTimeoutRef.current = setTimeout(() => {
      setSearchedId(null);
    }, 1800);
  }, [isPeaks, collectiveData]);

  // Clean up timeout
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (scanFrameRef.current) cancelAnimationFrame(scanFrameRef.current);
    };
  }, []);

  // Unique peak markers grouped by physical peak
  const uniquePeaks = useMemo(() => {
    if (!isPeaks) return [];
    const map = new Map<string, { id: string; name: string; provinces: string[]; coordinates: [number, number]; altitude: number }>();
    for (const p of peakEntries) {
      const existing = map.get(p.id);
      if (existing) {
        if (!existing.provinces.includes(p.province)) {
          existing.provinces.push(p.province);
        }
      } else {
        map.set(p.id, {
          id: p.id,
          name: p.name,
          provinces: [p.province],
          coordinates: p.coordinates,
          altitude: p.altitude,
        });
      }
    }
    return Array.from(map.values());
  }, [isPeaks]);

  // Total stats
  const totalVisited = collectiveData.size;
  const allVisitors = useMemo(() => {
    const set = new Set<string>();
    collectiveData.forEach((data) => {
      data.visitor_usernames.forEach((u) => set.add(u));
    });
    return set.size;
  }, [collectiveData]);

  const statsText = loading
    ? "Cargando..."
    : isPeaks
      ? `${totalVisited} ${totalVisited === 1 ? 'pico' : 'picos'} · ${allVisitors} ${allVisitors === 1 ? 'escalador' : 'escaladores'}`
      : `${totalVisited} ${totalVisited === 1 ? 'país' : 'países'} · ${allVisitors} ${allVisitors === 1 ? 'viajero' : 'viajeros'}`;

  return (
    <div className={`collective-map-overlay ${isPeaks ? "mode-peaks" : "mode-countries"}`}>
      <div className="collective-map-header">
        <div className="collective-map-header-left">
          <h2>Mapa Colectivo</h2>
          <span className="collective-map-stats">
            {statsText}
          </span>
        </div>
        
        <div className="collective-map-toggles">
          <button
            type="button"
            className={`social-following-btn ${scope === "following" ? "social-following-btn--active" : ""}`}
            onClick={toggleScope}
            title={scope === "following" ? "Ver mapa colectivo global" : "Ver solo a quienes sigues"}
            aria-pressed={scope === "following"}
          >
            <UserRoundCheck size={14} className="social-following-icon" />
            <span>Siguiendo</span>
          </button>
        </div>

        <button className="collective-map-close" onClick={onClose} aria-label="Cerrar mapa colectivo">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="collective-map-container">
        {loading ? (
          <div className="collective-map-loading">
            <div className="collective-map-spinner" />
            <p>Cargando datos colectivos...</p>
          </div>
        ) : (
          <MapContainer
            key={isPeaks ? "map-peaks" : "map-countries"}
            className="map"
            scrollWheelZoom={true}
            preferCanvas={true}
            minZoom={isPeaks ? 4 : 1}
            maxZoom={isPeaks ? 10 : 12}
            maxBounds={isPeaks ? [[24, -22], [46, 8]] : [[-85, -180], [85, 180]]}
            maxBoundsViscosity={0.5}
          >
            <MapZoomListener />
            <SweepOverlay searchedId={searchedId} layerRefs={layerRefs} />
            {isPeaks ? <FitSpain /> : <FitWorld />}
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              keepBuffer={4}
              updateWhenIdle={true}
              updateWhenZooming={false}
            />
            {isPeaks && spainGeo && (
              <GeoJSON
                key="collective-spain"
                data={spainGeo}
                style={geoStyle}
                onEachFeature={onEachFeature}
              />
            )}
            {!isPeaks && worldGeo && (
              <GeoJSON
                key="collective-countries"
                data={worldGeo}
                style={geoStyle}
                onEachFeature={onEachFeature}
              />
            )}
            
            {isPeaks && uniquePeaks.map((peak) => {
              const count = getVisitorCount(peak.id);
              const icon = getPeakMarkerIcon(count);
              const provText = peak.provinces.join(" / ");
              return (
                <Marker
                  key={peak.id}
                  position={peak.coordinates}
                  icon={icon}
                  zIndexOffset={count > 0 ? 500 : 100}
                  eventHandlers={{
                    click: () => {
                      const data = collectiveData.get(peak.id);
                      const name = `${provText}: ${peak.name}`;
                      if (data && data.visitor_usernames.length > 0) {
                        const visitors = data.visitor_usernames.map((username, i) => ({
                          id: data.visitor_ids[i],
                          username,
                          avatar: data.visitor_avatars[i],
                        }));
                        setSelectedSummit({ id: peak.id, name, visitors });
                      } else {
                        setSelectedSummit({ id: peak.id, name, visitors: [] });
                      }
                    },
                  }}
                />
              );
            })}

            {!isPeaks && showExperiences && experienceMarkers.map(marker => {
               // Find icon name
               const cat = predefinedCategories.find(c => c.experiences.some(e => e.id === marker.experience_id));
               const iconName = cat?.iconName || "star";
               
               // Find experience name
               const exp = cat?.experiences.find(e => e.id === marker.experience_id);
               const subItem = exp?.subItems?.find(s => s.id === marker.sub_item_id);
               const expName = subItem?.name || exp?.name || marker.location_name || 'Experiencia';

               let customIcon = expIconCache.get(iconName);
               if (!customIcon) {
                 const iconHtml = ReactDOMServer.renderToString(
                   <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                     <span className="summit-pin summit-pin--experience summit-pin--done" style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
                       {getIconComponent(iconName)}
                     </span>
                   </div>
                 );
                 
                 customIcon = L.divIcon({
                   html: iconHtml,
                   className: 'experience-hitbox',
                   iconSize: [36, 36],
                   iconAnchor: [18, 18],
                 });
                 expIconCache.set(iconName, customIcon);
               }

               return (
                 <Marker 
                   key={marker.id} 
                   position={[marker.lat, marker.lng]} 
                   icon={customIcon}
                   zIndexOffset={1000}
                   eventHandlers={{
                     click: () => {
                       const expRecordId = marker.experience_id
                         ? (marker.sub_item_id ? `${marker.experience_id}::${marker.sub_item_id}` : marker.experience_id)
                         : marker.id;
                       setSelectedSummit({ 
                         id: expRecordId, 
                         name: expName, 
                         visitors: [{ id: marker.user_id, username: marker.profiles?.username, avatar: marker.profiles?.avatar_url }],
                         isExperience: true
                       });
                     }
                   }}
                 >
                   <Tooltip direction="top" offset={[0, -16]} className="summit-tooltip tooltip-done">
                     {marker.profiles?.username} - {expName}
                   </Tooltip>
                 </Marker>
               );
            })}
            
            <MapSearchControl
              items={searchItems}
              onSelect={handleSearchSelect}
              placeholder={isPeaks ? "Buscar pico o provincia..." : "Buscar país..."}
            />
            
            {!isPeaks && (
              <ExperiencesToggleControl showExperiences={showExperiences} setShowExperiences={setShowExperiences} experienceMarkersCount={experienceMarkers.length} />
            )}
          </MapContainer>
        )}

        {/* Legend */}
        <div className="collective-map-legend">
          <span>
            <i className="collective-legend-dot collective-legend-dot--3plus" /> 3+ {isPeaks ? "escaladores" : "visitantes"}
          </span>
          <span>
            <i className="collective-legend-dot collective-legend-dot--2" /> 2 {isPeaks ? "escaladores" : "visitantes"}
          </span>
          <span>
            <i className="collective-legend-dot collective-legend-dot--1" /> 1 {isPeaks ? "escalador" : "visitante"}
          </span>
          <span>
            <i className="collective-legend-dot collective-legend-dot--none" /> {isPeaks ? "Sin ascender" : "Sin visitar"}
          </span>
        </div>

        {/* Visitor popup panel */}
        {selectedSummit && (
          <div className="collective-visitors-panel">
            <div className="collective-visitors-header">
              <h3>{selectedSummit.name}</h3>
              <button onClick={() => setSelectedSummit(null)} className="collective-visitors-close" aria-label="Cerrar panel">
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            {selectedSummit.visitors.length > 0 ? (
              <>
                <p className="collective-visitors-count">
                  {selectedSummit.visitors.length} {selectedSummit.visitors.length === 1 ? 'persona ha' : 'personas han'} {(selectedSummit as any).isExperience ? 'vivido esta experiencia' : isPeaks ? 'ascendido esta cumbre' : 'visitado este lugar'}
                </p>
                <ul className="collective-visitors-list">
                  {selectedSummit.visitors.map((v) => {
                    const isExp = Boolean((selectedSummit as any)?.isExperience);
                    const recordChallenge = isExp ? "experiences" : isPeaks ? "peaks" : "countries";
                    const recordId = selectedSummit.id;
                    const profileBaseUrl = v.username
                      ? `/perfil/${v.username}?challenge=${recordChallenge}&from=ranking`
                      : "";
                    const recordUrlWithHash =
                      v.username && recordId
                        ? `${profileBaseUrl}#panel=${encodeURIComponent(recordId)}`
                        : profileBaseUrl;

                    const handleVisitorClick = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      if (!v.username || !recordId) return;
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) {
                        return;
                      }
                      e.preventDefault();
                      try {
                        sessionStorage.setItem("auto_open_panel", recordId);
                      } catch (err) {
                        console.warn("Could not set sessionStorage:", err);
                      }
                      router.push(profileBaseUrl);
                    };

                    return (
                      <li key={v.id}>
                        <Link
                          href={recordUrlWithHash}
                          className="collective-visitor-link"
                          onClick={handleVisitorClick}
                          title={v.username ? `Ver registro de @${v.username}` : undefined}
                        >
                          <div className="collective-visitor-avatar">
                            {v.avatar ? (
                              <img src={v.avatar} alt={v.username} />
                            ) : (
                              v.username.charAt(0).toUpperCase()
                            )}
                          </div>
                          <span>@{v.username}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className="collective-visitors-empty">
                {scope === "following"
                  ? (isPeaks ? "Ninguna persona a la que sigues ha ascendido esta cumbre todavía." : "Ninguna persona a la que sigues ha visitado este lugar todavía.")
                  : (isPeaks ? "Nadie ha ascendido esta cumbre todavía." : "Nadie ha visitado este lugar todavía.")}
              </p>
            )}
          </div>
        )}
      </div>

      {authOpen && <AuthDialog onClose={() => setAuthOpen(null)} initialTab={authOpen} />}
    </div>
  );
}
