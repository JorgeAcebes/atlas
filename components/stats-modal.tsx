"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import type { Session } from "@supabase/supabase-js";
import { peaks, type Peak } from "@/data/peaks";
import { countries, type Country } from "@/data/countries";
import { predefinedCategories } from "@/data/experiences";
import { supabase } from "@/lib/supabase";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";
import { PhotoLightbox } from "./photo-lightbox";
import {
  X,
  Mountain,
  Globe2,
  Trophy,
  Camera,
  Check,
  TrendingUp,
  Flame,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ChartNoAxesColumn,
} from "lucide-react";
import "./stats-modal.css";

type StatsMode = "peaks" | "countries";

type Props = {
  session?: Session | null;
  myProfile?: {
    username?: string;
    avatar_url?: string | null;
    enable_peaks?: boolean;
    enable_countries?: boolean;
    enable_experiences?: boolean;
  } | null;
  ascents?: any[];
  experienceRecords?: any[];
  photos?: any[];
  photosCount?: number;
  initialMode?: "peaks" | "countries";
  onClose: () => void;
  onGoToRecord?: (summitId: string) => void;
};

// 5 Cumbres Compartidas Oficiales de España
const SHARED_PEAKS = [
  { name: "Gorbea", provinces: "Álava / Vizcaya", altitude: 1482 },
  { name: "Torre Cerredo", provinces: "León / Asturias", altitude: 2652 },
  { name: "Peñalara", provinces: "Madrid / Segovia", altitude: 2428 },
  { name: "Peña Trevinca", provinces: "Orense / Zamora", altitude: 2127 },
  { name: "Moncayo", provinces: "Soria / Zaragoza", altitude: 2314 },
];

// Macizos / Cordilleras principales con todos sus picos provinciales
const MOUNTAIN_RANGES = [
  {
    id: "pirineos",
    name: "Pirineos",
    peakIds: ["huesca", "lleida", "girona", "navarra"],
  },
  {
    id: "cantabrica",
    name: "Cordillera Cantábrica & Macizo Galaico",
    peakIds: ["cerredo", "cantabria", "palencia", "trevinca", "burgos", "lugo", "gorbea", "gipuzkoa", "pontevedra", "coruna"],
  },
  {
    id: "central",
    name: "Sistema Central & Montes de Toledo",
    peakIds: ["avila", "penalara", "salamanca", "caceres", "guadalajara", "toledo", "ciudad-real"],
  },
  {
    id: "betica",
    name: "Cordilleras Béticas & Sierra Morena",
    peakIds: ["granada", "almeria", "jaen", "malaga", "albacete", "murcia", "cadiz", "cordoba", "alicante", "valencia", "sevilla", "huelva", "badajoz"],
  },
  {
    id: "iberico",
    name: "Sistema Ibérico & Costero-Catalana",
    peakIds: ["moncayo", "rioja", "teruel", "cuenca", "castellon", "barcelona", "tarragona", "valladolid"],
  },
  {
    id: "islas",
    name: "Islas & Ciudades Autónomas",
    peakIds: ["santa-cruz-tenerife", "las-palmas", "illes-balears", "ceuta", "melilla"],
  },
];

// Paleta cromática oficial de los 5 anillos de los Juegos Olímpicos (JJOO):
// Europa: Azul | Asia: Amarillo | África: Negro | Oceanía: Verde | América: Rojo
const CONTINENT_COLOR_MAP: Record<string, { bg: string; text: string; dot: string }> = {
  "Europa": { bg: "rgba(0, 129, 200, 0.12)", text: "#006bb3", dot: "#0081C8" },
  "Asia": { bg: "rgba(252, 177, 34, 0.16)", text: "#9a6a00", dot: "#FCB132" },
  "África": { bg: "rgba(17, 24, 39, 0.08)", text: "#111827", dot: "#111827" },
  "Oceanía": { bg: "rgba(0, 166, 81, 0.12)", text: "#008a43", dot: "#00A651" },
  "América": { bg: "rgba(238, 51, 78, 0.12)", text: "#c91d37", dot: "#EE334E" },
};

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Helpers de resolución de lugares y países importados desde lib/stats-utils
import { getLocationInfo, getCountryForAscent, getPeakForAscent } from "@/lib/stats-utils";
export { getLocationInfo, getCountryForAscent, getPeakForAscent };

export function StatsModal({
  session,
  myProfile,
  ascents: propAscents,
  experienceRecords: propExperiences,
  photos: propPhotos,
  photosCount: propPhotosCount,
  initialMode = "countries",
  onClose,
  onGoToRecord,
}: Props) {
  const [activeMode, setActiveMode] = useState<StatsMode>(() =>
    initialMode === "peaks" ? "peaks" : "countries"
  );
  const [ascents, setAscents] = useState<any[]>(() => {
    if (propAscents && propAscents.length > 0) return propAscents;
    if (typeof window !== "undefined" && session?.user?.id) {
      try {
        const stored = localStorage.getItem(`app_tracker_ascents_${session.user.id}`);
        if (stored) return JSON.parse(stored);
      } catch {
        /* ignore */
      }
    }
    return [];
  });
  const [photos, setPhotos] = useState<any[]>(() => {
    if (propPhotos && propPhotos.length > 0) return propPhotos;
    if (typeof window !== "undefined" && session?.user?.id) {
      try {
        const stored = localStorage.getItem(`app_tracker_photos_${session.user.id}`);
        if (stored) return JSON.parse(stored);
      } catch {
        /* ignore */
      }
    }
    return [];
  });

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [expandedRanges, setExpandedRanges] = useState<Record<string, boolean>>({});
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);

  // Referencias para detección de deslizamiento horizontal (swipe)
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;

    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      if (dx < 0 && activeMode === "peaks") {
        setActiveMode("countries");
      } else if (dx > 0 && activeMode === "countries") {
        setActiveMode("peaks");
      }
    }
  }

  function toggleRange(id: string) {
    setExpandedRanges((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  function handleGoToRecord(summitId?: string) {
    if (!summitId) return;
    setLightboxIndex(null);
    setGalleryOpen(false);

    if (onGoToRecord) {
      onGoToRecord(summitId);
      return;
    }

    const loc = getLocationInfo(summitId);
    const cleanId = summitId.split("::")[0];
    const isPeak =
      loc.type === "peak" ||
      peaks.some(
        (p) =>
          p.id === cleanId ||
          p.name.toLowerCase() === cleanId.toLowerCase()
      );
    const targetPath = isPeak
      ? `/picos#panel=${encodeURIComponent(cleanId)}`
      : `/#panel=${encodeURIComponent(cleanId)}`;

    onClose();

    if (typeof window !== "undefined") {
      if (
        window.location.pathname === "/picos" ||
        window.location.pathname === "/" ||
        window.location.pathname === "/paises"
      ) {
        window.history.replaceState({ hasPanel: true }, "", `#panel=${encodeURIComponent(cleanId)}`);
        window.dispatchEvent(new Event("hashchange"));
      } else {
        window.location.href = targetPath;
      }
    }
  }

  // Lock scroll
  useEffect(() => {
    lockScroll();
    return () => {
      unlockScroll();
    };
  }, []);

  // Fetch ascents and photos if needed
  useEffect(() => {
    if (propAscents && propAscents.length > 0) {
      setAscents(propAscents);
    }
    if (propPhotos && propPhotos.length > 0) {
      setPhotos(propPhotos);
    } else if (session?.user?.id && photos.length === 0 && supabase) {
      supabase
        .from("photos")
        .select("*")
        .eq("user_id", session.user.id)
        .order("taken_on", { ascending: false })
        .then(({ data }) => {
          if (data && data.length > 0) setPhotos(data);
        });
    }
  }, [propAscents, propPhotos, session]);

  // Fetch full ascents with achieved_on if missing or empty
  useEffect(() => {
    if (!session?.user?.id || !supabase) return;
    const isMissingDates =
      ascents.length > 0 &&
      ascents.some((a) => !a.is_wishlist && a.achieved_on === undefined);
    const isEmpty = ascents.length === 0;

    if (isMissingDates || isEmpty) {
      supabase
        .from("ascents")
        .select("*")
        .eq("user_id", session.user.id)
        .then(({ data }) => {
          if (data && data.length > 0) {
            setAscents(data);
            try {
              localStorage.setItem(`app_tracker_ascents_${session.user.id}`, JSON.stringify(data));
            } catch {}
          }
        });
    }
  }, [session, ascents]);

  // ── Compute Analytics & Metrics ─────────────
  const metrics = useMemo(() => {
    const validDoneAscents = ascents.filter((a) => !a.is_wishlist);
    const completedPeakIds = new Set<string>();
    const completedUniquePeakNames = new Set<string>();
    let totalAltitudeAscended = 0;

    peaks.forEach((peak) => {
      const isDone = validDoneAscents.some(
        (a) =>
          a.summit_id === peak.id ||
          a.peak_id === peak.id ||
          (a.country_id === peak.id && !a.is_wishlist)
      );
      if (isDone) {
        completedPeakIds.add(peak.id);
        if (!completedUniquePeakNames.has(peak.name)) {
          completedUniquePeakNames.add(peak.name);
          totalAltitudeAscended += peak.altitude;
        }
      }
    });

    const completedPeaks = peaks.filter((p) => completedUniquePeakNames.has(p.name));
    const highestPeak: Peak | null =
      completedPeaks.length > 0
        ? [...completedPeaks].sort((a, b) => b.altitude - a.altitude)[0]
        : null;

    const completedPeaksCount = completedUniquePeakNames.size;
    const peaksPct = Math.round((completedPeaksCount / 47) * 100);

    // 4 Tresmiles
    const threeThousanders = [
      { id: "santa-cruz-tenerife", name: "Teide", altitude: 3718, province: "Santa Cruz de Tenerife", completed: completedPeakIds.has("santa-cruz-tenerife") || completedPeakIds.has("teide") },
      { id: "granada", name: "Mulhacén", altitude: 3479, province: "Granada", completed: completedPeakIds.has("granada") },
      { id: "huesca", name: "Aneto", altitude: 3404, province: "Huesca", completed: completedPeakIds.has("huesca") },
      { id: "lleida", name: "Pica d'Estats", altitude: 3143, province: "Lleida", completed: completedPeakIds.has("lleida") },
    ];

    // Distribución por altitud
    const twoThousandersTotal = peaks.filter((p) => p.altitude >= 2000).length;
    const twoThousandersCount = peaks.filter((p) => p.altitude >= 2000 && completedPeakIds.has(p.id)).length;
    const midTotal = peaks.filter((p) => p.altitude >= 1000 && p.altitude < 2000).length;
    const midCount = peaks.filter((p) => p.altitude >= 1000 && p.altitude < 2000 && completedPeakIds.has(p.id)).length;
    const lowTotal = peaks.filter((p) => p.altitude < 1000).length;
    const lowCount = peaks.filter((p) => p.altitude < 1000 && completedPeakIds.has(p.id)).length;

    // Cumbres compartidas
    const sharedPeaksStatus = SHARED_PEAKS.map((sp) => {
      const match = peaks.find((p) => p.name === sp.name);
      const isDone = match ? completedPeakIds.has(match.id) : false;
      return { ...sp, completed: isDone };
    });
    const sharedPeaksCount = sharedPeaksStatus.filter((s) => s.completed).length;

    // Cordilleras con listado de picos
    const rangesStatus = MOUNTAIN_RANGES.map((r) => {
      const rangePeaks = r.peakIds
        .map((id) => peaks.find((p) => p.id === id))
        .filter((p): p is Peak => !!p);

      const uniqueRangePeaks: { id: string; name: string; province: string; altitude: number; completed: boolean }[] = [];
      const seenNames = new Set<string>();

      rangePeaks.forEach((p) => {
        if (!seenNames.has(p.name)) {
          seenNames.add(p.name);
          const isDone = completedUniquePeakNames.has(p.name) || completedPeakIds.has(p.id);
          const allMatching = peaks.filter((x) => x.name === p.name);
          const provinces = allMatching.map((x) => x.province).join(" / ");
          uniqueRangePeaks.push({
            id: p.id,
            name: p.name,
            province: provinces,
            altitude: p.altitude,
            completed: isDone,
          });
        }
      });

      const total = uniqueRangePeaks.length;
      const done = uniqueRangePeaks.filter((p) => p.completed).length;

      return {
        id: r.id,
        name: r.name,
        done,
        total,
        pct: total > 0 ? Math.round((done / total) * 100) : 0,
        peaksList: uniqueRangePeaks,
      };
    });

    // ── Countries Stats ──
    const completedCountriesSet = new Set<string>();
    const completedCountriesList: Country[] = [];

    countries.forEach((country) => {
      const isDone = validDoneAscents.some((a) => {
        const sid = a.summit_id ? String(a.summit_id).split("::")[0] : "";
        const lowerSid = sid.toLowerCase();
        if (
          a.peak_id ||
          peaks.some(
            (p) =>
              p.id === sid ||
              p.name.toLowerCase() === lowerSid ||
              p.province.toLowerCase() === lowerSid
          )
        ) {
          return false;
        }
        return (
          a.country_id === country.id ||
          a.country_code === country.id ||
          a.summit_id === country.id
        );
      });
      if (isDone) {
        completedCountriesSet.add(country.id);
        completedCountriesList.push(country);
      }
    });

    const completedCountriesCount = completedCountriesList.length;
    const countriesPct = Math.round((completedCountriesCount / 196) * 100);

    // Continents breakdown
    const continentList = ["Europa", "América", "Asia", "África", "Oceanía"];
    const continentsBreakdown = continentList.map((cont) => {
      const allInCont = countries.filter((c) => c.continent === cont);
      const doneInCont = completedCountriesList.filter((c) => c.continent === cont);
      return {
        continent: cont,
        done: doneInCont.length,
        total: allInCont.length,
        pct: allInCont.length > 0 ? Math.round((doneInCont.length / allInCont.length) * 100) : 0,
        countries: doneInCont.map((c) => c.name),
      };
    });

    return {
      completedPeaksCount,
      peaksPct,
      totalAltitudeAscended,
      highestPeak,
      threeThousanders,
      twoThousandersCount,
      twoThousandersTotal,
      midCount,
      midTotal,
      lowCount,
      lowTotal,
      sharedPeaksStatus,
      sharedPeaksCount,
      rangesStatus,
      completedCountriesCount,
      countriesPct,
      continentsBreakdown,
    };
  }, [ascents]);

  // Desglose visual por años y meses de países visitados (incluyendo múltiples visitas y visitas repetidas en el mismo mes con (n))
  const visitsTimeline = useMemo(() => {
    type CountryVisitGroup = { country: Country; summitId: string; count: number };
    type MonthEntry = { month: number; countries: CountryVisitGroup[] };
    type YearEntry = { year: number; months: MonthEntry[]; totalCount: number };

    // year -> month -> country.id -> CountryVisitGroup
    const yearMap: Record<number, Record<number, Record<string, CountryVisitGroup>>> = {};
    const undatedMap: Record<string, CountryVisitGroup> = {};

    ascents.forEach((a) => {
      if (a.is_wishlist) return;
      const country = getCountryForAscent(a);
      if (!country) return;

      const rawDate = a.achieved_on || a.created_at;
      if (rawDate && rawDate !== "1900-01-01") {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = d.getMonth();
          if (!yearMap[y]) yearMap[y] = {};
          if (!yearMap[y][m]) yearMap[y][m] = {};

          if (!yearMap[y][m][country.id]) {
            yearMap[y][m][country.id] = {
              country,
              summitId: a.summit_id || country.id,
              count: 1,
            };
          } else {
            yearMap[y][m][country.id].count += 1;
          }
          return;
        }
      }

      // Sin fecha específica válida
      if (!undatedMap[country.id]) {
        undatedMap[country.id] = {
          country,
          summitId: a.summit_id || country.id,
          count: 1,
        };
      } else {
        undatedMap[country.id].count += 1;
      }
    });

    const yearsList: YearEntry[] = Object.keys(yearMap)
      .map(Number)
      .sort((a, b) => b - a)
      .map((y) => {
        const months: MonthEntry[] = Object.keys(yearMap[y])
          .map(Number)
          .sort((a, b) => b - a)
          .map((m) => {
            const countriesList = Object.values(yearMap[y][m]).sort((a, b) =>
              a.country.name.localeCompare(b.country.name)
            );
            return { month: m, countries: countriesList };
          });

        const totalCount = months.reduce(
          (acc, curr) => acc + curr.countries.reduce((cAcc, cItem) => cAcc + cItem.count, 0),
          0
        );
        return { year: y, months, totalCount };
      });

    const undatedList = Object.values(undatedMap).sort((a, b) =>
      a.country.name.localeCompare(b.country.name)
    );
    const totalUndated = undatedList.reduce((acc, curr) => acc + curr.count, 0);
    const totalVisitsCount =
      yearsList.reduce((acc, curr) => acc + curr.totalCount, 0) + totalUndated;

    return {
      years: yearsList,
      undated: undatedList,
      totalUndated,
      totalVisitsCount,
    };
  }, [ascents]);

  // Desglose visual por años y meses de picos provinciales ascendidos (meses invertidos Dic -> Ene)
  const peaksTimeline = useMemo(() => {
    type PeakAscentGroup = { peak: Peak; summitId: string; count: number };
    type MonthEntry = { month: number; peaks: PeakAscentGroup[] };
    type YearEntry = { year: number; months: MonthEntry[]; totalCount: number };

    // year -> month -> peak.name -> PeakAscentGroup
    const yearMap: Record<number, Record<number, Record<string, PeakAscentGroup>>> = {};
    const undatedMap: Record<string, PeakAscentGroup> = {};

    ascents.forEach((a) => {
      if (a.is_wishlist) return;
      const peak = getPeakForAscent(a);
      if (!peak) return;

      const rawDate = a.achieved_on || a.created_at;
      if (rawDate && rawDate !== "1900-01-01") {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = d.getMonth();
          if (!yearMap[y]) yearMap[y] = {};
          if (!yearMap[y][m]) yearMap[y][m] = {};

          if (!yearMap[y][m][peak.name]) {
            yearMap[y][m][peak.name] = {
              peak,
              summitId: a.summit_id || peak.id,
              count: 1,
            };
          } else {
            yearMap[y][m][peak.name].count += 1;
          }
          return;
        }
      }

      // Sin fecha específica válida
      if (!undatedMap[peak.name]) {
        undatedMap[peak.name] = {
          peak,
          summitId: a.summit_id || peak.id,
          count: 1,
        };
      } else {
        undatedMap[peak.name].count += 1;
      }
    });

    const yearsList: YearEntry[] = Object.keys(yearMap)
      .map(Number)
      .sort((a, b) => b - a)
      .map((y) => {
        const months: MonthEntry[] = Object.keys(yearMap[y])
          .map(Number)
          .sort((a, b) => b - a) // Invertido: meses de más reciente a más antiguo (Dic -> Ene)
          .map((m) => {
            const peaksList = Object.values(yearMap[y][m]).sort((a, b) =>
              a.peak.name.localeCompare(b.peak.name)
            );
            return { month: m, peaks: peaksList };
          });

        const totalCount = months.reduce(
          (acc, curr) => acc + curr.peaks.reduce((pAcc, pItem) => pAcc + pItem.count, 0),
          0
        );
        return { year: y, months, totalCount };
      });

    const undatedList = Object.values(undatedMap).sort((a, b) =>
      a.peak.name.localeCompare(b.peak.name)
    );
    const totalUndated = undatedList.reduce((acc, curr) => acc + curr.count, 0);
    const totalAscentsCount =
      yearsList.reduce((acc, curr) => acc + curr.totalCount, 0) + totalUndated;

    return {
      years: yearsList,
      undated: undatedList,
      totalUndated,
      totalAscentsCount,
    };
  }, [ascents]);

  // Fotos filtradas exclusivamente por el modo activo (peaks vs countries)
  const modePhotos = useMemo(() => {
    return photos.filter((p) => {
      const loc = getLocationInfo(p.summit_id);
      if (activeMode === "peaks") {
        return loc.type === "peak";
      } else {
        return loc.type === "country";
      }
    });
  }, [photos, activeMode]);

  // Fotos ordenadas para Galería de Recuerdos
  const sortedPhotos = useMemo(() => {
    return [...modePhotos].sort((a, b) => {
      const timeA = new Date(a.taken_on || a.created_at || 0).getTime();
      const timeB = new Date(b.taken_on || b.created_at || 0).getTime();
      return sortOrder === "desc" ? timeB - timeA : timeA - timeB;
    });
  }, [modePhotos, sortOrder]);

  const currentPhotosCount = modePhotos.length;

  // Foto actualmente activa en el lightbox
  const activeLightboxPhoto = lightboxIndex !== null ? sortedPhotos[lightboxIndex] : null;
  const activeLocationInfo = activeLightboxPhoto ? getLocationInfo(activeLightboxPhoto.summit_id) : null;

  return (
    <div
      className={`stats-overlay ${activeMode === "peaks" ? "stats-overlay--peaks stats-mode--peaks mode-peaks" : "stats-overlay--countries stats-mode--countries mode-countries"}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="stats-title"
    >
      {/* ── Sticky Top Bar con Toggle Central y Logo de Stats ── */}
      <div className="stats-sticky-top">
        <header className="stats-header stats-header--centered">
          <div className="stats-header-brand" aria-label="Modo Estadísticas" title="Modo Estadísticas">
            <ChartNoAxesColumn size={20} className="stats-brand-icon" />
          </div>

          {/* Toggle Central: mismo toggle que el mapa */}
          <div
            className={`app-mode-switch ${activeMode === "peaks" ? "app-mode-switch--peaks" : "app-mode-switch--countries"}`}
            role="tablist"
          >
            <div className="app-mode-switch__indicator" />
            <button
              type="button"
              role="tab"
              aria-selected={activeMode === "peaks"}
              className={`app-mode-btn ${activeMode === "peaks" ? "active" : ""}`}
              onClick={() => setActiveMode("peaks")}
            >
              47 Picos
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeMode === "countries"}
              className={`app-mode-btn ${activeMode === "countries" ? "active" : ""}`}
              onClick={() => setActiveMode("countries")}
            >
              196 Países
            </button>
          </div>

          <button
            type="button"
            className="stats-close-btn"
            onClick={onClose}
            aria-label="Cerrar estadísticas"
          >
            <X size={18} />
          </button>
        </header>
      </div>

      {/* ── Content (con soporte de deslizamiento horizontal) ── */}
      <main
        className="stats-content"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* ══════════════════════════════════════
            1. MODO 47 PICOS
            ══════════════════════════════════════ */}
        {activeMode === "peaks" && (
          <>
            {/* Resumen Superior Picos */}
            <div className="stats-kpi-grid">
              <div className="stats-kpi-card">
                <div className="stats-kpi-header">
                  <span className="stats-kpi-label">Picos Provinciales</span>
                  <Mountain size={16} className="stats-kpi-icon" />
                </div>
                <div className="stats-kpi-value">
                  {metrics.completedPeaksCount} <small>/ 47</small>
                </div>
                <span className="stats-kpi-sub">
                  {metrics.peaksPct}% completado
                </span>
                <div className="stats-kpi-progress">
                  <div
                    className="stats-kpi-progress-bar"
                    style={{ width: `${metrics.peaksPct}%` }}
                  />
                </div>
              </div>

              {/* Altitud Acumulada */}
              <div className="stats-kpi-card">
                <div className="stats-kpi-header">
                  <span className="stats-kpi-label">Altitud Total</span>
                  <TrendingUp size={16} className="stats-kpi-icon" />
                </div>
                <div className="stats-kpi-value">
                  {metrics.totalAltitudeAscended.toLocaleString("es-ES")} <small>m</small>
                </div>
                <span className="stats-kpi-sub">
                  Desnivel acumulado
                </span>
              </div>
            </div>

            {/* Botón Ver Galería (solo el botón sin textos redundantes) */}
            <div className="stats-gallery-btn-wrap">
              <button
                type="button"
                className="stats-open-gallery-action-btn"
                onClick={() => setGalleryOpen(true)}
              >
                Ver galería
              </button>
            </div>

            {/* ── LÍNEA DEL TIEMPO DE PICOS (DESGLOSE POR AÑOS Y MESES CON COLORES CORPORATIVOS) ── */}
            <div className={`stats-section-card stats-travel-timeline-card ${timelineCollapsed ? "stats-travel-timeline-card--collapsed" : ""}`}>
              <div className="stats-card-title-row">
                <button
                  type="button"
                  className="stats-card-title-btn"
                  onClick={() => setTimelineCollapsed(!timelineCollapsed)}
                  aria-expanded={!timelineCollapsed}
                  aria-label={`${timelineCollapsed ? "Expandir" : "Contraer"} línea del tiempo`}
                >
                  <h3 className="stats-card-title">Línea del tiempo</h3>
                  {timelineCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                </button>
                <span className="stats-card-chip">
                  {peaksTimeline.totalAscentsCount} {peaksTimeline.totalAscentsCount === 1 ? "ascenso" : "ascensos"}
                </span>
              </div>

              {!timelineCollapsed && (
                <>
                  {peaksTimeline.years.length === 0 && peaksTimeline.undated.length === 0 ? (
                    <div className="stats-empty-notice">
                      Aún no has registrado ascensos a picos provinciales. Selecciona cualquier cima en el mapa para inaugurar tu cronología de montaña.
                    </div>
                  ) : (
                    <div className="stats-timeline-years">
                      {peaksTimeline.years.map((y) => (
                        <div key={y.year} className="stats-timeline-year-block">
                          <div className="stats-timeline-year-header">
                            <span className="stats-timeline-year-label">{y.year}</span>
                            <span className="stats-timeline-year-count">
                              <strong>{y.totalCount}</strong> {y.totalCount === 1 ? "ascenso" : "ascensos"}
                            </span>
                          </div>

                          <div className="stats-timeline-months-grid">
                            {y.months.map((m) => (
                              <div key={m.month} className="stats-timeline-month-card">
                                <span className="stats-timeline-month-name">
                                  {MONTH_NAMES[m.month]}
                                </span>
                                <div className="stats-timeline-chips-wrap">
                                  {m.peaks.map((pEntry) => (
                                    <button
                                      key={pEntry.peak.id}
                                      type="button"
                                      className="stats-travel-chip stats-travel-chip--peak"
                                      onClick={() => handleGoToRecord(pEntry.summitId)}
                                      title={`Abrir registro de ${pEntry.peak.name}${pEntry.count > 1 ? ` (${pEntry.count} ascensos)` : ""}`}
                                    >
                                      <span className="stats-travel-chip-dot stats-travel-chip-dot--peak" />
                                      <span className="stats-travel-chip-name">{pEntry.peak.name}</span>
                                      {pEntry.count > 1 && (
                                        <span className="stats-travel-chip-count">({pEntry.count})</span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                      {/* Picos sin fecha específica */}
                      {peaksTimeline.undated.length > 0 && (
                        <div className="stats-timeline-year-block">
                          <div className="stats-timeline-year-header">
                            <span className="stats-timeline-year-label">Sin fecha</span>
                            <span className="stats-timeline-year-count">
                              <strong>{peaksTimeline.totalUndated}</strong> {peaksTimeline.totalUndated === 1 ? "ascenso" : "ascensos"}
                            </span>
                          </div>
                          <div className="stats-timeline-chips-wrap" style={{ marginTop: 6 }}>
                            {peaksTimeline.undated.map((u) => (
                              <button
                                key={u.peak.id}
                                type="button"
                                className="stats-travel-chip stats-travel-chip--peak"
                                onClick={() => handleGoToRecord(u.summitId)}
                                title={`Abrir registro de ${u.peak.name}${u.count > 1 ? ` (${u.count} ascensos)` : ""}`}
                              >
                                <span className="stats-travel-chip-dot stats-travel-chip-dot--peak" />
                                <span className="stats-travel-chip-name">{u.peak.name}</span>
                                {u.count > 1 && (
                                  <span className="stats-travel-chip-count">({u.count})</span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Techo Más Alto Alcanzado */}
            {metrics.highestPeak ? (
              <div className="stats-highlight-banner">
                <div className="stats-highlight-icon-wrap">
                  <Trophy size={22} />
                </div>
                <div className="stats-highlight-body">
                  <div className="stats-highlight-title">Techo Más Alto Alcanzado</div>
                  <div className="stats-highlight-peak-row">
                    <h3 className="stats-highlight-text">{metrics.highestPeak.name}</h3>
                    <span className="stats-highlight-alt">
                      <strong>{Math.round(metrics.highestPeak.altitude).toLocaleString("es-ES")}</strong> <small>m</small>
                    </span>
                  </div>
                  <div className="stats-highlight-sub">
                    {metrics.highestPeak.province} · {metrics.highestPeak.range}
                  </div>
                </div>
              </div>
            ) : (
              <div className="stats-highlight-banner">
                <div className="stats-highlight-icon-wrap">
                  <Flame size={22} />
                </div>
                <div className="stats-highlight-body">
                  <div className="stats-highlight-title">El Reto Te Espera</div>
                  <h3 className="stats-highlight-text">Comienza tu primera cima</h3>
                  <div className="stats-highlight-sub">
                    Registra cualquier ascenso en el mapa para inaugurar tus hitos de altitud.
                  </div>
                </div>
              </div>
            )}

            {/* Los 4 Tresmiles de las Provincias (sin icono en el título) */}
            <div className="stats-section-card">
              <div className="stats-card-title-row">
                <h3 className="stats-card-title">Techos de +3.000 metros</h3>
                <span className="stats-card-chip">
                  {metrics.threeThousanders.filter((p) => p.completed).length} / {metrics.threeThousanders.length}
                </span>
              </div>
              <div className="stats-progress-list">
                {metrics.threeThousanders.map((p) => (
                  <div key={p.id} className="stats-progress-row">
                    <div className="stats-progress-row-header">
                      <span className="stats-range-peak-info">
                        {p.completed ? (
                          <span className="stats-range-peak-check">
                            <Check size={14} />
                          </span>
                        ) : (
                          <span className="stats-range-peak-pending">○</span>
                        )}
                        <span className="stats-range-peak-text">
                          <span className="stats-range-peak-name">{p.name}</span>{" "}
                          <span className="stats-range-peak-province">({p.province})</span>
                        </span>
                      </span>
                      <span className="stats-peak-alt-num">
                        <strong>{Math.round(p.altitude).toLocaleString("es-ES")}</strong> <small>m</small>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rangos de Altitud */}
            <div className="stats-section-card">
              <div className="stats-card-title-row">
                <h3 className="stats-card-title">Distribución por Altitud</h3>
              </div>
              <div className="stats-progress-list">
                <div className="stats-progress-row">
                  <div className="stats-progress-row-header">
                    <span>Alta montaña (+2.000 m)</span>
                    <span className="stats-row-num">
                      <strong>{metrics.twoThousandersCount}</strong> / {metrics.twoThousandersTotal}
                    </span>
                  </div>
                  <div className="stats-progress-bar-track">
                    <div
                      className="stats-progress-bar-fill"
                      style={{ width: `${(metrics.twoThousandersCount / (metrics.twoThousandersTotal || 1)) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="stats-progress-row">
                  <div className="stats-progress-row-header">
                    <span>Media montaña (1.000 m – 2.000 m)</span>
                    <span className="stats-row-num">
                      <strong>{metrics.midCount}</strong> / {metrics.midTotal}
                    </span>
                  </div>
                  <div className="stats-progress-bar-track">
                    <div
                      className="stats-progress-bar-fill stats-progress-bar-fill--amber"
                      style={{ width: `${(metrics.midCount / (metrics.midTotal || 1)) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="stats-progress-row">
                  <div className="stats-progress-row-header">
                    <span>Colinas y techos costeros (&lt; 1.000 m)</span>
                    <span className="stats-row-num">
                      <strong>{metrics.lowCount}</strong> / <strong>{metrics.lowTotal}</strong>
                    </span>
                  </div>
                  <div className="stats-progress-bar-track">
                    <div
                      className="stats-progress-bar-fill stats-progress-bar-fill--pine"
                      style={{ width: `${(metrics.lowCount / (metrics.lowTotal || 1)) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>


            {/* Desglose por Cordilleras con Dropdown Interactivo */}
            <div className="stats-section-card">
              <div className="stats-card-title-row">
                <h3 className="stats-card-title">Grandes Macizos y Cordilleras</h3>
              </div>
              <div className="stats-progress-list">
                {metrics.rangesStatus.map((r) => {
                  const isExpanded = !!expandedRanges[r.id];
                  return (
                    <div key={r.id} className="stats-range-card">
                      <button
                        type="button"
                        className="stats-range-btn"
                        onClick={() => toggleRange(r.id)}
                        aria-expanded={isExpanded}
                        aria-label={`${r.name}: ${isExpanded ? "Ocultar" : "Mostrar"} picos`}
                      >
                        <div className="stats-range-btn-row">
                          <span className="stats-range-name">{r.name}</span>
                          <div className="stats-range-meta">
                            <span className="stats-range-count-num">
                              <strong>{r.done}</strong> / {r.total}
                            </span>
                            {isExpanded ? <ChevronUp size={16} className="stats-range-chevron" /> : <ChevronDown size={16} className="stats-range-chevron" />}
                          </div>
                        </div>
                        <div className="stats-progress-bar-track">
                          <div
                            className="stats-progress-bar-fill"
                            style={{ width: `${r.pct}%` }}
                          />
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="stats-range-dropdown">
                          {r.peaksList.map((peak) => (
                            <button
                              key={peak.id}
                              type="button"
                              className="stats-range-peak-row"
                              onClick={() => handleGoToRecord(peak.id)}
                              title={`Abrir registro de ${peak.name}`}
                            >
                              <span className="stats-range-peak-info">
                                {peak.completed ? (
                                  <span className="stats-range-peak-check">
                                    <Check size={13} />
                                  </span>
                                ) : (
                                  <span className="stats-range-peak-pending">○</span>
                                )}
                                <span className="stats-range-peak-text">
                                  <span className="stats-range-peak-name">{peak.name}</span>{" "}
                                  <span className="stats-range-peak-province">({peak.province})</span>
                                </span>
                              </span>
                              <span className="stats-range-peak-alt">
                                <strong>{Math.round(peak.altitude).toLocaleString("es-ES")}</strong> <small>m</small>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════
            2. MODO 196 PAÍSES
            ══════════════════════════════════════ */}
        {activeMode === "countries" && (
          <>
            {/* Resumen Superior Países */}
            <div className="stats-kpi-grid">
              <div className="stats-kpi-card">
                <div className="stats-kpi-header">
                  <span className="stats-kpi-label">Países Explorados</span>
                  <Globe2 size={16} className="stats-kpi-icon" />
                </div>
                <div className="stats-kpi-value">
                  {metrics.completedCountriesCount} <small>/ 196</small>
                </div>
                <span className="stats-kpi-sub">
                  {metrics.countriesPct}% del planeta visitado
                </span>
                <div className="stats-kpi-progress stats-kpi-progress--continents">
                  {metrics.continentsBreakdown
                    .filter((c) => c.done > 0)
                    .map((cont) => {
                      const color = CONTINENT_COLOR_MAP[cont.continent]?.dot || "#0081C8";
                      const segWidthPct = (cont.done / 196) * 100;
                      return (
                        <div
                          key={cont.continent}
                          className="stats-kpi-progress-segment"
                          style={{
                            width: `${segWidthPct}%`,
                            backgroundColor: color,
                          }}
                          title={`${cont.continent}: ${cont.done} países`}
                        />
                      );
                    })}
                </div>
              </div>

              <div className="stats-kpi-card">
                <div className="stats-kpi-header">
                  <span className="stats-kpi-label">Por Descubrir</span>
                  <Sparkles size={16} className="stats-kpi-icon" />
                </div>
                <div className="stats-kpi-value">
                  {196 - metrics.completedCountriesCount} <small>países</small>
                </div>
                <span className="stats-kpi-sub">
                  Resto del atlas mundial
                </span>
              </div>
            </div>

            {/* Botón Ver Galería (solo el botón sin textos redundantes) */}
            <div className="stats-gallery-btn-wrap">
              <button
                type="button"
                className="stats-open-gallery-action-btn"
                onClick={() => setGalleryOpen(true)}
              >
                Ver galería
              </button>
            </div>

            {/* ── LÍNEA DEL TIEMPO (DESGLOSE POR AÑOS Y MESES CON COLORES POR CONTINENTE) ── */}
            <div className={`stats-section-card stats-travel-timeline-card ${timelineCollapsed ? "stats-travel-timeline-card--collapsed" : ""}`}>
              <div className="stats-card-title-row">
                <button
                  type="button"
                  className="stats-card-title-btn"
                  onClick={() => setTimelineCollapsed(!timelineCollapsed)}
                  aria-expanded={!timelineCollapsed}
                  aria-label={`${timelineCollapsed ? "Expandir" : "Contraer"} línea del tiempo`}
                >
                  <h3 className="stats-card-title">Línea del tiempo</h3>
                  {timelineCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                </button>
                <span className="stats-card-chip">
                  {visitsTimeline.totalVisitsCount} {visitsTimeline.totalVisitsCount === 1 ? "visita" : "visitas"}
                </span>
              </div>

              {!timelineCollapsed && (
                <>
                  {/* Leyenda de colores por continente */}
                  <div className="stats-timeline-legend">
                    {Object.entries(CONTINENT_COLOR_MAP).map(([cName, cColors]) => (
                      <span key={cName} className="stats-timeline-legend-item">
                        <span className="stats-timeline-legend-dot" style={{ background: cColors.dot }} />
                        {cName}
                      </span>
                    ))}
                  </div>

                  {visitsTimeline.years.length === 0 && visitsTimeline.undated.length === 0 ? (
                    <div className="stats-empty-notice">
                      Aún no has registrado visitas a países. Selecciona cualquier país en el mapa para inaugurar tu cronología de viajes.
                    </div>
                  ) : (
                    <div className="stats-timeline-years">
                      {visitsTimeline.years.map((y) => (
                        <div key={y.year} className="stats-timeline-year-block">
                          <div className="stats-timeline-year-header">
                            <span className="stats-timeline-year-label">{y.year}</span>
                            <span className="stats-timeline-year-count">
                              <strong>{y.totalCount}</strong> {y.totalCount === 1 ? "visita" : "visitas"}
                            </span>
                          </div>

                          <div className="stats-timeline-months-grid">
                            {y.months.map((m) => (
                              <div key={m.month} className="stats-timeline-month-card">
                                <span className="stats-timeline-month-name">
                                  {MONTH_NAMES[m.month]}
                                </span>
                                <div className="stats-timeline-chips-wrap">
                                  {m.countries.map((cEntry) => {
                                    const colors = CONTINENT_COLOR_MAP[cEntry.country.continent] || {
                                      bg: "rgba(100, 116, 139, 0.12)",
                                      text: "#475569",
                                      dot: "#64748b",
                                    };
                                    return (
                                      <button
                                        key={cEntry.country.id}
                                        type="button"
                                        className="stats-travel-chip"
                                        style={{
                                          background: colors.bg,
                                          color: colors.text,
                                        }}
                                        onClick={() => handleGoToRecord(cEntry.summitId)}
                                        title={`Abrir registro de ${cEntry.country.name}${cEntry.count > 1 ? ` (${cEntry.count} visitas)` : ""}`}
                                      >
                                        <span
                                          className="stats-travel-chip-dot"
                                          style={{ background: colors.dot }}
                                        />
                                        <span className="stats-travel-chip-name">{cEntry.country.name}</span>
                                        {cEntry.count > 1 && (
                                          <span className="stats-travel-chip-count">({cEntry.count})</span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                  {/* Países sin fecha específica */}
                  {visitsTimeline.undated.length > 0 && (
                    <div className="stats-timeline-year-block">
                      <div className="stats-timeline-year-header">
                        <span className="stats-timeline-year-label">Sin fecha</span>
                        <span className="stats-timeline-year-count">
                          <strong>{visitsTimeline.totalUndated}</strong> {visitsTimeline.totalUndated === 1 ? "visita" : "visitas"}
                        </span>
                      </div>
                      <div className="stats-timeline-chips-wrap" style={{ marginTop: 6 }}>
                        {visitsTimeline.undated.map((u) => {
                          const colors = CONTINENT_COLOR_MAP[u.country.continent] || {
                            bg: "rgba(100, 116, 139, 0.12)",
                            text: "#475569",
                            dot: "#64748b",
                          };
                          return (
                            <button
                              key={u.country.id}
                              type="button"
                              className="stats-travel-chip"
                              style={{
                                background: colors.bg,
                                color: colors.text,
                              }}
                              onClick={() => handleGoToRecord(u.summitId)}
                              title={`Abrir registro de ${u.country.name}${u.count > 1 ? ` (${u.count} visitas)` : ""}`}
                            >
                              <span
                                className="stats-travel-chip-dot"
                                style={{ background: colors.dot }}
                              />
                              <span className="stats-travel-chip-name">{u.country.name}</span>
                              {u.count > 1 && (
                                <span className="stats-travel-chip-count">({u.count})</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

            {/* ── DESGLOSE POR CONTINENTES (GRÁFICO VISUAL) ── */}
            <div className="stats-section-card">
              <div className="stats-card-title-row">
                <h3 className="stats-card-title">Desglose por Continentes</h3>
                <span className="stats-card-chip">
                  {metrics.completedCountriesCount} / 196
                </span>
              </div>

              {/* Gráfico de distribución continua proporcional por continentes */}
              {metrics.completedCountriesCount > 0 && (
                <div className="stats-continents-chart-wrap">
                  <div className="stats-continents-proportion-track">
                    {metrics.continentsBreakdown.map((cont) => {
                      if (cont.done === 0) return null;
                      const sharePct = (cont.done / metrics.completedCountriesCount) * 100;
                      const color = CONTINENT_COLOR_MAP[cont.continent]?.dot || "#5b3a8c";
                      return (
                        <div
                          key={cont.continent}
                          className="stats-continents-proportion-seg"
                          style={{
                            width: `${sharePct}%`,
                            backgroundColor: color,
                          }}
                          title={`${cont.continent}: ${cont.done} países (${Math.round(sharePct)}%)`}
                        />
                      );
                    })}
                  </div>

                  <div className="stats-continents-chart-legend">
                    {metrics.continentsBreakdown.map((cont) => {
                      if (cont.done === 0) return null;
                      const sharePct = Math.round((cont.done / metrics.completedCountriesCount) * 100);
                      const color = CONTINENT_COLOR_MAP[cont.continent]?.dot || "#5b3a8c";
                      return (
                        <span key={cont.continent} className="stats-continents-legend-item">
                          <span className="stats-continents-legend-dot" style={{ backgroundColor: color }} />
                          <span className="stats-continents-legend-label">{cont.continent}</span>
                          <strong className="stats-continents-legend-pct">{sharePct}%</strong>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Barras de progreso con el color de cada continente */}
              <div className="stats-progress-list">
                {metrics.continentsBreakdown.map((cont) => {
                  const contColor = CONTINENT_COLOR_MAP[cont.continent]?.dot || "var(--pine)";
                  return (
                    <div key={cont.continent} style={{ marginBottom: 12 }}>
                      <div className="stats-progress-row-header" style={{ marginBottom: 4 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              backgroundColor: contColor,
                              display: "inline-block",
                            }}
                          />
                          {cont.continent}
                        </span>
                        <span className="stats-row-num">
                          <strong>{cont.done}</strong> / {cont.total} ({cont.pct}%)
                        </span>
                      </div>
                      <div className="stats-progress-bar-track">
                        <div
                          className="stats-continent-progress-fill"
                          style={{
                            width: `${cont.pct}%`,
                            backgroundColor: contColor,
                          }}
                        />
                      </div>
                      {cont.countries.length > 0 && (
                        <div className="stats-chips-cloud" style={{ marginTop: 6 }}>
                          {cont.countries.map((cName) => (
                            <span key={cName} className="stats-chip-item stats-chip-item--done">
                              <Check size={11} /> {cName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>

      {/* ── Galería de Recuerdos Full View ── */}
      {galleryOpen && (
        <div className="stats-gallery-overlay" role="dialog" aria-modal="true">
          <header className="stats-header stats-header--gallery">
            <h2 className="stats-header-title">Galería de Recuerdos</h2>
            <button
              type="button"
              className="stats-close-btn"
              onClick={() => setGalleryOpen(false)}
              aria-label="Cerrar galería"
            >
              <X size={18} />
            </button>
          </header>

          <main className="stats-gallery-content">
            {sortedPhotos.length === 0 ? (
              <div className="stats-gallery-empty">
                <Camera size={40} className="stats-gallery-empty-icon" />
                <h3 className="stats-gallery-empty-title">
                  {activeMode === "peaks"
                    ? "Sin recuerdos de picos aún"
                    : "Sin recuerdos de países aún"}
                </h3>
                <p className="stats-gallery-empty-text">
                  {activeMode === "peaks"
                    ? "Añade fotos a tus picos provinciales desde sus fichas en el mapa para verlas todas aquí."
                    : "Añade fotos a tus viajes por el mundo desde sus fichas en el mapa para verlas todas aquí."}
                </p>
              </div>
            ) : (
              <>
                {/* Selector de ordenación */}
                <div className="stats-gallery-toolbar">
                  <span className="stats-gallery-count">{sortedPhotos.length} fotos</span>
                  <div className="stats-gallery-sort-wrap" role="group" aria-label="Ordenar fotos">
                    <button
                      type="button"
                      className={`stats-gallery-sort-btn ${sortOrder === "desc" ? "stats-gallery-sort-btn--active" : ""}`}
                      onClick={() => setSortOrder("desc")}
                    >
                      Más recientes
                    </button>
                    <button
                      type="button"
                      className={`stats-gallery-sort-btn ${sortOrder === "asc" ? "stats-gallery-sort-btn--active" : ""}`}
                      onClick={() => setSortOrder("asc")}
                    >
                      Más antiguas
                    </button>
                  </div>
                </div>

                <div className="stats-gallery-grid">
                  {sortedPhotos.map((photo, idx) => {
                    const loc = getLocationInfo(photo.summit_id);
                    return (
                      <button
                        key={photo.id || idx}
                        type="button"
                        className="stats-gallery-item"
                        onClick={() => setLightboxIndex(idx)}
                        aria-label={`Ver foto de ${loc.name}`}
                      >
                        <img
                          src={photo.public_url || photo.url}
                          alt={photo.caption || loc.name}
                          loading="lazy"
                          className="stats-gallery-img"
                        />
                        <span className="stats-gallery-item-tag">{loc.name}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </main>
        </div>
      )}

      {/* ── Lightbox para explorar todas las fotos (SIN dots, con título interactivo que abre el registro) ── */}
      {lightboxIndex !== null && activeLightboxPhoto && activeLocationInfo && (
        <PhotoLightbox
          photos={sortedPhotos.map((p) => ({
            ...p,
            public_url: p.public_url || p.url,
          }))}
          currentIndex={lightboxIndex}
          onIndexChange={(newIdx) => setLightboxIndex(newIdx)}
          onClose={() => setLightboxIndex(null)}
          title={activeLocationInfo.name}
          onTitleClick={() => handleGoToRecord(activeLightboxPhoto.summit_id)}
          canEdit={false}
          showDots={false}
        />
      )}
    </div>
  );
}
