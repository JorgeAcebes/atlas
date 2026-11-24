"use client";

import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { UserRoundCheck } from "lucide-react";
import { peaks } from "@/data/peaks";
import { getLocationInfo } from "@/lib/stats-utils";
import { IconCollectiveMap } from "@/components/icons";
import { AppTopbar } from "@/components/layout/app-topbar";
import { useAuth } from "@/components/auth-context";
import { usePendingRequests } from "@/components/use-pending-requests";
import { useHorizontalModeSwipe } from "@/hooks/use-horizontal-mode-swipe";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useRankingData, type ModeFilter, type ScopeFilter } from "@/hooks/use-ranking-data";
import { RankingTable } from "@/components/ranking/ranking-table";
import "./ranking.css";

const CollectiveMap = dynamic(
  () => import("@/components/collective-map").then((m) => m.CollectiveMap),
  { ssr: false }
);
const AuthDialog = dynamic(
  () => import("@/components/auth-dialog").then((m) => m.AuthDialog),
  { ssr: false }
);
const ProfileSettings = dynamic(
  () => import("@/components/profile-settings").then((m) => m.ProfileSettings),
  { ssr: false }
);
const StatsModal = dynamic(
  () => import("@/components/stats-modal").then((m) => m.StatsModal),
  { ssr: false }
);
const InstallPrompt = dynamic(
  () => import("@/components/install-prompt").then((m) => m.InstallPrompt),
  { ssr: false }
);

export function RankingTab({
  mode: controlledMode,
  onSwitchMode,
  onNavigate,
  isActive = true,
}: {
  mode?: "countries" | "peaks";
  onSwitchMode?: (target: "countries" | "peaks") => void;
  onNavigate?: (tab: string) => void;
  isActive?: boolean;
}) {
  const { session, profile: myProfile, refreshProfile } = useAuth();
  const hasPendingRequests = usePendingRequests();
  const enablePeaks = !myProfile || myProfile.enable_peaks !== false;
  const enableCountries = !myProfile || myProfile.enable_countries !== false;
  const hasBothModes = enablePeaks && enableCountries;

  const [mode, setMode] = useState<ModeFilter>(() =>
    enableCountries ? "countries" : "peaks"
  );
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const [showCollectiveMap, setShowCollectiveMap] = useState(false);
  const [authOpen, setAuthOpen] = useState<"login" | "register" | false>(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(() =>
    typeof window !== "undefined" ? window.location.hash === "#estadisticas" : false
  );
  const [mounted, setMounted] = useState(false);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { installPromptOpen, setInstallPromptOpen, canInstallMobile, handleHeroInstallClick } =
    usePwaInstall();

  useEffect(() => {
    setMounted(true);
    const handleHash = () => setStatsOpen(window.location.hash === "#estadisticas");
    window.addEventListener("hashchange", handleHash);
    window.addEventListener("popstate", handleHash);
    return () => {
      window.removeEventListener("hashchange", handleHash);
      window.removeEventListener("popstate", handleHash);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const urlChallenge = new URLSearchParams(window.location.search).get("challenge");
      if (urlChallenge === "peaks" && enablePeaks) {
        setMode("peaks");
      } else if (urlChallenge === "countries" && enableCountries) {
        setMode("countries");
      } else {
        const savedActive = localStorage.getItem("last_active_mode") as ModeFilter | null;
        const saved = localStorage.getItem("ranking_mode") as ModeFilter | null;
        if (savedActive === "peaks" && enablePeaks) setMode("peaks");
        else if (savedActive === "countries" && enableCountries) setMode("countries");
        else if (saved === "peaks" && enablePeaks) setMode("peaks");
        else if (saved === "countries" && enableCountries) setMode("countries");
      }
    } catch {
      /* ignore */
    }
  }, [enablePeaks, enableCountries]);

  useEffect(() => {
    if (controlledMode && controlledMode !== mode) {
      if (controlledMode === "peaks" && enablePeaks) setMode("peaks");
      else if (controlledMode === "countries" && enableCountries) setMode("countries");
    }
  }, [controlledMode, enablePeaks, enableCountries, mode]);

  useEffect(() => {
    if (!enablePeaks && mode === "peaks") setMode("countries");
    else if (!enableCountries && mode === "countries") setMode("peaks");
  }, [enablePeaks, enableCountries, mode]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ranking_mode", mode);
    }
  }, [mode]);

  const switchMode = useCallback(
    (target: ModeFilter) => {
      if (target === mode) return;
      if (target === "peaks" && !enablePeaks) return;
      if (target === "countries" && !enableCountries) return;
      setMode(target);
      if (typeof window !== "undefined") {
        localStorage.setItem("ranking_mode", target);
        localStorage.setItem("last_active_mode", target);
        localStorage.setItem("last_map_path", target === "peaks" ? "/picos" : "/");
        try {
          const url = new URL(window.location.href);
          url.searchParams.set("challenge", target);
          window.history.replaceState(null, "", url.toString());
        } catch {
          /* ignore */
        }
      }
      onSwitchMode?.(target);
    },
    [mode, enablePeaks, enableCountries, onSwitchMode]
  );

  const { handleTouchStart: handleSwipeTouchStart, handleTouchEnd: handleSwipeTouchEnd } =
    useHorizontalModeSwipe({
      isActive,
      isPeaks: mode === "peaks",
      canShowPeaks: enablePeaks,
      canShowCountries: enableCountries,
      onSwitchMode: switchMode,
    });

  const { entries, rankedEntries, loading, myEntry, myRank, cachedCount } = useRankingData({
    mode,
    scope,
    session,
    enablePeaks,
    enableCountries,
    isActive,
  });

  const totalPossible = mode === "peaks" ? 47 : 196;
  const unit = mode === "peaks" ? "picos" : "países";

  const filteredEntries = useMemo(() => {
    if (!deferredSearchQuery.trim()) return rankedEntries;
    const clean = deferredSearchQuery.trim().toLowerCase().replace(/^@/, "");
    return rankedEntries.filter((e) => e.username.toLowerCase().includes(clean));
  }, [rankedEntries, deferredSearchQuery]);

  const scrollToMyPosition = () => {
    if (!session?.user?.id) return;
    if (searchQuery.trim()) setSearchQuery("");
    const targetId = `ranking-row-${session.user.id}`;
    const runScroll = () => {
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
        targetEl.classList.remove("ranking-row--highlighted");
        void targetEl.offsetWidth;
        targetEl.classList.add("ranking-row--highlighted");
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = setTimeout(() => {
          targetEl.classList.remove("ranking-row--highlighted");
        }, 1200);
      }
    };

    if (scope === "following" && !myEntry) {
      setScope("all");
      setTimeout(runScroll, 150);
    } else {
      setTimeout(runScroll, 50);
    }
  };

  return (
    <main className={`ranking-theme ${mode === "countries" ? "mode-countries" : ""}`}>
      <AppTopbar
        activeTab="ranking"
        mode={mode}
        hasBothModes={hasBothModes}
        session={session}
        myProfile={myProfile}
        mounted={mounted}
        hasPendingRequests={hasPendingRequests}
        canInstallMobile={canInstallMobile}
        onSwitchMode={switchMode}
        onNavigate={onNavigate}
        onOpenStats={() => {
          window.location.hash = "estadisticas";
          setStatsOpen(true);
        }}
        onInstallClick={handleHeroInstallClick}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenAuth={() => setAuthOpen("login")}
      />

      <section
        id="inicio"
        className="hero"
        onTouchStart={handleSwipeTouchStart}
        onTouchEnd={handleSwipeTouchEnd}
      >
        <div className="hero-main hero-main--ranking">
          <div className="ranking-hero-aside">
            {session && myRank ? (
              <button
                type="button"
                className="ranking-hero-rank-btn"
                onClick={scrollToMyPosition}
                title="Haz clic para ver tu posición en la tabla de clasificación"
              >
                <strong>
                  <span>#{myRank}</span>
                  <small> / {entries.length}</small>
                </strong>
                <span className="ranking-hero-rank-label">
                  {scope === "following" ? "tu posición entre seguidos" : "tu posición global"}
                </span>
              </button>
            ) : session && !myEntry ? (
              <div className="hero-stat">
                <strong>
                  <span>—</span>
                  <small> / {entries.length}</small>
                </strong>
                <span>sin registros en este reto</span>
              </div>
            ) : (
              <div className="hero-stat">
                <strong>
                  <span>
                    {loading && entries.length === 0
                      ? "..."
                      : scope === "all"
                        ? entries.length
                        : cachedCount ?? entries.length}
                  </span>
                </strong>
                <span>
                  {mode === "peaks" ? "escaladores en el ranking" : "exploradores en el ranking"}
                </span>
              </div>
            )}
          </div>
        </div>

        {hasBothModes && (
          <div
            className={`app-mode-switch hide-on-desktop ${
              mode === "peaks" ? "app-mode-switch--peaks" : "app-mode-switch--countries"
            }`}
            style={{ marginTop: 10, display: "flex", width: "fit-content" }}
            onTouchStart={handleSwipeTouchStart}
            onTouchEnd={handleSwipeTouchEnd}
          >
            <div className="app-mode-switch__indicator" />
            <button
              type="button"
              className={`app-mode-btn ${mode === "peaks" ? "active" : ""}`}
              onClick={() => switchMode("peaks")}
            >
              47 Picos
            </button>
            <button
              type="button"
              className={`app-mode-btn ${mode === "countries" ? "active" : ""}`}
              onClick={() => switchMode("countries")}
            >
              196 Países
            </button>
          </div>
        )}
      </section>

      <section
        className="page-container ranking-main-container"
        style={{
          paddingTop: "14px",
          paddingBottom: "70px",
          paddingLeft: "16px",
          paddingRight: "16px",
        }}
      >
        <div style={{ maxWidth: "680px", margin: "0 auto", width: "100%" }}>
          <div className="social-feed-controls">
            <div className="social-feed-controls-left">
              <div className="social-search-box ranking-search-box">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="social-search-icon ranking-search-icon"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="search"
                  placeholder="Usuario..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="social-search-input ranking-search-input"
                  aria-label="Buscar usuario en el ranking"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="social-search-clear ranking-search-clear"
                    onClick={() => setSearchQuery("")}
                    title="Limpiar búsqueda"
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                type="button"
                className={`social-following-btn ${
                  scope === "following" ? "social-following-btn--active" : ""
                }`}
                onClick={() => {
                  if (!session) {
                    setAuthOpen("login");
                    return;
                  }
                  setScope(scope === "following" ? "all" : "following");
                }}
                title={scope === "following" ? "Ver clasificación global" : "Ver solo a quienes sigues"}
                aria-pressed={scope === "following"}
              >
                <UserRoundCheck size={14} className="social-following-icon" />
                <span>Siguiendo</span>
              </button>
            </div>

            {((mode === "countries" && enableCountries) || (mode === "peaks" && enablePeaks)) && (
              <div className="ranking-feed-controls-right">
                <button
                  type="button"
                  className="collective-map-ethereal-btn"
                  onClick={() => setShowCollectiveMap(true)}
                  title={
                    mode === "peaks"
                      ? "Abrir mapa colectivo de picos"
                      : "Abrir mapa colectivo de países"
                  }
                  aria-label={
                    mode === "peaks"
                      ? "Abrir mapa colectivo de picos"
                      : "Abrir mapa colectivo de países"
                  }
                >
                  <IconCollectiveMap size={14} />
                  <span>Mapa colectivo</span>
                </button>
              </div>
            )}
          </div>

          <RankingTable
            entries={filteredEntries}
            mode={mode}
            scope={scope}
            session={session}
            loading={loading}
            searchQuery={searchQuery}
            totalPossible={totalPossible}
            unit={unit}
          />
        </div>
      </section>

      {showCollectiveMap && (
        <CollectiveMap
          mode={mode}
          scope={scope}
          onScopeChange={setScope}
          onClose={() => setShowCollectiveMap(false)}
        />
      )}
      {authOpen && (
        <AuthDialog
          onClose={() => setAuthOpen(false)}
          initialTab={authOpen === "login" ? "login" : "register"}
        />
      )}
      {profileOpen && session && (
        <ProfileSettings
          session={session}
          onClose={() => setProfileOpen(false)}
          onProfileUpdate={() => refreshProfile()}
        />
      )}
      {statsOpen && (
        <StatsModal
          session={session}
          myProfile={myProfile}
          initialMode={mode}
          onModeChange={(newMode) => {
            if (newMode === "peaks" && enablePeaks) setMode("peaks");
            else if (newMode === "countries" && enableCountries) setMode("countries");
          }}
          onClose={() => {
            if (
              window.location.hash === "#estadisticas" ||
              window.location.hash === "#galeria" ||
              window.location.hash === "#lightbox"
            ) {
              window.history.back();
            }
            setStatsOpen(false);
          }}
          onGoToRecord={(summitId) => {
            setStatsOpen(false);
            const loc = getLocationInfo(summitId);
            const cleanId = summitId.split("::")[0];
            const isPeak =
              loc.type === "peak" ||
              peaks.some((p) => p.id === cleanId || p.name.toLowerCase() === cleanId.toLowerCase());
            const targetPath = isPeak
              ? `/picos#panel=${encodeURIComponent(cleanId)}`
              : `/#panel=${encodeURIComponent(cleanId)}`;
            if (onNavigate) onNavigate(targetPath);
            else window.location.href = targetPath;
          }}
        />
      )}
      <InstallPrompt
        isActive={isActive}
        manualOpen={installPromptOpen}
        onManualClose={() => setInstallPromptOpen(false)}
      />
    </main>
  );
}
