"use client";

import React from "react";
import Link from "next/link";
import { Map, Users, Trophy } from "lucide-react";
import { usePendingRequests } from "./use-pending-requests";

interface MobileBottomNavProps {
  activeTab: "map" | "social" | "ranking";
  mode: "peaks" | "countries";
  experiencesMode: boolean;
  onNavigate: (path: string) => void;
  isMainRoute?: boolean;
}

export function MobileBottomNav({
  activeTab,
  mode,
  experiencesMode,
  onNavigate,
  isMainRoute = true,
}: MobileBottomNavProps) {
  const hasPendingRequests = usePendingRequests();
  const [bodyHasExperiences, setBodyHasExperiences] = React.useState(false);

  React.useEffect(() => {
    const checkBodyTheme = () => {
      if (typeof document !== "undefined") {
        setBodyHasExperiences(document.body.classList.contains("mode-experiences"));
      }
    };
    checkBodyTheme();
    const observer = new MutationObserver(checkBodyTheme);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const isPeaks = mode === "peaks";
  // En la pestaña de ranking principal (isMainRoute), no existe la modalidad de experiencias y debe mantenerse siempre en color estándar.
  // Solo se colorea en modo experiencias si entramos en las experiencias de otro usuario (!isMainRoute) estando en ranking.
  const isExp = isPeaks
    ? false
    : activeTab === "ranking" && isMainRoute
    ? false
    : activeTab === "ranking" && !isMainRoute
    ? bodyHasExperiences
    : experiencesMode || bodyHasExperiences;

  const mapUrl = isPeaks ? "/picos" : "/";
  const socialUrl = isPeaks
    ? "/social?challenge=peaks"
    : isExp
    ? "/social?challenge=countries&view=experiences"
    : "/social?challenge=countries";
  const rankingUrl = `/ranking?challenge=${mode}`;

  const handleMapClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (activeTab === "map" && isMainRoute) {
      const mapaEl = document.getElementById("mapa");
      if (mapaEl) {
        const topbar = document.querySelector(".topbar") as HTMLElement | null;
        const topbarHeight = topbar ? topbar.getBoundingClientRect().height : 56;
        const mapaTop = mapaEl.getBoundingClientRect().top + window.scrollY;
        if (window.scrollY > mapaTop + 20) {
          window.scrollTo({
            top: Math.max(0, Math.round(mapaTop - topbarHeight - 6)),
            behavior: "smooth",
          });
        } else {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } else {
      onNavigate(mapUrl);
    }
  };

  const handleSocialClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (activeTab === "social" && isMainRoute) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      onNavigate(socialUrl);
    }
  };

  const handleRankingClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (activeTab === "ranking" && isMainRoute) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      onNavigate(rankingUrl);
    }
  };

  const themeClass = isPeaks ? "mode-peaks" : isExp ? "mode-experiences" : "mode-countries";

  return (
    <nav
      className={`mobile-bottom-nav ${themeClass}`}
      aria-label="Navegación principal inferior"
    >
      <Link
        href={mapUrl}
        prefetch={true}
        className={`mobile-bottom-nav-item ${activeTab === "map" && isMainRoute ? "mobile-bottom-nav-item--active" : ""}`}
        onClick={handleMapClick}
        aria-label="Mapa"
        aria-current={activeTab === "map" && isMainRoute ? "page" : undefined}
      >
        <div className="mobile-bottom-nav-icon-wrap">
          <Map
            size={21}
            strokeWidth={activeTab === "map" && isMainRoute ? 2.3 : 1.85}
            className="mobile-bottom-nav-icon"
          />
        </div>
        <span className="mobile-bottom-nav-label">Mapa</span>
      </Link>

      <Link
        href={socialUrl}
        prefetch={true}
        className={`mobile-bottom-nav-item ${activeTab === "social" && isMainRoute ? "mobile-bottom-nav-item--active" : ""}`}
        onClick={handleSocialClick}
        aria-label="Social"
        aria-current={activeTab === "social" && isMainRoute ? "page" : undefined}
      >
        <div className="mobile-bottom-nav-icon-wrap">
          <Users
            size={21}
            strokeWidth={activeTab === "social" && isMainRoute ? 2.3 : 1.85}
            className="mobile-bottom-nav-icon"
          />
          {hasPendingRequests && (
            <span
              className="mobile-bottom-nav-badge"
              aria-label="Solicitudes pendientes"
            />
          )}
        </div>
        <span className="mobile-bottom-nav-label">Social</span>
      </Link>

      <Link
        href={rankingUrl}
        prefetch={true}
        className={`mobile-bottom-nav-item ${activeTab === "ranking" && isMainRoute ? "mobile-bottom-nav-item--active" : ""}`}
        onClick={handleRankingClick}
        aria-label="Ranking"
        aria-current={activeTab === "ranking" && isMainRoute ? "page" : undefined}
      >
        <div className="mobile-bottom-nav-icon-wrap">
          <Trophy
            size={21}
            strokeWidth={activeTab === "ranking" && isMainRoute ? 2.3 : 1.85}
            className="mobile-bottom-nav-icon"
          />
        </div>
        <span className="mobile-bottom-nav-label">Ranking</span>
      </Link>
    </nav>
  );
}
