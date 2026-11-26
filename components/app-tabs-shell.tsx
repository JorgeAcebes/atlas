"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SummitTracker } from "@/components/summit-tracker";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { isStandalone } from "@/components/install-prompt";
import { resetScrollLock } from "@/lib/scroll-lock";
import type { SocialTab as SocialTabType } from "@/components/social-tab";
import type { RankingTab as RankingTabType } from "@/components/ranking-tab";

type SocialTabComponent = typeof SocialTabType;
type RankingTabComponent = typeof RankingTabType;

let resolvedSocialTab: SocialTabComponent | null = null;
let socialTabPromise: Promise<SocialTabComponent> | null = null;
let resolvedRankingTab: RankingTabComponent | null = null;
let rankingTabPromise: Promise<RankingTabComponent> | null = null;

function loadSocialTab(): Promise<SocialTabComponent> {
  if (resolvedSocialTab) return Promise.resolve(resolvedSocialTab);
  if (!socialTabPromise) {
    socialTabPromise = import("@/components/social-tab")
      .then((mod) => {
        resolvedSocialTab = mod.SocialTab;
        return mod.SocialTab;
      })
      .catch((err) => {
        socialTabPromise = null;
        throw err;
      });
  }
  return socialTabPromise;
}

function loadRankingTab(): Promise<RankingTabComponent> {
  if (resolvedRankingTab) return Promise.resolve(resolvedRankingTab);
  if (!rankingTabPromise) {
    rankingTabPromise = import("@/components/ranking-tab")
      .then((mod) => {
        resolvedRankingTab = mod.RankingTab;
        return mod.RankingTab;
      })
      .catch((err) => {
        rankingTabPromise = null;
        throw err;
      });
  }
  return rankingTabPromise;
}

function isStatsHash(hash: string): boolean {
  return hash === "#estadisticas" || hash === "#galeria" || hash === "#lightbox";
}

type MainTab = "map" | "social" | "ranking";
type ChallengeMode = "peaks" | "countries";

function getTabFromPath(path: string): MainTab | null {
  if (path === "/" || path === "/picos" || path === "/paises") return "map";
  if (path.startsWith("/social")) return "social";
  if (path.startsWith("/ranking")) return "ranking";
  return null;
}

function getInitialMode(pathname: string): ChallengeMode {
  if (pathname === "/picos") return "peaks";
  if (pathname === "/" || pathname === "/paises") return "countries";
  if (typeof window !== "undefined") {
    try {
      const params = new URLSearchParams(window.location.search);
      const ch = params.get("challenge");
      if (ch === "peaks") return "peaks";
      if (ch === "countries") return "countries";
      const saved = localStorage.getItem("last_active_mode");
      if (saved === "peaks") return "peaks";
      if (saved === "countries") return "countries";
      const mapPath = localStorage.getItem("last_map_path");
      if (mapPath === "/picos") return "peaks";
      const rankMode = localStorage.getItem("ranking_mode");
      if (rankMode === "peaks") return "peaks";
      if (rankMode === "countries") return "countries";
    } catch {
      /* ignore */
    }
  }
  return "countries";
}

function getInitialExperiencesMode(): boolean {
  if (typeof window !== "undefined") {
    try {
      const params = new URLSearchParams(window.location.search);
      const view = params.get("view");
      const ch = params.get("challenge");
      if (view === "experiences" || ch === "experiences") return true;
      const saved = localStorage.getItem("myExperiencesMode");
      if (saved === "true") return true;
      if (saved === "false") return false;
    } catch {
      /* ignore */
    }
  }
  return false;
}

function AppTabsShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const initialTab = getTabFromPath(pathname) || "map";
  const [activeTab, setActiveTab] = useState<MainTab>(initialTab);
  const [visitedTabs, setVisitedTabs] = useState<Set<MainTab>>(() => new Set([initialTab]));
  const [sharedMode, setSharedMode] = useState<ChallengeMode>(() => (pathname === "/picos" ? "peaks" : "countries"));
  const [sharedExperiencesMode, setSharedExperiencesMode] = useState<boolean>(false);
  const [SocialTabComp, setSocialTabComp] = useState<SocialTabComponent | null>(() => resolvedSocialTab);
  const [RankingTabComp, setRankingTabComp] = useState<RankingTabComponent | null>(() => resolvedRankingTab);
  const sharedModeRef = React.useRef<ChallengeMode>(sharedMode);
  sharedModeRef.current = sharedMode;
  const sharedExperiencesRef = React.useRef<boolean>(sharedExperiencesMode);
  sharedExperiencesRef.current = sharedExperiencesMode;
  const navRequestIdRef = React.useRef(0);
  const lastHashRef = React.useRef<string>(typeof window !== "undefined" ? window.location.hash : "");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone = isStandalone();
    const alreadyInstalled = typeof localStorage !== "undefined" && localStorage.getItem("pwa_app_installed") === "true";
    if (standalone || alreadyInstalled) {
      document.documentElement.classList.add("is-pwa");
      try { localStorage.setItem("pwa_app_installed", "true"); } catch {}
    }
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted || typeof document === "undefined") return;
      const hasActiveOverlay = document.querySelector(
        ".modal-backdrop, .profile-modal-backdrop, .stats-overlay, .lightbox-backdrop, .install-prompt-overlay, .collective-map-overlay"
      );
      if (!hasActiveOverlay) {
        resetScrollLock();
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    lastHashRef.current = window.location.hash;
    const onHashChange = () => {
      lastHashRef.current = window.location.hash;
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (activeTab === "social" && !SocialTabComp) {
      void loadSocialTab()
        .then((Comp) => {
          if (!cancelled) setSocialTabComp(() => Comp);
        })
        .catch(() => {});
    } else if (activeTab === "ranking" && !RankingTabComp) {
      void loadRankingTab()
        .then((Comp) => {
          if (!cancelled) setRankingTabComp(() => Comp);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [activeTab, SocialTabComp, RankingTabComp]);

  // Pre-warm lazy tab JS bundles & background caches on idle without mounting hidden component trees
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const warmChunks = () => {
      if (cancelled) return;
      if (initialTab !== "social") {
        void loadSocialTab()
          .then((Comp) => {
            if (!cancelled) setSocialTabComp(() => Comp);
          })
          .catch(() => {});
        void import("@/components/feed-tab").then((m) => m.prefetchFeedInBackground?.());
      }
      if (initialTab !== "ranking") {
        void loadRankingTab()
          .then((Comp) => {
            if (!cancelled) setRankingTabComp(() => Comp);
          })
          .catch(() => {});
        void import("@/hooks/use-ranking-data").then((m) =>
          m.prefetchRankingInBackground?.(sharedModeRef.current)
        );
      }
      if (initialTab === "map") {
        if (sharedModeRef.current === "countries") {
          void import("@/components/spain-map");
          void import("@/lib/geo-loader").then((m) => m.fetchSpainGeo().catch(() => {}));
        } else {
          void import("@/components/world-map");
          void import("@/lib/geo-loader").then((m) => m.fetchWorldGeo().catch(() => {}));
        }
      }
      void import("@/components/profile-settings").catch(() => {});
    };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(warmChunks, { timeout: 1200 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }
    const timer = setTimeout(warmChunks, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [initialTab]);

  useEffect(() => {
    if (isPopStateRef.current) return;
    if (getInitialExperiencesMode()) {
      setSharedExperiencesMode(true);
    }
    const m = getInitialMode(pathname);
    if (m !== "countries" && pathname !== "/" && pathname !== "/paises") {
      setSharedMode(m);
    }
  }, [pathname]);

  const isMainRoute = getTabFromPath(pathname) !== null;

  const historyScrollPositions = React.useRef<Map<string, number>>(new Map());
  const isPopStateRef = React.useRef(false);
  const lastPathRef = React.useRef(pathname);
  const activeTabRef = React.useRef<MainTab>(activeTab);

  const resetScrollToTop = useCallback((smooth = false) => {
    if (typeof window === "undefined") return;
    if (window.location.hash && window.location.hash !== "#") {
      return;
    }
    if (!smooth) {
      if (window.scrollY === 0) return;
      const root = document.documentElement;
      const prevBehavior = root ? root.style.scrollBehavior : "";
      if (root) root.style.scrollBehavior = "auto";
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      if (root) root.style.scrollBehavior = prevBehavior;
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      if (typeof window === "undefined") return;
      const key = window.location.pathname + window.location.search;
      historyScrollPositions.current.set(key, window.scrollY);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Sync state when pathname changes via Next router
  useEffect(() => {
    const prevPath = lastPathRef.current;
    lastPathRef.current = pathname;

    if (isPopStateRef.current) {
      return;
    }

    const tab = getTabFromPath(pathname);
    if (tab) {
      const prevTab = activeTabRef.current;
      setActiveTab(tab);
      activeTabRef.current = tab;

      let detectedMode: ChallengeMode | null = null;
      if (pathname === "/picos") {
        detectedMode = "peaks";
      } else if (pathname === "/" || pathname === "/paises") {
        detectedMode = "countries";
      } else if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const ch = params.get("challenge");
        if (ch === "peaks" || ch === "countries") {
          detectedMode = ch;
        }
      }
      if (detectedMode) {
        setSharedMode(detectedMode);
      }

      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const view = params.get("view");
        const ch = params.get("challenge");
        if (view === "experiences" || ch === "experiences") {
          setSharedExperiencesMode(true);
        }
      }

      if (pathname !== prevPath || tab !== prevTab) {
        resetScrollToTop(false);
        requestAnimationFrame(() => {
          resetScrollToTop(false);
        });
      }

      if (tab === "map") {
        setTimeout(() => {
          window.dispatchEvent(new Event("resize"));
        }, 50);
      }
    } else {
      if (pathname !== prevPath) {
        resetScrollToTop(false);
        requestAnimationFrame(() => {
          resetScrollToTop(false);
        });
      }
    }
  }, [pathname, resetScrollToTop]);

  // Handle browser popstate
  useEffect(() => {
    const handlePopState = () => {
      isPopStateRef.current = true;
      const currentPath = window.location.pathname;
      const currentKey = currentPath + window.location.search;
      const prevHash = lastHashRef.current;
      lastHashRef.current = window.location.hash;
      resetScrollLock();
      const tab = getTabFromPath(currentPath);
      if (tab) {
        const closingStatsOnSameTab =
          isStatsHash(prevHash) &&
          !isStatsHash(window.location.hash) &&
          tab === activeTabRef.current;
        setActiveTab(tab);
        activeTabRef.current = tab;

        if (closingStatsOnSameTab) {
          const preservedMode = sharedModeRef.current;
          if (tab === "map") {
            const reconciledPath = preservedMode === "peaks" ? "/picos" : "/";
            if (currentPath !== reconciledPath) {
              window.history.replaceState(null, "", reconciledPath);
            }
            lastPathRef.current = reconciledPath;
          } else {
            const url = new URL(window.location.href);
            url.searchParams.set("challenge", preservedMode);
            if (tab === "social" && preservedMode === "countries" && sharedExperiencesRef.current) {
              url.searchParams.set("view", "experiences");
            } else {
              url.searchParams.delete("view");
            }
            window.history.replaceState(null, "", url.toString());
            lastPathRef.current = url.pathname;
          }
        } else {
          let detectedMode: ChallengeMode | null = null;
          if (currentPath === "/picos") {
            detectedMode = "peaks";
          } else if (currentPath === "/" || currentPath === "/paises") {
            detectedMode = "countries";
          } else {
            const params = new URLSearchParams(window.location.search);
            const ch = params.get("challenge");
            if (ch === "peaks" || ch === "countries") {
              detectedMode = ch;
            }
          }
          if (detectedMode) {
            setSharedMode(detectedMode);
          }

          const params = new URLSearchParams(window.location.search);
          const view = params.get("view");
          const ch = params.get("challenge");
          if (view === "experiences" || ch === "experiences") {
            setSharedExperiencesMode(true);
          }
        }

        if (tab === "map") {
          setTimeout(() => {
            window.dispatchEvent(new Event("resize"));
          }, 50);
        }
      }

      const savedY = historyScrollPositions.current.get(currentKey) ?? 0;
      requestAnimationFrame(() => {
        if (!window.location.hash || window.location.hash === "#") {
          const root = document.documentElement;
          const prevBehavior = root ? root.style.scrollBehavior : "";
          if (root) root.style.scrollBehavior = "auto";
          window.scrollTo({ top: savedY, left: 0, behavior: "instant" });
          if (root) root.style.scrollBehavior = prevBehavior;
        }
        isPopStateRef.current = false;
      });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const handleToggleExperiences = useCallback(
    (active: boolean) => {
      setSharedExperiencesMode(active);
      if (typeof window !== "undefined") {
        localStorage.setItem("myExperiencesMode", active.toString());
        if (activeTabRef.current === "social") {
          const url = new URL(window.location.href);
          if (active && sharedMode === "countries") {
            url.searchParams.set("view", "experiences");
          } else {
            url.searchParams.delete("view");
          }
          window.history.replaceState(null, "", url.toString());
        }
      }
    },
    [sharedMode]
  );

  const handleNavigate = useCallback(
    (targetPath: string) => {
      const tab = getTabFromPath(targetPath);
      if (tab) {
        const prevTab = activeTabRef.current;
        if (tab === prevTab && isMainRoute) {
          if (typeof window !== "undefined" && window.location.hash && window.location.hash !== "#") {
            const cleanUrl = window.location.pathname + window.location.search;
            window.history.replaceState(null, "", cleanUrl);
            window.dispatchEvent(new Event("hashchange"));
          }
          resetScrollToTop(true);
          return;
        }

        const commitTabNavigation = () => {
          if (typeof window !== "undefined") {
            const currentKey = window.location.pathname + window.location.search;
            historyScrollPositions.current.set(currentKey, window.scrollY);

            if (window.location.hash && window.location.hash !== "#") {
              const cleanUrl = window.location.pathname + window.location.search;
              window.history.replaceState(null, "", cleanUrl);
            }
          }

          if (tab !== prevTab) {
            resetScrollLock();
          }

          setActiveTab(tab);
          activeTabRef.current = tab;
          setVisitedTabs((prev) => {
            if (prev.has(tab)) return prev;
            const next = new Set(prev);
            next.add(tab);
            return next;
          });

          // Determine target mode:
          // If the link explicitly specifies a challenge or specific map route, adopt it;
          // otherwise preserve the current sharedMode across all tabs!
          let targetMode = sharedMode;
          if (targetPath.includes("challenge=peaks") || targetPath === "/picos") {
            targetMode = "peaks";
          } else if (targetPath.includes("challenge=countries") || targetPath === "/" || targetPath === "/paises") {
            targetMode = "countries";
          }

          // Build the accurate target path reflecting the active mode
          let finalPath = targetPath;
          if (tab === "social") {
            if (!finalPath.includes("challenge=")) {
              const separator = finalPath.includes("?") ? "&" : "?";
              finalPath = `${finalPath}${separator}challenge=${targetMode}`;
            }
            if (targetMode === "countries" && sharedExperiencesMode) {
              if (!finalPath.includes("view=experiences")) {
                const separator = finalPath.includes("?") ? "&" : "?";
                finalPath = `${finalPath}${separator}view=experiences`;
              }
            } else {
              try {
                const url = new URL(finalPath, "https://atlas.local");
                url.searchParams.delete("view");
                finalPath = `${url.pathname}${url.search}${url.hash}`;
              } catch {
                /* ignore */
              }
            }
          } else if (tab === "ranking") {
            if (!finalPath.includes("challenge=")) {
              const separator = finalPath.includes("?") ? "&" : "?";
              finalPath = `${finalPath}${separator}challenge=${targetMode}`;
            }
            // Ranking does not have experiences view parameter
          } else if (tab === "map") {
            const hashIdx = targetPath.indexOf("#");
            const hashPart = hashIdx >= 0 ? targetPath.slice(hashIdx) : "";
            const baseMap = targetMode === "peaks" ? "/picos" : "/";
            finalPath = `${baseMap}${hashPart}`;
          }

          setSharedMode(targetMode);
          if (typeof window !== "undefined") {
            localStorage.setItem("last_active_mode", targetMode);
            localStorage.setItem("last_map_path", targetMode === "peaks" ? "/picos" : "/");
            localStorage.setItem("ranking_mode", targetMode);
          }
          if (!isMainRoute) {
            router.push(finalPath);
          } else {
            window.history.pushState(null, "", finalPath);
            lastPathRef.current = finalPath.split("?")[0].split("#")[0];
            const hashIdx = finalPath.indexOf("#");
            lastHashRef.current = hashIdx >= 0 ? finalPath.slice(hashIdx) : "";

            if (finalPath.includes("#")) {
              window.dispatchEvent(new Event("hashchange"));
            }

            resetScrollToTop(false);
            requestAnimationFrame(() => {
              resetScrollToTop(false);
            });
          }

          if (tab === "map") {
            setTimeout(() => {
              window.dispatchEvent(new Event("resize"));
            }, 50);
          }
        };

        const requestId = ++navRequestIdRef.current;
        const needsSocialLoad = tab === "social" && !resolvedSocialTab;
        const needsRankingLoad = tab === "ranking" && !resolvedRankingTab;

        if (isMainRoute && (needsSocialLoad || needsRankingLoad)) {
          const loader = needsSocialLoad ? loadSocialTab() : loadRankingTab();
          void loader
            .then((Comp) => {
              if (navRequestIdRef.current !== requestId) return;
              if (needsSocialLoad) {
                setSocialTabComp(() => Comp as SocialTabComponent);
              } else {
                setRankingTabComp(() => Comp as RankingTabComponent);
              }
              commitTabNavigation();
            })
            .catch(() => {});
          return;
        }

        if (tab === "social" && resolvedSocialTab && !SocialTabComp) {
          setSocialTabComp(() => resolvedSocialTab);
        } else if (tab === "ranking" && resolvedRankingTab && !RankingTabComp) {
          setRankingTabComp(() => resolvedRankingTab);
        }
        commitTabNavigation();
      } else {
        resetScrollLock();
        if (typeof window !== "undefined") {
          const currentKey = window.location.pathname + window.location.search;
          historyScrollPositions.current.set(currentKey, window.scrollY);
        }
        router.push(targetPath);
      }
    },
    [router, sharedMode, sharedExperiencesMode, isMainRoute, resetScrollToTop, SocialTabComp, RankingTabComp]
  );

  const handleSwitchMode = useCallback(
    (newMode: ChallengeMode) => {
      setSharedMode(newMode);
      if (typeof window !== "undefined") {
        localStorage.setItem("last_active_mode", newMode);
        localStorage.setItem("last_map_path", newMode === "peaks" ? "/picos" : "/");
        localStorage.setItem("ranking_mode", newMode);
        const currentTab = activeTabRef.current || getTabFromPath(window.location.pathname) || "map";
        const statsHash = isStatsHash(window.location.hash) ? window.location.hash : "";
        if (currentTab === "map") {
          const newPath = newMode === "peaks" ? "/picos" : "/";
          window.history.replaceState(null, "", `${newPath}${statsHash}`);
          lastPathRef.current = newPath;
        } else {
          const url = new URL(window.location.href);
          url.searchParams.set("challenge", newMode);
          if (newMode === "countries" && sharedExperiencesMode && currentTab === "social") {
            url.searchParams.set("view", "experiences");
          } else if (newMode === "peaks") {
            url.searchParams.delete("view");
          }
          url.hash = statsHash;
          window.history.replaceState(null, "", url.toString());
        }
        if (statsHash) {
          lastHashRef.current = statsHash;
        } else {
          resetScrollToTop(false);
        }
      }
    },
    [sharedExperiencesMode, resetScrollToTop]
  );

  return (
    <>
      {/* ── Tab 1: Mapa (SummitTracker) ── */}
      <div
        id="tab-view-map"
        style={{
          display: isMainRoute && activeTab === "map" ? "block" : "none",
        }}
      >
        {(visitedTabs.has("map") || (isMainRoute && activeTab === "map")) && (
          <SummitTracker
            mode={sharedMode}
            experiencesMode={sharedExperiencesMode}
            onToggleExperiences={handleToggleExperiences}
            isActive={isMainRoute && activeTab === "map"}
            onSwitchMode={handleSwitchMode}
            onNavigate={handleNavigate}
          />
        )}
      </div>

      {/* ── Tab 2: Social (SocialTab) ── */}
      <div
        id="tab-view-social"
        style={{
          display: isMainRoute && activeTab === "social" ? "block" : "none",
        }}
      >
        {(visitedTabs.has("social") || (isMainRoute && activeTab === "social")) && SocialTabComp && (
          <SocialTabComp
            mode={sharedMode}
            experiencesMode={sharedExperiencesMode}
            onToggleExperiences={handleToggleExperiences}
            isActive={isMainRoute && activeTab === "social"}
            onSwitchMode={handleSwitchMode}
            onNavigate={handleNavigate}
          />
        )}
      </div>

      {/* ── Tab 3: Ranking (RankingTab) ── */}
      <div
        id="tab-view-ranking"
        style={{
          display: isMainRoute && activeTab === "ranking" ? "block" : "none",
        }}
      >
        {(visitedTabs.has("ranking") || (isMainRoute && activeTab === "ranking")) && RankingTabComp && (
          <RankingTabComp
            mode={sharedMode}
            isActive={isMainRoute && activeTab === "ranking"}
            onSwitchMode={handleSwitchMode}
            onNavigate={handleNavigate}
          />
        )}
      </div>

      {/* ── Other Routes (UserProfile, Privacidad, etc.) ── */}
      {!isMainRoute && children}

      {/* ── Mobile Bottom Navigation Bar ── */}
      {!(
        pathname.startsWith("/reset-password") ||
        pathname.startsWith("/privacidad") ||
        pathname.startsWith("/terminos") ||
        pathname.startsWith("/developers")
      ) && (
        <MobileBottomNav
          activeTab={activeTab}
          mode={sharedMode}
          experiencesMode={sharedExperiencesMode}
          onNavigate={handleNavigate}
          isMainRoute={isMainRoute}
        />
      )}
    </>
  );
}

export function AppTabsShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AppTabsShellInner>{children}</AppTabsShellInner>
    </Suspense>
  );
}
