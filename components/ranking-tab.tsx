"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import dynamic from "next/dynamic";
import { AuthDialog } from "@/components/auth-dialog";
import { IconLogo, IconCollectiveMap } from "@/components/icons";
import { useAuth } from "./auth-context";
import { ProfileSettings } from "./profile-settings";
import { usePendingRequests } from "./use-pending-requests";
import { UserRoundCheck } from "lucide-react";
import "./ranking.css";

const CollectiveMap = dynamic(
  () => import("@/components/collective-map").then((mod) => mod.CollectiveMap),
  { ssr: false }
);

type RankingEntry = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  ascents_count: number;
};

type ContinentFilter = "Todos" | "África" | "América" | "Asia" | "Europa" | "Oceanía";
type ScopeFilter = "all" | "following";
type ModeFilter = "countries" | "peaks";

const globalRankingCache: Record<string, RankingEntry[]> = {};
let globalRankingLastFetched: Record<string, number> = {};
// Invariant 8.1: Test profiles are excluded from get_user_ranking (is_test IS NOT TRUE) and user counts with .neq('is_test', true)
const cachedRankingCount: Record<ModeFilter, number | null> = { countries: null, peaks: null };
const RANKING_CACHE_TTL = 60 * 1000;

export function RankingTab({ 
  onNavigate, 
  isActive = true 
}: { 
  onNavigate?: (tab: string) => void;
  isActive?: boolean;
}) {
  const { session, profile: myProfile, refreshProfile } = useAuth();
  const enablePeaks = !myProfile || myProfile.enable_peaks !== false;
  const enableCountries = !myProfile || myProfile.enable_countries !== false;
  const hasBothModes = enablePeaks && enableCountries;

  const [mode, setMode] = useState<ModeFilter>(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const urlChallenge = urlParams.get("challenge") as ModeFilter | null;
      if (urlChallenge === "peaks" && enablePeaks) return "peaks";
      if (urlChallenge === "countries" && enableCountries) return "countries";

      const savedActive = localStorage.getItem("last_active_mode") as ModeFilter | null;
      if (savedActive === "peaks" && enablePeaks) return "peaks";
      if (savedActive === "countries" && enableCountries) return "countries";

      const saved = localStorage.getItem("ranking_mode") as ModeFilter | null;
      if (saved === "countries" && enableCountries) return "countries";
      if (saved === "peaks" && enablePeaks) return "peaks";
    }
    return enableCountries ? "countries" : "peaks";
  });
  const [scope, setScope] = useState<ScopeFilter>("all");
  
  const initialCacheKey = `${mode}-${scope}-${session?.user?.id || 'anon'}`;
  const [entries, setEntries] = useState<RankingEntry[]>(() => globalRankingCache[initialCacheKey] || []);
  const [loading, setLoading] = useState(() => !globalRankingCache[initialCacheKey]);
  
  const hasPendingRequests = usePendingRequests();
  const [mounted, setMounted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mapLink, setMapLink] = useState("/");
  const [showCollectiveMap, setShowCollectiveMap] = useState(false);
  const [authOpen, setAuthOpen] = useState<"login" | "register" | false>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!enablePeaks && mode === "peaks") {
      setMode("countries");
      if (typeof window !== "undefined") localStorage.setItem("ranking_mode", "countries");
    } else if (!enableCountries && mode === "countries") {
      setMode("peaks");
      if (typeof window !== "undefined") localStorage.setItem("ranking_mode", "peaks");
    }
  }, [enablePeaks, enableCountries, mode]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      let stored = localStorage.getItem("last_map_path") || "/";
      if (!enablePeaks && stored === "/picos") stored = "/";
      if (!enableCountries && stored === "/") stored = "/picos";
      if (stored !== "/" && stored !== "/picos") stored = enablePeaks ? "/picos" : "/";
      setMapLink(stored);
    }
  }, [enablePeaks, enableCountries]);

  useEffect(() => {
    if (!isActive) return;
    let ignore = false;

    async function fetchRanking() {
      const cacheKey = `${mode}-${scope}-${session?.user?.id || 'anon'}`;
      const now = Date.now();
      const isFresh = globalRankingCache[cacheKey] && (now - (globalRankingLastFetched[cacheKey] || 0) < RANKING_CACHE_TTL);

      if (globalRankingCache[cacheKey]) {
        setEntries(globalRankingCache[cacheKey]);
        setLoading(false);
      } else {
        setLoading(true);
      }

      if (isFresh) {
        // Prefetch opposite mode in background if not already cached and enabled
        const otherMode: ModeFilter = mode === "countries" ? "peaks" : "countries";
        const canPrefetchOther = otherMode === "peaks" ? enablePeaks : enableCountries;
        const otherKey = `${otherMode}-${scope}-${session?.user?.id || 'anon'}`;
        if (canPrefetchOther && !globalRankingCache[otherKey] && supabase) {
          Promise.resolve(
            supabase.rpc("get_user_ranking", {
              p_summit_ids: null,
              p_following_only: scope === "following",
              p_follower: session?.user?.id || null,
              p_mode: otherMode
            })
          ).then(({ data }) => {
            if (data && !ignore) {
              const res = (data as RankingEntry[]) || [];
              globalRankingCache[otherKey] = res;
              globalRankingLastFetched[otherKey] = Date.now();
              if (scope === "all") {
                cachedRankingCount[otherMode] = res.length;
              }
            }
          }).catch(() => {});
        }
        return;
      }

      try {
        let summitIds: string[] | null = null;

        const { data, error } = await supabase!.rpc("get_user_ranking", {
          p_summit_ids: summitIds,
          p_following_only: scope === "following",
          p_follower: session?.user?.id || null,
          p_mode: mode
        });

        if (ignore) return;

        if (error) {
          console.error("Error fetching ranking:", error);
          if (!globalRankingCache[cacheKey]) {
            setEntries([]);
          }
        } else {
          const result = (data as RankingEntry[]) || [];
          globalRankingCache[cacheKey] = result;
          globalRankingLastFetched[cacheKey] = Date.now();
          setEntries(result);
          if (scope === "all") {
            cachedRankingCount[mode] = result.length;
          }
        }

        // Also prefetch alternate mode in background if enabled
        const otherMode: ModeFilter = mode === "countries" ? "peaks" : "countries";
        const canPrefetchOther = otherMode === "peaks" ? enablePeaks : enableCountries;
        const otherKey = `${otherMode}-${scope}-${session?.user?.id || 'anon'}`;
        if (canPrefetchOther && !globalRankingCache[otherKey] && supabase) {
          Promise.resolve(
            supabase.rpc("get_user_ranking", {
              p_summit_ids: null,
              p_following_only: scope === "following",
              p_follower: session?.user?.id || null,
              p_mode: otherMode
            })
          ).then(({ data: altData }) => {
            if (altData && !ignore) {
              const altResult = (altData as RankingEntry[]) || [];
              globalRankingCache[otherKey] = altResult;
              globalRankingLastFetched[otherKey] = Date.now();
              if (scope === "all") {
                cachedRankingCount[otherMode] = altResult.length;
              }
            }
          }).catch(() => {});
        }
      } catch (err) {
        if (!ignore) console.error(err);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    if (supabase) {
      fetchRanking();
    }

    return () => {
      ignore = true;
    };
  }, [mode, scope, session?.user?.id, isActive]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ranking_mode", mode);
    }
  }, [mode]);

  const [searchQuery, setSearchQuery] = useState("");

  function switchMode(target: ModeFilter) {
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
      } catch { /* ignore */ }
    }
    setMapLink(target === "peaks" ? "/picos" : "/");
  }

  const swipeTouchStartX = useRef<number | null>(null);
  const swipeTouchStartY = useRef<number | null>(null);

  const handleSwipeTouchStart = (e: React.TouchEvent) => {
    swipeTouchStartX.current = e.touches[0].clientX;
    swipeTouchStartY.current = e.touches[0].clientY;
  };

  const handleSwipeTouchEnd = (e: React.TouchEvent) => {
    if (swipeTouchStartX.current === null || swipeTouchStartY.current === null) return;
    const diffX = e.changedTouches[0].clientX - swipeTouchStartX.current;
    const diffY = e.changedTouches[0].clientY - swipeTouchStartY.current;
    if (Math.abs(diffX) > 35 && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX > 0 && mode === "peaks") {
        switchMode("countries");
      } else if (diffX < 0 && mode === "countries") {
        switchMode("peaks");
      }
    }
    swipeTouchStartX.current = null;
    swipeTouchStartY.current = null;
  };

  const totalPossible = mode === "peaks" ? 47 : 196;
  const unit = mode === "peaks" ? "picos" : "países";

  const handleScopeChange = (newScope: ScopeFilter) => {
    setScope(newScope);
  };

  const rankedEntries = useMemo(() => {
    let currentRank = 1;
    return entries.map((entry, index) => {
      if (index > 0 && entry.ascents_count < entries[index - 1].ascents_count) {
        currentRank = index + 1;
      }
      return { ...entry, rank: currentRank };
    });
  }, [entries]);

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return rankedEntries;
    const clean = searchQuery.trim().toLowerCase().replace(/^@/, "");
    return rankedEntries.filter((e) =>
      e.username.toLowerCase().includes(clean)
    );
  }, [rankedEntries, searchQuery]);

  const myEntry = session ? entries.find((e) => e.user_id === session.user.id) : null;
  const myRank = session && myEntry ? rankedEntries.find((e) => e.user_id === session.user.id)?.rank : null;

  function scrollToMyPosition() {
    if (!session?.user?.id) return;
    if (searchQuery.trim()) {
      setSearchQuery("");
    }
    const targetId = `ranking-row-${session.user.id}`;
    const runScroll = () => {
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
        targetEl.classList.remove("ranking-row--highlighted");
        void targetEl.offsetWidth;
        targetEl.classList.add("ranking-row--highlighted");
        setTimeout(() => {
          targetEl.classList.remove("ranking-row--highlighted");
        }, 1200);
      }
    };

    if (scope === "following" && !myEntry) {
      handleScopeChange("all");
      setTimeout(runScroll, 150);
    } else {
      setTimeout(runScroll, 50);
    }
  }

  return (
    <main className={`ranking-theme ${mode === "countries" ? "mode-countries" : ""}`}>
      {/* ── Standard Topbar ────────────────── */}
      <header className="topbar">
        <Link className="brand" href={mapLink} title="Atlas" aria-label="Atlas">
          <IconLogo className="brand-icon" />
          <span>
            <b>Atlas</b>
          </span>
        </Link>

        {hasBothModes && (
          <div className={`app-mode-switch hide-on-mobile ${mode === "peaks" ? "app-mode-switch--peaks" : "app-mode-switch--countries"}`}>
            <div className="app-mode-switch__indicator" />
            <button
              className={`app-mode-btn ${mode === "peaks" ? "active" : ""}`}
              onClick={() => switchMode("peaks")}
            >
              47 Picos
            </button>
            <button
              className={`app-mode-btn ${mode === "countries" ? "active" : ""}`}
              onClick={() => switchMode("countries")}
            >
              196 Países
            </button>
          </div>
        )}

        <nav>
          <Link href={mapLink} prefetch={true} className="topbar-nav-link topbar-nav-link--mapa">Mapa</Link>
          <Link href={`/social?challenge=${mode}`} prefetch={true} className="topbar-nav-link topbar-nav-link--social" style={{ position: 'relative' }}>
            Social
            {hasPendingRequests ? (
              <span 
                style={{ 
                  position: 'absolute', 
                  top: '-2px', 
                  right: '-6px', 
                  width: '8px', 
                  height: '8px', 
                  backgroundColor: 'red', 
                  borderRadius: '50%',
                  pointerEvents: 'none'
                }} 
              />
            ) : null}
          </Link>
          <Link href={`/ranking?challenge=${mode}`} prefetch={true} className="topbar-nav-link topbar-nav-link--ranking topbar-nav-link--active">Ranking</Link>
          {(myProfile || session) ? (
            <button
              className="account-button"
              aria-label="Mi Perfil"
              title="Mi Perfil"
              onClick={() => setProfileOpen(true)}
            >
              {myProfile?.avatar_url ? (
                <img
                  src={myProfile.avatar_url}
                  alt="Mi Perfil"
                  className="account-avatar"
                  style={{ objectFit: "cover" }}
                />
              ) : (
                <span className="account-avatar">
                  {myProfile?.username?.slice(0, 1).toUpperCase() || "?"}
                </span>
              )}
            </button>
          ) : !mounted ? (
            <div className="account-button-placeholder" style={{ width: 38, height: 38, borderRadius: "50%" }} />
          ) : (
            <button className="button button--outline" onClick={() => setAuthOpen("login")}>
              Entrar
            </button>
          )}
        </nav>
      </header>

      {/* ── Franja Vertebral (Hero) ────────────────── */}
      <section id="inicio" className="hero">
        <div className="hero-main hero-main--ranking">
          <div className="hero-title-wrap hero-title-wrap--motto hide-on-mobile">
            <h1>
              {mode === "peaks" ? (
                <>
                  Los techos de España.
                  <br />
                  <em>El podio de cumbres.</em>
                </>
              ) : (
                <>
                  Los grandes viajeros.
                  <br />
                  <em>El podio mundial.</em>
                </>
              )}
            </h1>
          </div>

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
                  <span>{loading && entries.length === 0 ? "..." : (scope === "all" ? entries.length : (cachedRankingCount[mode] ?? entries.length))}</span>
                </strong>
                <span>{mode === "peaks" ? "escaladores en el ranking" : "exploradores en el ranking"}</span>
              </div>
            )}
          </div>
        </div>

        {hasBothModes && (
          <div
            className={`app-mode-switch hide-on-desktop ${mode === "peaks" ? "app-mode-switch--peaks" : "app-mode-switch--countries"}`}
            style={{ marginTop: 10, display: "flex", width: "fit-content" }}
            onTouchStart={handleSwipeTouchStart}
            onTouchEnd={handleSwipeTouchEnd}
          >
            <div className="app-mode-switch__indicator" />
            <button
              className={`app-mode-btn ${mode === "peaks" ? "active" : ""}`}
              onClick={() => switchMode("peaks")}
            >
              47 Picos
            </button>
            <button
              className={`app-mode-btn ${mode === "countries" ? "active" : ""}`}
              onClick={() => switchMode("countries")}
            >
              196 Países
            </button>
          </div>
        )}
      </section>

      {/* ── Stable Ranking Container ────────────────── */}
      <section className="page-container ranking-main-container" style={{ paddingTop: '14px', paddingBottom: '70px', paddingLeft: '16px', paddingRight: '16px' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', width: '100%' }}>
          {/* Feed Controls: Search pill & Following button (Left) identical to Social */}
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
                className={`social-following-btn ${scope === "following" ? "social-following-btn--active" : ""}`}
                onClick={() => {
                  if (!session) {
                    setAuthOpen("login");
                    return;
                  }
                  handleScopeChange(scope === "following" ? "all" : "following");
                }}
                title={scope === "following" ? "Ver clasificación global" : "Ver solo a quienes sigues"}
                aria-pressed={scope === "following"}
              >
                <UserRoundCheck size={14} className="social-following-icon" />
                <span>Siguiendo</span>
              </button>
            </div>

            {mode === "countries" && enableCountries && (
              <div className="ranking-feed-controls-right">
                <button
                  type="button"
                  className="collective-map-ethereal-btn"
                  onClick={() => setShowCollectiveMap(true)}
                  title="Abrir mapa colectivo de países"
                  aria-label="Abrir mapa colectivo de países"
                >
                  <IconCollectiveMap size={14} />
                  <span>Mapa colectivo</span>
                </button>
              </div>
            )}
          </div>

          <section id="tabla" className="ranking-table-container">
            <div className="ranking-table-head">
              <span>#</span>
              <span>{mode === "peaks" ? "Escalador" : "Explorador"}</span>
              <span>Avance</span>
            </div>

            <div>
              {scope === 'following' && !session ? (
                <div className="ranking-empty-msg">
                  Inicia sesión para ver a quién sigues.
                </div>
              ) : loading ? (
                <div className="ranking-empty-msg">Cargando clasificación...</div>
              ) : filteredEntries.length === 0 ? (
                <div className="ranking-empty-msg">
                  {searchQuery
                    ? `No se encontró a nadie con "${searchQuery}"`
                    : scope === 'following'
                      ? "Aún no sigues a nadie con registros en este reto."
                      : "No hay resultados para este filtro todavía."}
                </div>
              ) : (
                filteredEntries.map((entry) => {
                  const currentRank = entry.rank;
                  const medalClass = currentRank === 1 ? ' rank-gold' : currentRank === 2 ? ' rank-silver' : currentRank === 3 ? ' rank-bronze' : '';
                  const pct = Math.round((entry.ascents_count / totalPossible) * 100);
                  const initial = entry.username ? entry.username.charAt(0).toUpperCase() : "?";
                  const isMe = session?.user?.id === entry.user_id;

                  return (
                    <Link
                      key={entry.user_id}
                      id={`ranking-row-${entry.user_id}`}
                      href={`/perfil/${entry.username}?challenge=${mode}`}
                      className={`ranking-row${medalClass} ${isMe ? 'ranking-row--me' : ''}`}
                    >
                      <div className="ranking-rank-num">{String(currentRank).padStart(2, '0')}</div>
                      <div className="ranking-who">
                        <div className="ranking-avatar">
                          {entry.avatar_url ? (
                            <img src={entry.avatar_url} alt={entry.username} />
                          ) : (
                            initial
                          )}
                        </div>
                        <div className="ranking-who-text">
                          <span className="ranking-who-name">
                            @{entry.username}
                          </span>
                        </div>
                      </div>
                      <div className="ranking-stats-col">
                        <div className="ranking-countries-count">{entry.ascents_count} / {totalPossible} {unit}</div>
                        <div className="ranking-bar-track">
                          <div className="ranking-bar-fill" style={{ width: `${pct}%` }}></div>
                        </div>
                        <span className="ranking-pct">{pct}% completado</span>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </section>

      {showCollectiveMap && (
        <CollectiveMap
          scope={scope}
          onScopeChange={handleScopeChange}
          onClose={() => setShowCollectiveMap(false)}
        />
      )}
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} initialTab={authOpen === "login" ? "login" : "register"} />}
      {profileOpen && session && (
        <ProfileSettings
          session={session}
          onClose={() => setProfileOpen(false)}
          onProfileUpdate={() => refreshProfile()}
        />
      )}
    </main>
  );
}
