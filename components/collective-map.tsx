"use client";

import "./maps/collective-map.css";
import L, { Path } from "leaflet";
import { MapContainer, TileLayer, GeoJSON, Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { countries, resolveCountryFromFeature } from "@/data/countries";
import { peakByCode } from "@/data/peaks";
import { predefinedCategories } from "@/data/experiences";
import { isMobileOrTablet } from "@/lib/device-utils";
import {
  createAdaptiveCanvasRenderer,
  getAdaptiveInertiaOptions,
  getAdaptiveKeepBuffer,
} from "@/lib/leaflet-canvas-patch";
import {
  fetchSpainGeo,
  fetchWorldGeo,
  getCachedSpainGeo,
  getCachedWorldGeo,
  getLargestPolygonBounds,
} from "@/lib/geo-loader";
import { FitSpain, FitWorld } from "@/lib/leaflet-bounds";
import { getCollectivePeakMarkerIcon, getExperienceIcon } from "@/lib/leaflet-icons";
import { createTileRetryHandlers, MapZoomListener, safeCloseTooltip } from "./maps/map-lifecycle";
import { CollectiveVisitorsPanel, type SelectedCollectiveSummit } from "./maps/collective-visitors-panel";
import { ExperiencesToggleControl } from "./maps/experiences-toggle-control";
import { useAuth } from "./auth-context";
import { AuthDialog } from "@/components/auth-dialog";
import { UserRoundCheck } from "lucide-react";
import { MapSearchControl, type SearchItem } from "./map-search";
import { SweepOverlay } from "./sweep-overlay";
import type { FeatureCollection } from "geojson";

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

function CollectiveMarkers({
  isPeaks,
  showExperiences,
  collectiveData,
  experienceMarkers,
  uniquePeaks,
  onSelectSummit,
}: {
  isPeaks: boolean;
  showExperiences: boolean;
  collectiveData: Map<string, CollectiveSummitData>;
  experienceMarkers: any[];
  uniquePeaks: { id: string; name: string; provinces: string[]; coordinates: [number, number]; altitude: number }[];
  onSelectSummit: (summit: SelectedCollectiveSummit) => void;
}) {
  const map = useMap();
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(() => {
    try {
      return map.getBounds();
    } catch {
      return null;
    }
  });

  const syncBounds = useCallback(() => {
    try {
      setBounds(map.getBounds());
    } catch {
      /* ignore */
    }
  }, [map]);

  useMapEvents({
    zoomend: syncBounds,
    moveend: syncBounds,
  });

  const visiblePeaks = useMemo(() => {
    if (!isPeaks) return [];
    if (!bounds) return uniquePeaks;
    const padded = bounds.pad(0.25);
    return uniquePeaks.filter((p) => padded.contains(p.coordinates));
  }, [isPeaks, uniquePeaks, bounds]);

  const visibleExperiences = useMemo(() => {
    if (isPeaks || !showExperiences) return [];
    if (!bounds) return experienceMarkers;
    const padded = bounds.pad(0.25);
    return experienceMarkers.filter(
      (m) => typeof m.lat === "number" && typeof m.lng === "number" && padded.contains([m.lat, m.lng])
    );
  }, [isPeaks, showExperiences, experienceMarkers, bounds]);

  return (
    <>
      {visiblePeaks.map((peak) => {
        const data = collectiveData.get(peak.id);
        const count = data ? data.visitor_usernames.length : 0;
        const provText = peak.provinces.join(" / ");
        return (
          <Marker
            key={peak.id}
            position={peak.coordinates}
            icon={getCollectivePeakMarkerIcon(count)}
            zIndexOffset={count > 0 ? 500 : 100}
            eventHandlers={{
              click: () => {
                const name = `${provText}: ${peak.name}`;
                if (data && data.visitor_usernames.length > 0) {
                  const visitors = data.visitor_usernames.map((username, i) => ({
                    id: data.visitor_ids[i],
                    username,
                    avatar: data.visitor_avatars[i],
                  }));
                  onSelectSummit({ id: peak.id, name, visitors });
                } else {
                  onSelectSummit({ id: peak.id, name, visitors: [] });
                }
              },
            }}
          />
        );
      })}

      {visibleExperiences.map((marker) => {
        const cat = predefinedCategories.find((c) => c.experiences.some((e) => e.id === marker.experience_id));
        const iconName = cat?.iconName || "star";
        const exp = cat?.experiences.find((e) => e.id === marker.experience_id);
        const subItem = exp?.subItems?.find((s) => s.id === marker.sub_item_id);
        const expName = subItem?.name || exp?.name || marker.location_name || "Experiencia";

        return (
          <Marker
            key={marker.id}
            position={[marker.lat, marker.lng]}
            icon={getExperienceIcon(iconName)}
            zIndexOffset={1000}
            eventHandlers={{
              click: () => {
                const expRecordId = marker.experience_id
                  ? marker.sub_item_id
                    ? `${marker.experience_id}::${marker.sub_item_id}`
                    : marker.experience_id
                  : marker.id;
                onSelectSummit({
                  id: expRecordId,
                  name: expName,
                  visitors: [
                    {
                      id: marker.user_id,
                      username: marker.profiles?.username,
                      avatar: marker.profiles?.avatar_url,
                    },
                  ],
                  isExperience: true,
                });
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -16]} className="summit-tooltip tooltip-done">
              {marker.profiles?.username} - {expName}
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}

export function CollectiveMap({ onClose, scope: propScope, onScopeChange, mode = "countries" }: Props) {
  const canvasRenderer = useMemo(() => createAdaptiveCanvasRenderer("collective"), []);
  const keepBuffer = useMemo(() => getAdaptiveKeepBuffer(), []);
  const inertiaOptions = useMemo(() => getAdaptiveInertiaOptions(), []);
  const tileEventHandlers = useMemo(() => createTileRetryHandlers(), []);
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
  const [worldGeo, setWorldGeo] = useState<FeatureCollection | null>(() => getCachedWorldGeo());
  const [spainGeo, setSpainGeo] = useState<FeatureCollection | null>(() => getCachedSpainGeo());
  const [collectiveData, setCollectiveData] = useState<Map<string, CollectiveSummitData>>(new Map());
  const [loading, setLoading] = useState(true);

  const [selectedSummit, setSelectedSummit] = useState<SelectedCollectiveSummit | null>(null);
  const [searchedId, setSearchedId] = useState<string | null>(null);
  const [showExperiences, setShowExperiences] = useState(false);
  const [experienceMarkers, setExperienceMarkers] = useState<any[]>([]);

  const layerRefs = useRef(new Map<string, L.Path>());
  const searchTimeoutRef = useRef<NodeJS.Timeout>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentHoveredIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isPeaks) {
      if (!spainGeo) {
        fetchSpainGeo().then(setSpainGeo).catch(() => setSpainGeo(null));
      }
    } else if (!worldGeo) {
      fetchWorldGeo().then(setWorldGeo).catch(() => setWorldGeo(null));
    }
  }, [isPeaks, spainGeo, worldGeo]);

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

      const { data, error } = await supabase.rpc("get_collective_summits", {
        p_mode: isPeaks ? "peaks" : "countries",
        p_following_only: scope === "following",
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
            .from("connections")
            .select("following_id")
            .eq("follower_id", session.user.id)
            .eq("status", "accepted");
          if (following && following.length > 0) {
            allowedUserIds = following.map((f) => f.following_id);
            allowedUserIds.push(session.user.id);
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
        .from("experience_records")
        .select("id, lat, lng, location_name, user_id, experience_id, sub_item_id, is_wishlist")
        .not("lat", "is", null)
        .not("lng", "is", null)
        .or("is_wishlist.is.null,is_wishlist.eq.false");

      if (allowedUserIds && allowedUserIds.length > 0) {
        query = query.in("user_id", allowedUserIds);
      }

      const { data, error } = await query;
      if (error) {
        console.error("Error fetching experiences:", error);
        return;
      }

      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((d) => d.user_id))];
        let profilesQuery = supabase
          .from("profiles")
          .select("id, username, avatar_url, is_public, is_test")
          .in("id", userIds);

        if (scope === "all") {
          if (session?.user?.id) {
            profilesQuery = profilesQuery.or(`is_public.eq.true,id.eq.${session.user.id}`);
          } else {
            profilesQuery = profilesQuery.eq("is_public", true);
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
          .filter((d) => profilesMap.has(d.user_id))
          .map((d) => ({ ...d, profiles: profilesMap.get(d.user_id) }));
        setExperienceMarkers(markers);
      } else {
        setExperienceMarkers([]);
      }
    }
    fetchExperiences();
  }, [scope, showExperiences, session?.user?.id, isPeaks]);

  const getVisitorCount = useCallback(
    (summitId: string) => {
      const data = collectiveData.get(summitId);
      return data ? data.visitor_usernames.length : 0;
    },
    [collectiveData]
  );

  const getStyle = useCallback(
    (summitId: string) => {
      const count = getVisitorCount(summitId);
      let color, weight, fillColor, fillOpacity;

      if (count === 0) {
        if (isPeaks) {
          color = "#6f9488";
          weight = 1.25;
          fillColor = "#ebf2ee";
          fillOpacity = 0.55;
        } else {
          color = "#c4bfb6";
          weight = 0.8;
          fillColor = "#e8e4df";
          fillOpacity = 0.4;
        }
      } else if (count === 1) {
        color = "#8c3a25";
        weight = 1.5;
        fillColor = "#c75a3a";
        fillOpacity = 0.75;
      } else if (count === 2) {
        if (isPeaks) {
          color = "#3d735f";
          weight = 1.35;
          fillColor = "#bcd4c8";
          fillOpacity = 0.75;
        } else {
          color = "#9583ad";
          weight = 1.15;
          fillColor = "#c5b3da";
          fillOpacity = 0.65;
        }
      } else {
        if (isPeaks) {
          color = "#18342d";
          weight = 1.6;
          fillColor = "#5c9b7d";
          fillOpacity = 0.85;
        } else {
          color = "#4a2878";
          weight = 1.5;
          fillColor = "#7b52ab";
          fillOpacity = 0.8;
        }
      }

      return { color, weight, fillColor, fillOpacity };
    },
    [getVisitorCount, isPeaks]
  );

  const clearHoverState = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (currentHoveredIdRef.current) {
      const prevId = currentHoveredIdRef.current;
      currentHoveredIdRef.current = null;
      const prevLayer = layerRefs.current.get(prevId);
      if (prevLayer) {
        const style = getStyle(prevId);
        prevLayer.setStyle({ weight: style.weight, fillOpacity: style.fillOpacity });
        safeCloseTooltip(prevLayer);
      }
    }
  }, [getStyle]);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
    };
  }, []);

  const geoStyle = useCallback(
    (f: any) => {
      if (isPeaks) {
        const peak = peakByCode[String(f?.properties?.Codigo ?? "")];
        if (!peak) {
          return { color: "#6f9488", weight: 1.25, fillColor: "#ebf2ee", fillOpacity: 0.55 };
        }
        return getStyle(peak.id);
      }
      const country = resolveCountryFromFeature(f as any);
      const summitId = country ? country.id : "";
      if (!summitId) {
        return { color: "#c4bfb6", weight: 0.8, fillColor: "#e8e4df", fillOpacity: 0.4 };
      }
      return getStyle(summitId);
    },
    [isPeaks, getStyle]
  );

  useEffect(() => {
    layerRefs.current.forEach((layer) => {
      const feature = (layer as any).feature;
      if (feature) {
        layer.setStyle(geoStyle(feature));
      }
    });
  }, [geoStyle]);

  const attachInteractiveHandlers = useCallback(
    (pathLayer: Path, layerKey: string, summitId: string, name: string, tooltipText: string, count: number) => {
      layerRefs.current.set(layerKey, pathLayer);
      const statusClass = count >= 3 ? "tooltip-done" : count > 0 ? "tooltip-wishlist" : "tooltip-todo";

      pathLayer.bindTooltip(tooltipText, {
        sticky: true,
        className: `summit-tooltip ${statusClass}`,
      });
      pathLayer.off("mouseover", (pathLayer as any)._openTooltip);

      pathLayer.on("click", () => {
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

      pathLayer.on("mouseover", (e: L.LeafletMouseEvent) => {
        if (searchedId === layerKey) return;
        const map = (pathLayer as any)._map;
        if (!map || map._isWheeling || map._animatingZoom || (map.dragging && map.dragging.moving())) return;

        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = null;
        }

        if (currentHoveredIdRef.current && currentHoveredIdRef.current !== layerKey) {
          const prevKey = currentHoveredIdRef.current;
          currentHoveredIdRef.current = null;
          const prevLayer = layerRefs.current.get(prevKey);
          if (prevLayer) {
            const prevPeak = isPeaks ? peakByCode[prevKey] : null;
            const prevSummitId = prevPeak ? prevPeak.id : prevKey;
            const s = getStyle(prevSummitId);
            prevLayer.setStyle({ weight: s.weight, fillOpacity: s.fillOpacity });
            safeCloseTooltip(prevLayer);
          }
        }

        const latlng = e.latlng;
        hoverTimeoutRef.current = setTimeout(() => {
          hoverTimeoutRef.current = null;
          const currentMap = (pathLayer as any)._map;
          if (!currentMap || currentMap._isWheeling || currentMap._animatingZoom || (currentMap.dragging && currentMap.dragging.moving())) {
            return;
          }

          currentHoveredIdRef.current = layerKey;
          const style = getStyle(summitId);
          pathLayer.setStyle({ weight: 2.5, fillOpacity: Math.min(style.fillOpacity + 0.15, 1) });
          if (latlng && typeof pathLayer.openTooltip === "function") {
            pathLayer.openTooltip(latlng);
          }
        }, 80);
      });

      pathLayer.on("mouseout", () => {
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = null;
        }
        if (searchedId === layerKey) return;
        if (layerKey === currentHoveredIdRef.current) {
          currentHoveredIdRef.current = null;
          const style = getStyle(summitId);
          pathLayer.setStyle({ weight: style.weight, fillOpacity: style.fillOpacity });
          safeCloseTooltip(pathLayer);
        }
      });
    },
    [collectiveData, getStyle, isPeaks, searchedId]
  );

  const onEachFeature = useCallback(
    (f: any, layer: L.Layer) => {
      if (isPeaks) {
        const peak = peakByCode[String(f?.properties?.Codigo ?? "")];
        if (!peak) return;
        const count = getVisitorCount(peak.id);
        const name = `${peak.province}: ${peak.name}`;
        const tooltipText =
          count > 0 ? `${name} — ${count} ${count === 1 ? "escalador" : "escaladores"}` : name;
        attachInteractiveHandlers(layer as Path, peak.code, peak.id, name, tooltipText, count);
      } else {
        const country = resolveCountryFromFeature(f as any);
        if (!country) return;
        const count = getVisitorCount(country.id);
        const tooltipText =
          count > 0 ? `${country.name} — ${count} ${count === 1 ? "visitante" : "visitantes"}` : country.name;
        attachInteractiveHandlers(layer as Path, country.id, country.id, country.name, tooltipText, count);
      }
    },
    [isPeaks, getVisitorCount, attachInteractiveHandlers]
  );

  const searchItems = useMemo<SearchItem[]>(() => {
    if (isPeaks) {
      return peakEntries.map((peak) => {
        let bounds: any;
        if (spainGeo) {
          const relatedCodes = peakEntries.filter((p) => p.id === peak.id).map((p) => p.code);
          const relatedFeatures = spainGeo.features.filter((f) =>
            relatedCodes.includes(String(f.properties?.Codigo ?? ""))
          );
          if (relatedFeatures.length > 0) {
            bounds = L.geoJSON(relatedFeatures as any).getBounds();
          }
        }
        const count = getVisitorCount(peak.id);
        return {
          id: peak.code,
          name: peak.name,
          nameLocal: peak.province,
          status: count >= 3 ? "done" : count > 0 ? "wishlist" : "none",
          type: "peak",
          coordinates: peak.coordinates,
          bounds,
        };
      });
    }

    return countries.map((c) => {
      const count = getVisitorCount(c.id);
      const feature = worldGeo?.features.find((f: any) => resolveCountryFromFeature(f)?.id === c.id);
      return {
        id: c.id,
        name: c.name,
        status: count >= 3 ? "done" : count > 0 ? "wishlist" : "none",
        type: "country",
        coordinates: c.coordinates,
        bounds: feature ? getLargestPolygonBounds(feature) : undefined,
      };
    });
  }, [isPeaks, getVisitorCount, spainGeo, worldGeo]);

  const handleSearchSelect = useCallback(
    (item: SearchItem) => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      setSearchedId(item.id);
      layerRefs.current.get(item.id)?.bringToFront();

      if (isPeaks) {
        const peak = peakByCode[item.id] || peakEntries.find((p) => p.id === item.id);
        const summitId = peak ? peak.id : item.id;
        const data = collectiveData.get(summitId);
        const name = peak ? `${peak.province}: ${peak.name}` : item.name;
        const visitors =
          data && data.visitor_usernames.length > 0
            ? data.visitor_usernames.map((username, i) => ({
                id: data.visitor_ids[i],
                username,
                avatar: data.visitor_avatars[i],
              }))
            : [];
        setSelectedSummit({ id: summitId, name, visitors });
      } else {
        const data = collectiveData.get(item.id);
        const visitors =
          data && data.visitor_usernames.length > 0
            ? data.visitor_usernames.map((username, i) => ({
                id: data.visitor_ids[i],
                username,
                avatar: data.visitor_avatars[i],
              }))
            : [];
        setSelectedSummit({ id: item.id, name: item.name, visitors });
      }

      searchTimeoutRef.current = setTimeout(() => {
        setSearchedId(null);
      }, 1800);
    },
    [isPeaks, collectiveData]
  );

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const uniquePeaks = useMemo(() => {
    if (!isPeaks) return [];
    const map = new Map<
      string,
      { id: string; name: string; provinces: string[]; coordinates: [number, number]; altitude: number }
    >();
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
      ? `${totalVisited} ${totalVisited === 1 ? "pico" : "picos"} · ${allVisitors} ${
          allVisitors === 1 ? "escalador" : "escaladores"
        }`
      : `${totalVisited} ${totalVisited === 1 ? "país" : "países"} · ${allVisitors} ${
          allVisitors === 1 ? "viajero" : "viajeros"
        }`;

  return (
    <div className={`collective-map-overlay ${isPeaks ? "mode-peaks" : "mode-countries"}`}>
      <div className="collective-map-header">
        <div className="collective-map-header-left">
          <h2>Mapa Colectivo</h2>
          <span className="collective-map-stats">{statsText}</span>
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
            center={isPeaks ? [40.4168, -3.7038] : [20, 0]}
            zoom={isPeaks ? 5 : 2}
            renderer={canvasRenderer}
            preferCanvas={true}
            scrollWheelZoom={true}
            zoomSnap={1}
            zoomDelta={1}
            wheelPxPerZoomLevel={60}
            wheelDebounceTime={25}
            inertia={inertiaOptions.inertia}
            inertiaDeceleration={inertiaOptions.inertiaDeceleration}
            inertiaMaxSpeed={inertiaOptions.inertiaMaxSpeed}
            easeLinearity={inertiaOptions.easeLinearity}
            minZoom={isPeaks ? 5 : 2}
            maxZoom={isPeaks ? 10 : 12}
            maxBounds={isPeaks ? [[26.0, -19.8], [47.5, 11.0]] : [[-60, -180], [83, 180]]}
            maxBoundsViscosity={isPeaks ? 0.5 : 1.0}
          >
            <MapZoomListener onInteractionStart={clearHoverState} />
            <SweepOverlay searchedId={searchedId} layerRefs={layerRefs} />
            {isPeaks ? <FitSpain persistSessionState={false} /> : <FitWorld persistSessionState={false} />}
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              crossOrigin="anonymous"
              minZoom={isPeaks ? 5 : 2}
              maxZoom={isPeaks ? 10 : 12}
              keepBuffer={keepBuffer}
              updateWhenIdle={false}
              updateInterval={50}
              maxNativeZoom={19}
              updateWhenZooming={isMobileOrTablet() ? undefined : false}
              eventHandlers={tileEventHandlers}
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

            <CollectiveMarkers
              isPeaks={isPeaks}
              showExperiences={showExperiences}
              collectiveData={collectiveData}
              experienceMarkers={experienceMarkers}
              uniquePeaks={uniquePeaks}
              onSelectSummit={setSelectedSummit}
            />

            <MapSearchControl
              items={searchItems}
              onSelect={handleSearchSelect}
              placeholder={isPeaks ? "Buscar pico o provincia..." : "Buscar país..."}
            />

            {!isPeaks && (
              <ExperiencesToggleControl
                showExperiences={showExperiences}
                setShowExperiences={setShowExperiences}
              />
            )}
          </MapContainer>
        )}

        <div className="collective-map-legend">
          <span>
            <i className="collective-legend-dot collective-legend-dot--3plus" /> 3+{" "}
            {isPeaks ? "escaladores" : "visitantes"}
          </span>
          <span>
            <i className="collective-legend-dot collective-legend-dot--2" /> 2{" "}
            {isPeaks ? "escaladores" : "visitantes"}
          </span>
          <span>
            <i className="collective-legend-dot collective-legend-dot--1" /> 1{" "}
            {isPeaks ? "escalador" : "visitante"}
          </span>
          <span>
            <i className="collective-legend-dot collective-legend-dot--none" />{" "}
            {isPeaks ? "Sin ascender" : "Sin visitar"}
          </span>
        </div>

        {selectedSummit && (
          <CollectiveVisitorsPanel
            selectedSummit={selectedSummit}
            isPeaks={isPeaks}
            scope={scope}
            onClose={() => setSelectedSummit(null)}
          />
        )}
      </div>

      {authOpen && <AuthDialog onClose={() => setAuthOpen(null)} initialTab={authOpen} />}
    </div>
  );
}
