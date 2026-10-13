"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SummitTracker } from "@/components/summit-tracker";
import { SocialTab } from "@/components/social-tab";
import { RankingTab } from "@/components/ranking-tab";

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

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync state when pathname changes via Next router
  useEffect(() => {
    const tab = getTabFromPath(pathname);
    if (tab) {
      setActiveTab(tab);
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

      if (tab === "map") {
        setTimeout(() => {
          window.dispatchEvent(new Event("resize"));
        }, 50);
      }
    }
  }, [pathname]);

  // Handle browser popstate
  useEffect(() => {
    const handlePopState = () => {
      const currentPath = window.location.pathname;
      const tab = getTabFromPath(currentPath);
      if (tab) {
        setActiveTab(tab);
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
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleToggleExperiences = useCallback(
    (active: boolean) => {
      setSharedExperiencesMode(active);
      if (typeof window !== "undefined") {
        localStorage.setItem("myExperiencesMode", active.toString());
        if (activeTab === "social") {
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
    [activeTab, sharedMode]
  );

  const handleNavigate = useCallback(
    (targetPath: string) => {
      const tab = getTabFromPath(targetPath);
      if (tab) {
        setActiveTab(tab);

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
          finalPath = targetMode === "peaks" ? "/picos" : "/";
        }

        setSharedMode(targetMode);
        if (typeof window !== "undefined") {
          localStorage.setItem("last_active_mode", targetMode);
          localStorage.setItem("last_map_path", targetMode === "peaks" ? "/picos" : "/");
          localStorage.setItem("ranking_mode", targetMode);
        }
        window.history.pushState(null, "", finalPath);
        if (tab === "map") {
          setTimeout(() => {
            window.dispatchEvent(new Event("resize"));
          }, 50);
        }
      } else {
        router.push(targetPath);
      }
    },
    [router, sharedMode, sharedExperiencesMode]
  );

  const handleSwitchMode = useCallback(
    (newMode: ChallengeMode) => {
      setSharedMode(newMode);
      if (typeof window !== "undefined") {
        localStorage.setItem("last_active_mode", newMode);
        localStorage.setItem("last_map_path", newMode === "peaks" ? "/picos" : "/");
        localStorage.setItem("ranking_mode", newMode);
        if (activeTab === "map") {
          const newPath = newMode === "peaks" ? "/picos" : "/";
          window.history.replaceState(null, "", newPath);
        } else {
          const url = new URL(window.location.href);
          url.searchParams.set("challenge", newMode);
          if (newMode === "countries" && sharedExperiencesMode && activeTab === "social") {
            url.searchParams.set("view", "experiences");
          } else if (newMode === "peaks") {
            url.searchParams.delete("view");
          }
          window.history.replaceState(null, "", url.toString());
        }
      }
    },
    [activeTab, sharedExperiencesMode]
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
