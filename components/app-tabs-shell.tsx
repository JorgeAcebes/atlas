"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SummitTracker } from "@/components/summit-tracker";
import { SocialTab } from "@/components/social-tab";
import { RankingTab } from "@/components/ranking-tab";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";

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
  const [mounted, setMounted] = useState(false);

  const initialTab = getTabFromPath(pathname) || "map";
  const [activeTab, setActiveTab] = useState<MainTab>(initialTab);
  const [sharedMode, setSharedMode] = useState<ChallengeMode>(() => getInitialMode(pathname));
  const [sharedExperiencesMode, setSharedExperiencesMode] = useState<boolean>(() => getInitialExperiencesMode());

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
    const behavior: ScrollBehavior = smooth ? "smooth" : "instant";
    window.scrollTo({ top: 0, left: 0, behavior });
    if (!smooth) {
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
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
      const tab = getTabFromPath(currentPath);
      if (tab) {
        setActiveTab(tab);
        activeTabRef.current = tab;
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

        if (tab === "map") {
          setTimeout(() => {
            window.dispatchEvent(new Event("resize"));
          }, 50);
        }
      }

      const savedY = historyScrollPositions.current.get(currentKey) ?? 0;
      requestAnimationFrame(() => {
        if (!window.location.hash || window.location.hash === "#") {
          window.scrollTo({ top: savedY, left: 0, behavior: "instant" });
          if (document.documentElement) document.documentElement.scrollTop = savedY;
          if (document.body) document.body.scrollTop = savedY;
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
          resetScrollToTop(true);
          return;
        }

        if (typeof window !== "undefined") {
          const currentKey = window.location.pathname + window.location.search;
          historyScrollPositions.current.set(currentKey, window.scrollY);
        }

        setActiveTab(tab);
        activeTabRef.current = tab;

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
          lastPathRef.current = finalPath;

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
      } else {
        if (typeof window !== "undefined") {
          const currentKey = window.location.pathname + window.location.search;
          historyScrollPositions.current.set(currentKey, window.scrollY);
        }
        router.push(targetPath);
      }
    },
    [router, sharedMode, sharedExperiencesMode, isMainRoute, resetScrollToTop]
  );

  const handleSwitchMode = useCallback(
    (newMode: ChallengeMode) => {
      setSharedMode(newMode);
      if (typeof window !== "undefined") {
        localStorage.setItem("last_active_mode", newMode);
        localStorage.setItem("last_map_path", newMode === "peaks" ? "/picos" : "/");
        localStorage.setItem("ranking_mode", newMode);
        const currentTab = activeTabRef.current || getTabFromPath(window.location.pathname) || "map";
        if (currentTab === "map") {
          const newPath = newMode === "peaks" ? "/picos" : "/";
          window.history.replaceState(null, "", newPath);
        } else {
          const url = new URL(window.location.href);
          url.searchParams.set("challenge", newMode);
          if (newMode === "countries" && sharedExperiencesMode && currentTab === "social") {
            url.searchParams.set("view", "experiences");
          } else if (newMode === "peaks") {
            url.searchParams.delete("view");
          }
          url.hash = "";
          window.history.replaceState(null, "", url.toString());
        }
        resetScrollToTop(false);
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
          display: isMainRoute && activeTab === "map" ? "contents" : "none",
        }}
      >
        {(!mounted ? activeTab === "map" : true) && (
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
          display: isMainRoute && activeTab === "social" ? "contents" : "none",
        }}
      >
        {(!mounted ? activeTab === "social" : true) && (
          <SocialTab
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
          display: isMainRoute && activeTab === "ranking" ? "contents" : "none",
        }}
      >
        {(!mounted ? activeTab === "ranking" : true) && (
          <RankingTab
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
      <MobileBottomNav
        activeTab={activeTab}
        mode={sharedMode}
        experiencesMode={sharedExperiencesMode}
        onNavigate={handleNavigate}
        isMainRoute={isMainRoute}
      />
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
