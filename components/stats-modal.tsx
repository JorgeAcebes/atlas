"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { X } from "lucide-react";
import { peaks } from "@/data/peaks";
import { supabase } from "@/lib/supabase";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";
import { getCountryForAscent, getLocationInfo, getPeakForAscent } from "@/lib/stats-utils";
import {
  buildAllTimelines,
  computeExperienceStats,
  computePeaksAndCountriesStats,
} from "@/lib/stats-calculations";
import { IconLogo } from "./icons";
import { StatsPeaksView } from "./stats/stats-peaks-view";
import { StatsCountriesView } from "./stats/stats-countries-view";
import { StatsExperiencesView } from "./stats/stats-experiences-view";
import { StatsGalleryModal } from "./stats/stats-gallery-modal";
import "./stats-modal.css";

export type StatsMode = "peaks" | "countries" | "experiences";
export { getLocationInfo, getCountryForAscent, getPeakForAscent };

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

function readStoredTrackerArray(key: string, enabled: boolean): any[] {
  if (!enabled || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function StatsModal({
  session,
  targetProfile,
  ascents: propAscents,
  experienceRecords: propExperiences,
  customExperiences: propCustomExperiences,
  customCategories: propCustomCategories,
  photos: propPhotos,
  initialMode = "countries",
  onModeChange,
  onClose,
  onGoToRecord,
}: Props) {
  const isTargetOther = Boolean(
    targetProfile && session?.user?.id && targetProfile.id !== session.user.id
  );
  const effectiveUserId = targetProfile ? targetProfile.id : session?.user?.id;
  const canReadLocal = !isTargetOther && Boolean(session?.user?.id);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [activeMode, setActiveMode] = useState<StatsMode>(() => {
    if (initialMode === "experiences") return "experiences";
    if (initialMode === "peaks") return "peaks";
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("stats_active_mode");
        if (saved === "peaks" || saved === "countries" || saved === "experiences") {
          return saved;
        }
      } catch {
        /* ignore */
      }
    }
    return "countries";
  });

  useEffect(() => {
    if (initialMode) setActiveMode(initialMode);
  }, [initialMode]);

  const switchStatsMode = useCallback(
    (mode: StatsMode) => {
      if (mode === activeMode) return;
      setActiveMode(mode);
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem("stats_active_mode", mode);
        } catch {
          /* ignore */
        }
      }
      React.startTransition(() => {
        onModeChange?.(mode);
      });
    },
    [activeMode, onModeChange]
  );

  const handleToggleExperiences = useCallback(() => {
    switchStatsMode(activeMode === "experiences" ? "countries" : "experiences");
  }, [activeMode, switchStatsMode]);

  const [ascents, setAscents] = useState<any[]>(() =>
    propAscents !== undefined
      ? propAscents
      : readStoredTrackerArray(`app_tracker_ascents_${session?.user?.id}`, canReadLocal)
  );
  const [photos, setPhotos] = useState<any[]>(() =>
    propPhotos !== undefined
      ? propPhotos
      : readStoredTrackerArray(`app_tracker_photos_${session?.user?.id}`, canReadLocal)
  );
  const [experienceRecords, setExperienceRecords] = useState<any[]>(() =>
    propExperiences !== undefined
      ? propExperiences
      : readStoredTrackerArray(`app_tracker_exp_records_${session?.user?.id}`, canReadLocal)
  );
  const [customExperiences, setCustomExperiences] = useState<any[]>(() =>
    propCustomExperiences !== undefined
      ? propCustomExperiences
      : readStoredTrackerArray(`app_tracker_custom_exp_${session?.user?.id}`, canReadLocal)
  );
  const [customCategories, setCustomCategories] = useState<any[]>(() =>
    propCustomCategories !== undefined
      ? propCustomCategories
      : readStoredTrackerArray(`app_tracker_custom_cat_${session?.user?.id}`, canReadLocal)
  );

  const [galleryOpen, setGalleryOpen] = useState(() =>
    typeof window !== "undefined"
      ? window.location.hash === "#galeria" || window.location.hash === "#lightbox"
      : false
  );
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [navigatingRecordId, setNavigatingRecordId] = useState<string | null>(null);
  const [showNavigatingLoader, setShowNavigatingLoader] = useState(false);
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [expandedRanges, setExpandedRanges] = useState<Record<string, boolean>>({});
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    if (!navigatingRecordId) {
      setShowNavigatingLoader(false);
      return;
    }
    const timer = setTimeout(() => setShowNavigatingLoader(true), 150);
    const autoDismiss = setTimeout(() => {
      setShowNavigatingLoader(false);
      setNavigatingRecordId(null);
    }, 1200);
    return () => {
      clearTimeout(timer);
      clearTimeout(autoDismiss);
    };
  }, [navigatingRecordId]);

  useEffect(() => {
    const handleHashSync = () => {
      const hash = window.location.hash;
      if (!hash.startsWith("#panel")) {
        setNavigatingRecordId(null);
        setShowNavigatingLoader(false);
      }
      if (hash === "#lightbox") {
        setGalleryOpen(true);
      } else if (hash === "#galeria") {
        setGalleryOpen(true);
        setLightboxIndex(null);
      } else {
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

  const openGallery = () => {
    setGalleryOpen(true);
    setLightboxIndex(null);
    if (typeof window !== "undefined" && window.location.hash !== "#galeria") {
      window.history.pushState({ statsGallery: true }, "", "#galeria");
    }
  };

  const openLightbox = (idx: number) => {
    setLightboxIndex(idx);
    if (typeof window !== "undefined" && window.location.hash !== "#lightbox") {
      window.history.pushState({ statsLightbox: true }, "", "#lightbox");
    }
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
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (lightboxIndex !== null) return;
      if (galleryOpen) setGalleryOpen(false);
      else onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [galleryOpen, lightboxIndex, onClose]);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    let lastWheelTime = 0;

    const advanceMode = (delta: number) => {
      if (delta > 0) {
        if (activeMode === "peaks") switchStatsMode("countries");
        else if (activeMode === "countries") switchStatsMode("experiences");
      } else {
        if (activeMode === "experiences") switchStatsMode("countries");
        else if (activeMode === "countries") switchStatsMode("peaks");
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (galleryOpen || lightboxIndex !== null || e.touches.length !== 1) return;
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (galleryOpen || lightboxIndex !== null) {
        touchStartX.current = null;
        touchStartY.current = null;
        return;
      }
      if (touchStartX.current === null || touchStartY.current === null) return;
      const diffX = e.changedTouches[0].clientX - touchStartX.current;
      const diffY = e.changedTouches[0].clientY - touchStartY.current;
      touchStartX.current = null;
      touchStartY.current = null;
      if (Math.abs(diffX) >= 45 && Math.abs(diffY) <= 50 && Math.abs(diffX) >= Math.abs(diffY) * 1.5) {
        advanceMode(diffX < 0 ? 1 : -1);
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (galleryOpen || lightboxIndex !== null) return;
      if (Math.abs(e.deltaX) >= 40 && Math.abs(e.deltaX) >= Math.abs(e.deltaY) * 1.5) {
        const now = Date.now();
        if (now - lastWheelTime > 450) {
          lastWheelTime = now;
          advanceMode(e.deltaX);
        }
      }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    el.addEventListener("wheel", handleWheel, { passive: true });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("wheel", handleWheel);
    };
  }, [activeMode, galleryOpen, lightboxIndex, switchStatsMode]);

  useEffect(() => {
    lockScroll();
    return () => unlockScroll();
  }, []);

  useEffect(() => {
    if (propAscents !== undefined) setAscents(propAscents);
  }, [propAscents]);
  useEffect(() => {
    if (propPhotos !== undefined) setPhotos(propPhotos);
  }, [propPhotos]);
  useEffect(() => {
    if (propExperiences !== undefined) setExperienceRecords(propExperiences);
  }, [propExperiences]);
  useEffect(() => {
    if (propCustomExperiences !== undefined) setCustomExperiences(propCustomExperiences);
  }, [propCustomExperiences]);
  useEffect(() => {
    if (propCustomCategories !== undefined) setCustomCategories(propCustomCategories);
  }, [propCustomCategories]);

  // Parallel fallback fetch for missing datasets
  useEffect(() => {
    const client = supabase;
    if (!client || !effectiveUserId) return;
    let cancelled = false;

    const needPhotos = propPhotos === undefined && photos.length === 0;
    const needExps = propExperiences === undefined && experienceRecords.length === 0;
    const isMissingDates =
      !isTargetOther &&
      Boolean(session?.user?.id) &&
      ascents.length > 0 &&
      ascents.some((a) => !a.is_wishlist && a.achieved_on === undefined);
    const needAscents =
      !isTargetOther &&
      Boolean(session?.user?.id) &&
      (isMissingDates || (ascents.length === 0 && propAscents === undefined));

    if (!needPhotos && !needExps && !needAscents) return;

    Promise.all([
      needPhotos
        ? client
            .from("summit_photos")
            .select("id, summit_id, public_url, taken_on, caption, created_at, storage_path, shot_at")
            .eq("user_id", effectiveUserId)
            .order("taken_on", { ascending: false })
            .order("created_at", { ascending: true })
        : Promise.resolve(null),
      needExps
        ? client.from("experience_records").select("*").eq("user_id", effectiveUserId)
        : Promise.resolve(null),
      needAscents && session?.user?.id
        ? client.from("ascents").select("*").eq("user_id", session.user.id)
        : Promise.resolve(null),
    ]).then(([photosRes, expRes, ascentsRes]) => {
      if (cancelled) return;
      if (photosRes?.data) setPhotos(photosRes.data);
      if (expRes?.data && expRes.data.length > 0) setExperienceRecords(expRes.data);
      if (ascentsRes?.data && ascentsRes.data.length > 0) {
        setAscents(ascentsRes.data);
        try {
          localStorage.setItem(
            `app_tracker_ascents_${session!.user.id}`,
            JSON.stringify(ascentsRes.data)
          );
        } catch {
          /* ignore */
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    effectiveUserId,
    isTargetOther,
    session,
    propPhotos,
    propExperiences,
    propAscents,
    photos.length,
    experienceRecords.length,
    ascents,
  ]);

  const handleGoToRecord = (summitId?: string) => {
    if (!summitId) return;
    setNavigatingRecordId(summitId);
    const wasInLightbox = lightboxIndex !== null;
    setLightboxIndex(null);

    if (wasInLightbox && typeof window !== "undefined") {
      window.history.replaceState({ statsGallery: true }, "", "#galeria");
    }
    if (onGoToRecord) {
      onGoToRecord(summitId);
      return;
    }

    const loc = getLocationInfo(summitId);
    const cleanId = summitId.split("::")[0];
    const isPeak =
      loc.type === "peak" ||
      peaks.some((p) => p.id === cleanId || p.name.toLowerCase() === cleanId.toLowerCase());
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
        window.location.href = isPeak
          ? `/picos#panel=${encodeURIComponent(cleanId)}`
          : `/#panel=${encodeURIComponent(cleanId)}`;
      }
    }
  };

  const metrics = useMemo(() => computePeaksAndCountriesStats(ascents), [ascents]);
  const expMetrics = useMemo(
    () =>
      computeExperienceStats(experienceRecords, ascents, customExperiences, customCategories),
    [experienceRecords, ascents, customExperiences, customCategories]
  );
  const { visitsTimeline, peaksTimeline, experiencesTimeline } = useMemo(
    () => buildAllTimelines(ascents, experienceRecords),
    [ascents, experienceRecords]
  );

  const sortedPhotos = useMemo(() => {
    const filtered = photos.filter((p) => {
      const loc = getLocationInfo(p.summit_id);
      if (activeMode === "peaks") return loc.type === "peak";
      if (activeMode === "countries") return loc.type === "country";
      return (
        loc.type === "experience" ||
        p.summit_id?.startsWith("exp-") ||
        p.summit_id?.startsWith("custom-") ||
        experienceRecords.some((r) => r.experience_id === p.summit_id || r.id === p.summit_id)
      );
    });
    return filtered.sort((a, b) => {
      const timeA = new Date(a.taken_on || a.created_at || 0).getTime();
      const timeB = new Date(b.taken_on || b.created_at || 0).getTime();
      return sortOrder === "desc" ? timeB - timeA : timeA - timeB;
    });
  }, [photos, activeMode, experienceRecords, sortOrder]);

  const toggleRange = (id: string) =>
    setExpandedRanges((prev) => ({ ...prev, [id]: !prev[id] }));

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
      <h2
        id="stats-title"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
        }}
      >
        Estadísticas
      </h2>

      <div className="stats-sticky-top">
        <header className="stats-header stats-header--centered">
          <div className="stats-header-left">
            {activeMode !== "peaks" ? (
              <button
                type="button"
                className={`stats-exp-toggle-btn ${
                  activeMode === "experiences" ? "stats-exp-toggle-btn--active" : ""
                }`}
                onClick={handleToggleExperiences}
                aria-label={
                  activeMode === "experiences"
                    ? "Volver a países"
                    : "Ver estadísticas de experiencias"
                }
                title={
                  activeMode === "experiences"
                    ? "Volver a países"
                    : "Ver estadísticas de experiencias"
                }
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

          <div
            className={`app-mode-switch ${
              activeMode === "peaks" ? "app-mode-switch--peaks" : "app-mode-switch--countries"
            }`}
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

      <main className="stats-content">
        {activeMode === "peaks" && (
          <StatsPeaksView
            metrics={metrics}
            peaksTimeline={peaksTimeline}
            timelineCollapsed={timelineCollapsed}
            expandedRanges={expandedRanges}
            onToggleTimeline={() => setTimelineCollapsed((c) => !c)}
            onToggleRange={toggleRange}
            onOpenGallery={openGallery}
            onGoToRecord={handleGoToRecord}
          />
        )}

        {activeMode === "countries" && (
          <StatsCountriesView
            metrics={metrics}
            visitsTimeline={visitsTimeline}
            timelineCollapsed={timelineCollapsed}
            onToggleTimeline={() => setTimelineCollapsed((c) => !c)}
            onOpenGallery={openGallery}
            onGoToRecord={handleGoToRecord}
          />
        )}

        {activeMode === "experiences" && (
          <StatsExperiencesView
            expMetrics={expMetrics}
            experiencesTimeline={experiencesTimeline}
            timelineCollapsed={timelineCollapsed}
            expandedRanges={expandedRanges}
            onToggleTimeline={() => setTimelineCollapsed((c) => !c)}
            onToggleRange={toggleRange}
            onOpenGallery={openGallery}
            onGoToRecord={handleGoToRecord}
          />
        )}
      </main>

      {showNavigatingLoader && (
        <div
          className="stats-loading-overlay"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10095,
            backgroundColor:
              activeMode === "experiences"
                ? "rgba(17, 17, 27, 0.92)"
                : "rgba(250, 248, 241, 0.92)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1.25rem",
            animation: "fadeIn 0.2s ease-in",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: "atlasPulse 1.6s ease-in-out infinite",
            }}
          >
            <IconLogo style={{ width: "48px", height: "48px" }} />
          </div>
          <span
            style={{
              fontSize: "0.85rem",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              fontFamily: "var(--font-mono), monospace",
              color: activeMode === "experiences" ? "#cba6f7" : "var(--sage, #5c9b7d)",
              fontWeight: 600,
            }}
          >
            Cargando…
          </span>
        </div>
      )}

      {galleryOpen && (
        <StatsGalleryModal
          activeMode={activeMode}
          targetUsername={targetProfile?.username}
          sortedPhotos={sortedPhotos}
          sortOrder={sortOrder}
          lightboxIndex={lightboxIndex}
          onSortOrderChange={setSortOrder}
          onOpenLightbox={openLightbox}
          onIndexChange={setLightboxIndex}
          onCloseGallery={() => setGalleryOpen(false)}
          onCloseLightbox={() => setLightboxIndex(null)}
          onGoToRecord={handleGoToRecord}
        />
      )}
    </div>
  );
}
