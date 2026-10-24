"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import type { Session } from "@supabase/supabase-js";
import { peaks, type Peak } from "@/data/peaks";
import { countries, type Country } from "@/data/countries";
import { predefinedCategories } from "@/data/experiences";
import { supabase } from "@/lib/supabase";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";
import { getPhotoDisplayUrl } from "@/lib/photo-client";
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
} from "lucide-react";
import "./stats-modal.css";

export type StatsMode = "peaks" | "countries" | "experiences";

type Props = {
  session?: Session | null;
  myProfile?: {
    username?: string;
    avatar_url?: string | null;
    enable_peaks?: boolean;
    enable_countries?: boolean;
    enable_experiences?: boolean;
  } | null;
  targetProfile?: {
    id: string;
    username: string;
    enable_peaks?: boolean;
    enable_countries?: boolean;
    is_public?: boolean;
  } | null;
  ascents?: any[];
  experienceRecords?: any[];
  customExperiences?: any[];
  customCategories?: any[];
  photos?: any[];
  photosCount?: number;
  initialMode?: StatsMode;
  onModeChange?: (mode: StatsMode) => void;
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
  targetProfile,
  ascents: propAscents,
  experienceRecords: propExperiences,
  customExperiences: propCustomExperiences,
  customCategories: propCustomCategories,
  photos: propPhotos,
  photosCount: propPhotosCount,
  initialMode = "countries",
  onModeChange,
  onClose,
  onGoToRecord,
}: Props) {
  const isTargetOther = Boolean(targetProfile && session?.user?.id && targetProfile.id !== session.user.id);
  const effectiveUserId = targetProfile ? targetProfile.id : session?.user?.id;
  const overlayRef = useRef<HTMLDivElement>(null);

  const [activeMode, setActiveMode] = useState<StatsMode>(() => {
    if (initialMode === "experiences") return "experiences";
    if (initialMode === "peaks") return "peaks";
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("stats_active_mode");
        if (saved === "peaks" || saved === "countries" || saved === "experiences") {
          return saved as StatsMode;
        }
      } catch {}
    }
    return "countries";
  });

  // Sincronizar activeMode si cambia el prop initialMode desde el padre
  useEffect(() => {
    if (initialMode) {
      setActiveMode(initialMode);
    }
  }, [initialMode]);

  const switchStatsMode = (mode: StatsMode) => {
    if (mode === activeMode) return;
    setActiveMode(mode);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("stats_active_mode", mode);
      } catch {}
    }
    // Defer parent synchronization so the toggle indicator animates instantly with 0ms latency
    React.startTransition(() => {
      onModeChange?.(mode);
    });
  };

  const handleToggleExperiences = () => {
    if (activeMode === "experiences") {
      switchStatsMode("countries");
    } else {
      switchStatsMode("experiences");
    }
  };

  const [ascents, setAscents] = useState<any[]>(() => {
    if (propAscents !== undefined) return propAscents;
    if (!isTargetOther && typeof window !== "undefined" && session?.user?.id) {
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
    if (propPhotos !== undefined) return propPhotos;
    if (!isTargetOther && typeof window !== "undefined" && session?.user?.id) {
      try {
        const stored = localStorage.getItem(`app_tracker_photos_${session.user.id}`);
        if (stored) return JSON.parse(stored);
      } catch {
        /* ignore */
      }
    }
    return [];
  });

  const [experienceRecords, setExperienceRecords] = useState<any[]>(() => {
    if (propExperiences !== undefined) return propExperiences;
    if (!isTargetOther && typeof window !== "undefined" && session?.user?.id) {
      try {
        const stored = localStorage.getItem(`app_tracker_exp_records_${session.user.id}`);
        if (stored) return JSON.parse(stored);
      } catch {
        /* ignore */
      }
    }
    return [];
  });

  const [customExperiences, setCustomExperiences] = useState<any[]>(() => {
    if (propCustomExperiences !== undefined) return propCustomExperiences;
    if (!isTargetOther && typeof window !== "undefined" && session?.user?.id) {
      try {
        const stored = localStorage.getItem(`app_tracker_custom_exp_${session.user.id}`);
        if (stored) return JSON.parse(stored);
      } catch {
        /* ignore */
      }
    }
    return [];
  });

  const [customCategories, setCustomCategories] = useState<any[]>(() => {
    if (propCustomCategories !== undefined) return propCustomCategories;
    if (!isTargetOther && typeof window !== "undefined" && session?.user?.id) {
      try {
        const stored = localStorage.getItem(`app_tracker_custom_cat_${session.user.id}`);
        if (stored) return JSON.parse(stored);
      } catch {
        /* ignore */
      }
    }
    return [];
  });

  const [galleryOpen, setGalleryOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return window.location.hash === "#galeria" || window.location.hash === "#lightbox";
    }
    return false;
  });
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const openGallery = () => {
    setGalleryOpen(true);
    setLightboxIndex(null);
    if (typeof window !== "undefined") {
      if (window.location.hash !== "#galeria") {
        window.history.pushState({ statsGallery: true }, "", "#galeria");
      }
    }
  };

  const closeGallery = () => {
    setGalleryOpen(false);
    setLightboxIndex(null);
  };

  const openLightbox = (idx: number) => {
    setLightboxIndex(idx);
    if (typeof window !== "undefined") {
      if (window.location.hash !== "#lightbox") {
        window.history.pushState({ statsLightbox: true }, "", "#lightbox");
      }
    }
  };

  const closeLightbox = () => {
    setLightboxIndex(null);
  };

  useEffect(() => {
    if (!galleryOpen && typeof window !== "undefined" && window.location.hash === "#galeria") {
      window.history.back();
    }
  }, [galleryOpen]);

  useEffect(() => {
    if (lightboxIndex === null && typeof window !== "undefined" && window.location.hash === "#lightbox") {
      window.history.back();
    }
  }, [lightboxIndex]);

  useEffect(() => {
    const handleHashSync = () => {
      const hash = window.location.hash;
      if (hash === "#lightbox") {
        setGalleryOpen(true);
      } else if (hash === "#galeria") {
        setGalleryOpen(true);
        setLightboxIndex(null);
      } else if (hash === "#estadisticas") {
        setGalleryOpen(false);
        setLightboxIndex(null);
      } else if (!hash.startsWith("#panel")) {
        setGalleryOpen(false);
        setLightboxIndex(null);
      }
    };

    window.addEventListener("hashchange", handleHashSync);
    window.addEventListener("popstate", handleHashSync);
    return () => {
      window.removeEventListener("hashchange", handleHashSync);
      window.removeEventListener("popstate", handleHashSync);
    };
  }, []);

  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [expandedRanges, setExpandedRanges] = useState<Record<string, boolean>>({});
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);

  // Referencias para detección de deslizamiento horizontal (swipe)
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Soporte de deslizamiento horizontal táctil (swipe) en toda la modal de estadísticas
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (galleryOpen || lightboxIndex !== null) return;
      if (e.touches.length === 1) {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (galleryOpen || lightboxIndex !== null) {
        touchStartX.current = null;
        touchStartY.current = null;
        return;
      }
      if (touchStartX.current === null || touchStartY.current === null) return;
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = endX - touchStartX.current;
      const diffY = endY - touchStartY.current;
      touchStartX.current = null;
      touchStartY.current = null;

      // Distancia mínima de 45px, predominantemente horizontal
      if (Math.abs(diffX) >= 45 && Math.abs(diffY) <= 50 && Math.abs(diffX) >= Math.abs(diffY) * 1.5) {
        if (diffX < 0) {
          // Deslizar izquierda (avanzar)
          if (activeMode === "peaks") {
            switchStatsMode("countries");
          } else if (activeMode === "countries") {
            switchStatsMode("experiences");
          }
        } else {
          // Deslizar derecha (retroceder)
          if (activeMode === "experiences") {
            switchStatsMode("countries");
          } else if (activeMode === "countries") {
            switchStatsMode("peaks");
          }
        }
      }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [activeMode, galleryOpen, lightboxIndex]);

  // Soporte de desplazamiento horizontal con trackpad/rueda de ratón (gesto horizontal fluido)
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;

    let lastWheelTime = 0;
    const handleWheel = (e: WheelEvent) => {
      if (galleryOpen || lightboxIndex !== null) return;
      if (
        Math.abs(e.deltaX) >= 40 &&
        Math.abs(e.deltaX) >= Math.abs(e.deltaY) * 1.5
      ) {
        const now = Date.now();
        if (now - lastWheelTime > 450) {
          lastWheelTime = now;
          if (e.deltaX > 0) {
            if (activeMode === "peaks") {
              switchStatsMode("countries");
            } else if (activeMode === "countries") {
              switchStatsMode("experiences");
            }
          } else {
            if (activeMode === "experiences") {
              switchStatsMode("countries");
            } else if (activeMode === "countries") {
              switchStatsMode("peaks");
            }
          }
        }
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: true });
    return () => {
      el.removeEventListener("wheel", handleWheel);
    };
  }, [activeMode, galleryOpen, lightboxIndex]);

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
        window.history.pushState({ hasPanel: true }, "", `#panel=${encodeURIComponent(cleanId)}`);
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
    if (propAscents !== undefined) {
      setAscents(propAscents);
    }
  }, [propAscents]);

  useEffect(() => {
    if (propPhotos !== undefined) {
      setPhotos(propPhotos);
    }
  }, [propPhotos]);

  useEffect(() => {
    if (propExperiences !== undefined) {
      setExperienceRecords(propExperiences);
    }
  }, [propExperiences]);

  useEffect(() => {
    if (propCustomExperiences !== undefined) {
      setCustomExperiences(propCustomExperiences);
    }
  }, [propCustomExperiences]);

  useEffect(() => {
    if (propCustomCategories !== undefined) {
      setCustomCategories(propCustomCategories);
    }
  }, [propCustomCategories]);

  useEffect(() => {
    if (!supabase || !effectiveUserId) return;
    if (propPhotos === undefined && photos.length === 0) {
      supabase
        .from("summit_photos")
        .select("id, summit_id, public_url, taken_on, caption, created_at, storage_path, shot_at")
        .eq("user_id", effectiveUserId)
        .order("taken_on", { ascending: false })
        .order("created_at", { ascending: true })
        .then(({ data }) => {
          if (data) setPhotos(data);
        });
    }
  }, [effectiveUserId, propPhotos, photos.length]);

  // Fetch experience records if missing
  useEffect(() => {
    if (!supabase || !effectiveUserId) return;
    if (propExperiences === undefined && experienceRecords.length === 0) {
      supabase
        .from("experience_records")
        .select("*")
        .eq("user_id", effectiveUserId)
        .then(({ data }) => {
          if (data && data.length > 0) {
            setExperienceRecords(data);
          }
        });
    }
  }, [effectiveUserId, propExperiences, experienceRecords.length]);

  // Fetch full ascents with achieved_on if missing or empty
  useEffect(() => {
    if (!session?.user?.id || !supabase || isTargetOther) return;
    const isMissingDates =
      ascents.length > 0 &&
      ascents.some((a) => !a.is_wishlist && a.achieved_on === undefined);
    const isEmpty = ascents.length === 0 && propAscents === undefined;

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
  }, [session, ascents, isTargetOther, propAscents]);

  // ── Compute Analytics & Metrics (Picos & Países) ─────────────
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

  // ── Compute Analytics & Metrics (Experiencias) ─────────────
  const expMetrics = useMemo(() => {
    // 1. Recopilar categorías estáticas y personalizadas
    const allPredefined = predefinedCategories.map((cat) => {
      const linkedCustomExps = customExperiences
        .filter((ce) => ce.static_category_id === cat.id)
        .map((ce) => ({ id: ce.id, name: ce.name, subItems: ce.sub_items }));
      return {
        ...cat,
        experiences: [...cat.experiences, ...linkedCustomExps],
      };
    });

    const customCats = customCategories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      iconName: cat.icon_name || "star",
      experiences: customExperiences
        .filter((ce) => ce.category_id === cat.id)
        .map((ce) => ({ id: ce.id, name: ce.name, subItems: ce.sub_items })),
    }));

    const orphanedCustom = customExperiences.filter(
      (ce) => !ce.category_id && !ce.static_category_id
    );
    const orphanCategories: any[] = [];
    if (orphanedCustom.length > 0) {
      orphanCategories.push({
        id: "cat-custom-other",
        name: "Otras Experiencias",
        iconName: "star",
        experiences: orphanedCustom.map((ce) => ({ id: ce.id, name: ce.name, subItems: ce.sub_items })),
      });
    }

    const allCategories = [...allPredefined, ...customCats, ...orphanCategories];

    // 2. Registros completados
    const completedExpRecords = [
      ...experienceRecords.filter((r) => !r.is_wishlist),
      ...ascents
        .filter(
          (a) =>
            !a.is_wishlist &&
            (a.summit_id?.startsWith("exp-") || a.summit_id?.startsWith("custom-"))
        )
        .map((a) => ({
          experience_id: a.summit_id,
          sub_item_id: a.sub_item_id,
        })),
    ];

    let totalCount = 0;
    let completedCount = 0;

    const categoriesStatus = allCategories.map((cat) => {
      let catDone = 0;
      const experiencesList = cat.experiences.map((exp: any) => {
        totalCount++;
        let isExpDone = false;
        let subItemsDone = 0;
        const subItemsTotal = exp.subItems?.length || 0;

        if (!exp.subItems || exp.subItems.length === 0) {
          isExpDone = completedExpRecords.some((r) => r.experience_id === exp.id);
        } else {
          const subItemIds = exp.subItems.map((s: any) => s.id);
          const completedSubIds = new Set(
            completedExpRecords
              .filter((r) => r.experience_id === exp.id && r.sub_item_id)
              .map((r) => r.sub_item_id)
          );
          subItemsDone = exp.subItems.filter((s: any) => completedSubIds.has(s.id)).length;
          // Invariante 4.2: Con sub-items sólo se computa completada si TODOS sus sub-items están marcados
          isExpDone = subItemIds.length > 0 && subItemIds.every((id: string) => completedSubIds.has(id));
        }

        if (isExpDone) {
          catDone++;
          completedCount++;
        }

        return {
          id: exp.id,
          name: exp.name,
          completed: isExpDone,
          subItemsDone,
          subItemsTotal,
        };
      });

      const catTotal = experiencesList.length;
      const catPct = catTotal > 0 ? Math.round((catDone / catTotal) * 100) : 0;

      return {
        id: cat.id,
        name: cat.name,
        iconName: cat.iconName,
        done: catDone,
        total: catTotal,
        pct: catPct,
        experiencesList,
      };
    });

    const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return {
      totalCount,
      completedCount,
      pct,
      categoriesStatus,
    };
  }, [experienceRecords, ascents, customExperiences, customCategories]);

  // Desglose visual por años y meses de países visitados
  const visitsTimeline = useMemo(() => {
    type CountryVisitGroup = {
      country: Country;
      summitId: string;
      count: number;
      earliestTime: number;
      createdTime: number;
    };
    type MonthEntry = { month: number; countries: CountryVisitGroup[] };
    type YearEntry = { year: number; months: MonthEntry[]; totalCount: number };

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
          const time = d.getTime();
          const createdTime = a.created_at ? new Date(a.created_at).getTime() : time;

          if (!yearMap[y]) yearMap[y] = {};
          if (!yearMap[y][m]) yearMap[y][m] = {};

          if (!yearMap[y][m][country.id]) {
            yearMap[y][m][country.id] = {
              country,
              summitId: a.summit_id || country.id,
              count: 1,
              earliestTime: time,
              createdTime,
            };
          } else {
            yearMap[y][m][country.id].count += 1;
            if (time < yearMap[y][m][country.id].earliestTime) {
              yearMap[y][m][country.id].earliestTime = time;
              yearMap[y][m][country.id].summitId = a.summit_id || country.id;
            }
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
          earliestTime: 0,
          createdTime: a.created_at ? new Date(a.created_at).getTime() : 0,
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
            const countriesList = Object.values(yearMap[y][m]).sort((a, b) => {
              if (a.earliestTime !== b.earliestTime) {
                return a.earliestTime - b.earliestTime;
              }
              if (a.createdTime !== b.createdTime) {
                return a.createdTime - b.createdTime;
              }
              return a.country.name.localeCompare(b.country.name);
            });
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

  // Desglose visual por años y meses de picos provinciales ascendidos
  const peaksTimeline = useMemo(() => {
    type PeakAscentGroup = {
      peak: Peak;
      summitId: string;
      count: number;
      earliestTime: number;
      createdTime: number;
    };
    type MonthEntry = { month: number; peaks: PeakAscentGroup[] };
    type YearEntry = { year: number; months: MonthEntry[]; totalCount: number };

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
          const time = d.getTime();
          const createdTime = a.created_at ? new Date(a.created_at).getTime() : time;

          if (!yearMap[y]) yearMap[y] = {};
          if (!yearMap[y][m]) yearMap[y][m] = {};

          if (!yearMap[y][m][peak.name]) {
            yearMap[y][m][peak.name] = {
              peak,
              summitId: a.summit_id || peak.id,
              count: 1,
              earliestTime: time,
              createdTime,
            };
          } else {
            yearMap[y][m][peak.name].count += 1;
            if (time < yearMap[y][m][peak.name].earliestTime) {
              yearMap[y][m][peak.name].earliestTime = time;
              yearMap[y][m][peak.name].summitId = a.summit_id || peak.id;
            }
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
          earliestTime: 0,
          createdTime: a.created_at ? new Date(a.created_at).getTime() : 0,
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
          .sort((a, b) => b - a)
          .map((m) => {
            const peaksList = Object.values(yearMap[y][m]).sort((a, b) => {
              if (a.earliestTime !== b.earliestTime) {
                return a.earliestTime - b.earliestTime;
              }
              if (a.createdTime !== b.createdTime) {
                return a.createdTime - b.createdTime;
              }
              return a.peak.name.localeCompare(b.peak.name);
            });
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

  // Desglose visual por años y meses de experiencias vividas
  const experiencesTimeline = useMemo(() => {
    type ExpVisitGroup = {
      name: string;
      summitId: string;
      count: number;
      earliestTime: number;
      createdTime: number;
    };
    type MonthEntry = { month: number; experiences: ExpVisitGroup[] };
    type YearEntry = { year: number; months: MonthEntry[]; totalCount: number };

    const yearMap: Record<number, Record<number, Record<string, ExpVisitGroup>>> = {};
    const undatedMap: Record<string, ExpVisitGroup> = {};

    const allExpRecords = [
      ...experienceRecords.filter((r) => !r.is_wishlist),
      ...ascents
        .filter(
          (a) =>
            !a.is_wishlist &&
            (a.summit_id?.startsWith("exp-") || a.summit_id?.startsWith("custom-"))
        )
        .map((a) => ({
          experience_id: a.summit_id,
          sub_item_id: a.sub_item_id,
          achieved_on: a.achieved_on,
          created_at: a.created_at,
          id: a.id || a.record_id,
        })),
    ];

    allExpRecords.forEach((r) => {
      const expId = r.experience_id;
      const loc = getLocationInfo(r.sub_item_id ? `${expId}::${r.sub_item_id}` : expId);
      const displayName = loc.name;
      const summitId = r.sub_item_id ? `${expId}::${r.sub_item_id}` : expId;

      const rawDate = r.achieved_on || r.created_at;
      if (rawDate && rawDate !== "1900-01-01") {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = d.getMonth();
          const time = d.getTime();
          const createdTime = r.created_at ? new Date(r.created_at).getTime() : time;

          if (!yearMap[y]) yearMap[y] = {};
          if (!yearMap[y][m]) yearMap[y][m] = {};

          if (!yearMap[y][m][summitId]) {
            yearMap[y][m][summitId] = {
              name: displayName,
              summitId,
              count: 1,
              earliestTime: time,
              createdTime,
            };
          } else {
            yearMap[y][m][summitId].count += 1;
            if (time < yearMap[y][m][summitId].earliestTime) {
              yearMap[y][m][summitId].earliestTime = time;
            }
          }
          return;
        }
      }

      // Sin fecha
      if (!undatedMap[summitId]) {
        undatedMap[summitId] = {
          name: displayName,
          summitId,
          count: 1,
          earliestTime: 0,
          createdTime: r.created_at ? new Date(r.created_at).getTime() : 0,
        };
      } else {
        undatedMap[summitId].count += 1;
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
            const list = Object.values(yearMap[y][m]).sort((a, b) => {
              if (a.earliestTime !== b.earliestTime) return a.earliestTime - b.earliestTime;
              return a.name.localeCompare(b.name);
            });
            return { month: m, experiences: list };
          });
        const totalCount = months.reduce(
          (acc, curr) => acc + curr.experiences.reduce((cAcc, cItem) => cAcc + cItem.count, 0),
          0
        );
        return { year: y, months, totalCount };
      });

    const undatedList = Object.values(undatedMap).sort((a, b) => a.name.localeCompare(b.name));
    const totalUndated = undatedList.reduce((acc, curr) => acc + curr.count, 0);
    const totalExperiencesCount =
      yearsList.reduce((acc, curr) => acc + curr.totalCount, 0) + totalUndated;

    return {
      years: yearsList,
      undated: undatedList,
      totalUndated,
      totalExperiencesCount,
    };
  }, [experienceRecords, ascents]);

  // Fotos filtradas exclusivamente por el modo activo (peaks vs countries vs experiences)
  const modePhotos = useMemo(() => {
    return photos.filter((p) => {
      const loc = getLocationInfo(p.summit_id);
      if (activeMode === "peaks") {
        return loc.type === "peak";
      } else if (activeMode === "countries") {
        return loc.type === "country";
      } else {
        return (
          loc.type === "experience" ||
          p.summit_id?.startsWith("exp-") ||
          p.summit_id?.startsWith("custom-") ||
          experienceRecords.some((r) => r.experience_id === p.summit_id || r.id === p.summit_id)
        );
      }
    });
  }, [photos, activeMode, experienceRecords]);

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
      ref={overlayRef}
      className={`stats-overlay ${
        activeMode === "peaks"
          ? "stats-overlay--peaks stats-mode--peaks mode-peaks"
          : activeMode === "experiences"
          ? "stats-overlay--experiences stats-mode--experiences mode-experiences"
          : "stats-overlay--countries stats-mode--countries mode-countries"
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="stats-title"
    >
      {/* ── Sticky Top Bar con Toggle Central y Botón de Experiencias ── */}
      <div className="stats-sticky-top">
        <header className="stats-header stats-header--centered">
          {/* Lado izquierdo: Botón de experiencias cuando se esté en modo países o experiencias */}
          <div className="stats-header-left">
            {activeMode !== "peaks" ? (
              <button
                type="button"
                className={`stats-exp-toggle-btn ${activeMode === "experiences" ? "stats-exp-toggle-btn--active" : ""}`}
                onClick={handleToggleExperiences}
                aria-label={activeMode === "experiences" ? "Volver a países" : "Ver estadísticas de experiencias"}
                title={activeMode === "experiences" ? "Volver a países" : "Ver estadísticas de experiencias"}
              >
                <svg
                  className="stats-exp-icon"
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
              </button>
            ) : (
              <div className="stats-header-spacer" />
            )}
          </div>

          {/* Toggle Central: mismo nivel y posición canónica que la topbar */}
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
              onClick={() => switchStatsMode("peaks")}
            >
              47 Picos
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeMode === "countries"}
              className={`app-mode-btn ${activeMode === "countries" ? "active" : ""}`}
              onClick={() => switchStatsMode("countries")}
            >
              196 Países
            </button>
          </div>

          {/* Lado derecho: botón de cerrar */}
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

      {/* ── Content (con soporte de deslizamiento horizontal táctil y trackpad) ── */}
      <main className="stats-content">
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
                onClick={() => openGallery()}
              >
                Ver galería
              </button>
            </div>

            {/* ── LÍNEA DEL TIEMPO DE PICOS ── */}
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

            {/* Los 4 Tresmiles de las Provincias */}
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
                onClick={() => openGallery()}
              >
                Ver galería
              </button>
            </div>

            {/* ── LÍNEA DEL TIEMPO ── */}
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

        {/* ══════════════════════════════════════
            3. MODO EXPERIENCIAS
            ══════════════════════════════════════ */}
        {activeMode === "experiences" && (
          <>
            {/* Resumen Superior Experiencias */}
            <div className="stats-kpi-grid">
              <div className="stats-kpi-card">
                <div className="stats-kpi-header">
                  <span className="stats-kpi-label">Experiencias Registradas</span>
                  <svg
                    className="stats-kpi-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ width: 16, height: 16 }}
                  >
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="6" />
                    <circle cx="12" cy="12" r="2" />
                  </svg>
                </div>
                <div className="stats-kpi-value">
                  {expMetrics.completedCount} <small>/ {expMetrics.totalCount}</small>
                </div>
                <span className="stats-kpi-sub">
                  {expMetrics.pct}% completado
                </span>
                <div className="stats-kpi-progress">
                  <div
                    className="stats-kpi-progress-bar stats-progress-bar-fill--experience"
                    style={{ width: `${expMetrics.pct}%` }}
                  />
                </div>
              </div>

              <div className="stats-kpi-card">
                <div className="stats-kpi-header">
                  <span className="stats-kpi-label">Por Vivir</span>
                  <Sparkles size={16} className="stats-kpi-icon" />
                </div>
                <div className="stats-kpi-value">
                  {Math.max(0, expMetrics.totalCount - expMetrics.completedCount)} <small>experiencias</small>
                </div>
                <span className="stats-kpi-sub">
                  Retos y aventuras por descubrir
                </span>
              </div>
            </div>

            {/* Botón Ver Galería */}
            <div className="stats-gallery-btn-wrap">
              <button
                type="button"
                className="stats-open-gallery-action-btn"
                onClick={() => openGallery()}
              >
                Ver galería
              </button>
            </div>

            {/* ── LÍNEA DEL TIEMPO DE EXPERIENCIAS ── */}
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
                  {experiencesTimeline.totalExperiencesCount} {experiencesTimeline.totalExperiencesCount === 1 ? "experiencia" : "experiencias"}
                </span>
              </div>

              {!timelineCollapsed && (
                <>
                  {experiencesTimeline.years.length === 0 && experiencesTimeline.undated.length === 0 ? (
                    <div className="stats-empty-notice">
                      Aún no has registrado experiencias vividas. Selecciona cualquier experiencia en el mapa para inaugurar tu cronología de aventuras.
                    </div>
                  ) : (
                    <div className="stats-timeline-years">
                      {experiencesTimeline.years.map((y) => (
                        <div key={y.year} className="stats-timeline-year-block">
                          <div className="stats-timeline-year-header">
                            <span className="stats-timeline-year-label">{y.year}</span>
                            <span className="stats-timeline-year-count">
                              <strong>{y.totalCount}</strong> {y.totalCount === 1 ? "experiencia" : "experiencias"}
                            </span>
                          </div>

                          <div className="stats-timeline-months-grid">
                            {y.months.map((m) => (
                              <div key={m.month} className="stats-timeline-month-card">
                                <span className="stats-timeline-month-name">
                                  {MONTH_NAMES[m.month]}
                                </span>
                                <div className="stats-timeline-chips-wrap">
                                  {m.experiences.map((expEntry) => (
                                    <button
                                      key={expEntry.summitId}
                                      type="button"
                                      className="stats-travel-chip stats-travel-chip--experience"
                                      onClick={() => handleGoToRecord(expEntry.summitId)}
                                      title={`Abrir registro de ${expEntry.name}${expEntry.count > 1 ? ` (${expEntry.count} registros)` : ""}`}
                                    >
                                      <span className="stats-travel-chip-dot stats-travel-chip-dot--experience" />
                                      <span className="stats-travel-chip-name">{expEntry.name}</span>
                                      {expEntry.count > 1 && (
                                        <span className="stats-travel-chip-count">({expEntry.count})</span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                      {/* Experiencias sin fecha específica */}
                      {experiencesTimeline.undated.length > 0 && (
                        <div className="stats-timeline-year-block">
                          <div className="stats-timeline-year-header">
                            <span className="stats-timeline-year-label">Sin fecha</span>
                            <span className="stats-timeline-year-count">
                              <strong>{experiencesTimeline.totalUndated}</strong> {experiencesTimeline.totalUndated === 1 ? "experiencia" : "experiencias"}
                            </span>
                          </div>
                          <div className="stats-timeline-chips-wrap" style={{ marginTop: 6 }}>
                            {experiencesTimeline.undated.map((u) => (
                              <button
                                key={u.summitId}
                                type="button"
                                className="stats-travel-chip stats-travel-chip--experience"
                                onClick={() => handleGoToRecord(u.summitId)}
                                title={`Abrir registro de ${u.name}${u.count > 1 ? ` (${u.count} registros)` : ""}`}
                              >
                                <span className="stats-travel-chip-dot stats-travel-chip-dot--experience" />
                                <span className="stats-travel-chip-name">{u.name}</span>
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

            {/* ── GRANDES CATEGORÍAS DE EXPERIENCIAS (DROPDOWN INTERACTIVO) ── */}
            <div className="stats-section-card">
              <div className="stats-card-title-row">
                <h3 className="stats-card-title">Categorías de Experiencias</h3>
                <span className="stats-card-chip">
                  {expMetrics.completedCount} / {expMetrics.totalCount}
                </span>
              </div>
              <div className="stats-progress-list">
                {expMetrics.categoriesStatus.map((cat) => {
                  const isExpanded = !!expandedRanges[cat.id];
                  return (
                    <div key={cat.id} className="stats-range-card">
                      <button
                        type="button"
                        className="stats-range-btn"
                        onClick={() => toggleRange(cat.id)}
                        aria-expanded={isExpanded}
                        aria-label={`${cat.name}: ${isExpanded ? "Ocultar" : "Mostrar"} experiencias`}
                      >
                        <div className="stats-range-btn-row">
                          <span className="stats-range-name">{cat.name}</span>
                          <div className="stats-range-meta">
                            <span className="stats-range-count-num">
                              <strong>{cat.done}</strong> / {cat.total}
                            </span>
                            {isExpanded ? (
                              <ChevronUp size={16} className="stats-range-chevron" />
                            ) : (
                              <ChevronDown size={16} className="stats-range-chevron" />
                            )}
                          </div>
                        </div>
                        <div className="stats-progress-bar-track">
                          <div
                            className="stats-progress-bar-fill stats-progress-bar-fill--experience"
                            style={{ width: `${cat.pct}%` }}
                          />
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="stats-range-dropdown">
                          {cat.experiencesList.map((exp: any) => (
                            <button
                              key={exp.id}
                              type="button"
                              className="stats-range-peak-row"
                              onClick={() => handleGoToRecord(exp.id)}
                              title={`Abrir registro de ${exp.name}`}
                            >
                              <span className="stats-range-peak-info">
                                {exp.completed ? (
                                  <span className="stats-range-peak-check stats-range-peak-check--experience">
                                    <Check size={13} />
                                  </span>
                                ) : (
                                  <span className="stats-range-peak-pending">○</span>
                                )}
                                <span className="stats-range-peak-text">
                                  <span className="stats-range-peak-name">{exp.name}</span>
                                  {exp.subItemsTotal > 0 && (
                                    <span className="stats-range-subitems-meta">
                                      ({exp.subItemsDone}/{exp.subItemsTotal} sub-ítems)
                                    </span>
                                  )}
                                </span>
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
      </main>

      {/* ── Galería de Recuerdos Full View ── */}
      {galleryOpen && (
        <div className="stats-gallery-overlay" role="dialog" aria-modal="true">
          <header className="stats-header stats-header--gallery">
            <h2 className="stats-header-title">
              {targetProfile ? `Galería de @${targetProfile.username}` : "Galería de Recuerdos"}
            </h2>
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
                    : activeMode === "experiences"
                    ? "Sin recuerdos de experiencias aún"
                    : "Sin recuerdos de países aún"}
                </h3>
                <p className="stats-gallery-empty-text">
                  {targetProfile
                    ? activeMode === "peaks"
                      ? `@${targetProfile.username} aún no ha añadido fotos a sus picos provinciales.`
                      : activeMode === "experiences"
                      ? `@${targetProfile.username} aún no ha añadido fotos a sus experiencias.`
                      : `@${targetProfile.username} aún no ha añadido fotos a sus viajes por el mundo.`
                    : activeMode === "peaks"
                    ? "Añade fotos a tus picos provinciales desde sus fichas en el mapa para verlas todas aquí."
                    : activeMode === "experiences"
                    ? "Añade fotos a tus experiencias desde sus fichas en el mapa para verlas todas aquí."
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
                        onClick={() => openLightbox(idx)}
                        aria-label={`Ver foto de ${loc.name}`}
                      >
                        <img
                          src={getPhotoDisplayUrl(photo.public_url || photo.url, photo.storage_path)}
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
            public_url: getPhotoDisplayUrl(p.public_url || p.url, p.storage_path),
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
