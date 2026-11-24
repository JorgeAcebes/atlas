"use client";

import React from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { ChartNoAxesColumn, Download } from "lucide-react";
import { IconLogo } from "@/components/icons";
import { getPhotoDisplayUrl } from "@/lib/photo-client";
import { scrollToMap, scrollToTopSmooth } from "@/lib/navigation-utils";

export interface AppTopbarProps {
  activeTab: "map" | "social" | "ranking";
  mode: "peaks" | "countries";
  experiencesMode?: boolean;
  hasBothModes: boolean;
  session: Session | null;
  myProfile: {
    username?: string;
    avatar_url?: string | null;
  } | null;
  mounted?: boolean;
  hasPendingRequests?: boolean;
  canInstallMobile: boolean;
  isReadOnly?: boolean;
  targetProfile?: { username: string } | null;
  fromTab?: "ranking" | "social" | "mapa";
  onSwitchMode: (target: "peaks" | "countries") => void;
  onNavigate?: (path: string) => void;
  onOpenStats: () => void;
  onInstallClick: (e: React.MouseEvent) => void;
  onOpenProfile: () => void;
  onOpenAuth: () => void;
  onOpenInbox?: () => void;
}

export function AppTopbar({
  activeTab,
  mode,
  experiencesMode = false,
  hasBothModes,
  session,
  myProfile,
  mounted = true,
  hasPendingRequests = false,
  canInstallMobile,
  isReadOnly = false,
  targetProfile,
  fromTab,
  onSwitchMode,
  onNavigate,
  onOpenStats,
  onInstallClick,
  onOpenProfile,
  onOpenAuth,
  onOpenInbox,
}: AppTopbarProps) {
  const isPeaks = mode === "peaks";
  const mapHref = isPeaks ? "/picos" : "/";
  const socialHref = isPeaks
    ? "/social?challenge=peaks"
    : experiencesMode
      ? "/social?challenge=countries&view=experiences"
      : "/social?challenge=countries";
  const rankingHref = `/ranking?challenge=${isPeaks ? "peaks" : "countries"}`;

  const handleNavClick = (path: string, e: React.MouseEvent) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate(path);
    }
  };

  return (
    <header className="topbar">
      {activeTab === "map" && !isReadOnly ? (
        <a
          className="brand"
          href="#inicio"
          onClick={(e) => {
            if (onNavigate) {
              e.preventDefault();
              onNavigate(mapHref);
              return;
            }
            e.preventDefault();
            scrollToTopSmooth();
          }}
        >
          <IconLogo className="brand-icon" />
          <span>
            <b>Atlas</b>
          </span>
        </a>
      ) : (
        <Link
          className="brand"
          href={mapHref}
          title="Atlas"
          aria-label="Atlas"
          onClick={(e) => handleNavClick(mapHref, e)}
        >
          <IconLogo className="brand-icon" />
          <span>
            <b>Atlas</b>
          </span>
        </Link>
      )}

      {hasBothModes && (
        <div
          className={`app-mode-switch ${
            isPeaks ? "app-mode-switch--peaks" : "app-mode-switch--countries"
          }`}
        >
          <div className="app-mode-switch__indicator" />
          <button
            type="button"
            className={`app-mode-btn ${isPeaks ? "active" : ""}`}
            onClick={() => onSwitchMode("peaks")}
          >
            47 Picos
          </button>
          <button
            type="button"
            className={`app-mode-btn ${!isPeaks ? "active" : ""}`}
            onClick={() => onSwitchMode("countries")}
          >
            196 Países
          </button>
        </div>
      )}

      <nav className={!session && !myProfile ? "topbar-nav--unauth" : undefined}>
        {activeTab === "map" && !isReadOnly ? (
          <a
            href="#mapa"
            className="topbar-nav-link topbar-nav-link--mapa topbar-nav-link--active"
            onClick={(e) => scrollToMap(e)}
          >
            Mapa
          </a>
        ) : (
          <Link
            href={isReadOnly ? "/" : mapHref}
            prefetch={true}
            className={`topbar-nav-link topbar-nav-link--mapa ${
              activeTab === "map" && isReadOnly && (!fromTab || fromTab === "mapa")
                ? "topbar-nav-link--active"
                : ""
            }`}
            onClick={(e) => handleNavClick(isReadOnly ? "/" : mapHref, e)}
          >
            Mapa
          </Link>
        )}

        <Link
          href={socialHref}
          prefetch={true}
          className={`topbar-nav-link topbar-nav-link--social ${
            activeTab === "social" || (isReadOnly && fromTab === "social")
              ? "topbar-nav-link--active"
              : ""
          }`}
          style={{ position: "relative" }}
          onClick={(e) => {
            if (activeTab === "social" && !onNavigate) {
              e.preventDefault();
              scrollToTopSmooth();
              return;
            }
            handleNavClick(socialHref, e);
          }}
        >
          Social
          {hasPendingRequests ? (
            <span
              onClick={
                activeTab === "social" && onOpenInbox
                  ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onOpenInbox();
                    }
                  : undefined
              }
              style={{
                position: "absolute",
                top: "-2px",
                right: "-6px",
                width: "8px",
                height: "8px",
                backgroundColor: "red",
                borderRadius: "50%",
                cursor: activeTab === "social" && onOpenInbox ? "pointer" : undefined,
                pointerEvents: activeTab === "ranking" ? "none" : undefined,
              }}
            />
          ) : null}
        </Link>

        <Link
          href={rankingHref}
          prefetch={true}
          className={`topbar-nav-link topbar-nav-link--ranking ${
            activeTab === "ranking" || (isReadOnly && fromTab === "ranking")
              ? "topbar-nav-link--active"
              : ""
          }`}
          onClick={(e) => {
            if (activeTab === "ranking" && !onNavigate) {
              e.preventDefault();
              scrollToTopSmooth();
              return;
            }
            handleNavClick(rankingHref, e);
          }}
        >
          Ranking
        </Link>

        {/* Mobile Stats button */}
        {(!canInstallMobile || !!targetProfile) && (targetProfile || myProfile || session) && (
          <button
            type="button"
            className="topbar-stats-btn"
            aria-label={targetProfile ? `Estadísticas de @${targetProfile.username}` : "Mis Estadísticas"}
            title={targetProfile ? `Estadísticas de @${targetProfile.username}` : "Mis Estadísticas"}
            onClick={onOpenStats}
          >
            <ChartNoAxesColumn size={20} />
          </button>
        )}

        {/* Mobile Web Install button */}
        {!targetProfile && canInstallMobile && (
          <button
            type="button"
            className="topbar-install-btn hero-install-btn"
            onClick={onInstallClick}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            aria-label="Instalar app"
            title="Instalar aplicación"
          >
            <Download size={20} strokeWidth={2.2} />
          </button>
        )}

        {myProfile || session ? (
          <button
            type="button"
            className="account-button"
            aria-label="Mi Perfil"
            title="Mi Perfil"
            onClick={onOpenProfile}
            onMouseEnter={() => {
              void import("@/components/profile-settings").catch(() => {});
            }}
            onPointerDown={() => {
              void import("@/components/profile-settings").catch(() => {});
            }}
            onFocus={() => {
              void import("@/components/profile-settings").catch(() => {});
            }}
          >
            {myProfile?.avatar_url ? (
              <img
                src={getPhotoDisplayUrl(myProfile.avatar_url)}
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
          <button type="button" className="button button--outline" onClick={onOpenAuth}>
            Entrar
          </button>
        )}
      </nav>
    </header>
  );
}
