"use client";

import React from "react";
import type { Session } from "@supabase/supabase-js";
import { QrCode, Share2 } from "lucide-react";
import { getPhotoDisplayUrl } from "@/lib/photo-client";

interface SocialHeroProps {
  session: Session | null;
  myProfile: any;
  currentMode: "countries" | "peaks";
  hasBothModes: boolean;
  acceptedFollowersCount: number;
  followingCount: number;
  hasPendingNotifications: boolean;
  activeAchieved: number;
  activeTotal: number;
  activeUnit: string;
  activeCompletion: number;
  onSwipeTouchStart: (e: React.TouchEvent) => void;
  onSwipeTouchEnd: (e: React.TouchEvent) => void;
  onSwitchMode: (target: "countries" | "peaks") => void;
  onOpenInbox: () => void;
  onOpenProfilePage: (username: string) => void;
  onOpenConnections: (tab: "followers" | "following") => void;
  onShareApp: () => void;
  onOpenQr: () => void;
  onOpenAuth: () => void;
}

export function SocialHero({
  session,
  myProfile,
  currentMode,
  hasBothModes,
  acceptedFollowersCount,
  followingCount,
  hasPendingNotifications,
  activeAchieved,
  activeTotal,
  activeUnit,
  activeCompletion,
  onSwipeTouchStart,
  onSwipeTouchEnd,
  onSwitchMode,
  onOpenInbox,
  onOpenProfilePage,
  onOpenConnections,
  onShareApp,
  onOpenQr,
  onOpenAuth,
}: SocialHeroProps) {
  return (
    <section
      id="inicio"
      className="hero"
      onTouchStart={onSwipeTouchStart}
      onTouchEnd={onSwipeTouchEnd}
    >
      <div
        className={`hero-main hero-main--social ${
          !session || !myProfile ? "hero-main--social-anon" : ""
        }`}
      >
        {session && myProfile ? (
          <>
            <div className="hero-profile-wrap">
              <div
                className="hero-profile-avatar-wrap"
                style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}
              >
                <div
                  className="hero-profile-avatar"
                  onClick={onOpenInbox}
                  title="Bandeja de entrada"
                  style={{ cursor: "pointer" }}
                >
                  {myProfile.avatar_url ? (
                    <img src={getPhotoDisplayUrl(myProfile.avatar_url)} alt={myProfile.username} />
                  ) : (
                    myProfile.username.charAt(0).toUpperCase()
                  )}
                </div>
                {hasPendingNotifications && (
                  <span
                    className="hero-avatar-badge"
                    style={{
                      position: "absolute",
                      top: "-2px",
                      right: "-2px",
                      width: "11px",
                      height: "11px",
                      backgroundColor: "#ef4444",
                      borderRadius: "50%",
                      border: "2px solid var(--paper, #fdfbf7)",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      pointerEvents: "none",
                      zIndex: 2,
                    }}
                  />
                )}
              </div>

              <div className="hero-profile-info">
                <h2
                  className="hero-profile-username"
                  onClick={() => onOpenProfilePage(myProfile.username)}
                >
                  @{myProfile.username}
                </h2>
                <div className="hero-profile-connections">
                  <button
                    type="button"
                    className="hero-profile-conn-btn"
                    onClick={() => onOpenConnections("followers")}
                  >
                    <strong>{acceptedFollowersCount}</strong> seguidores
                  </button>
                  <span className="hero-profile-conn-sep">·</span>
                  <button
                    type="button"
                    className="hero-profile-conn-btn"
                    onClick={() => onOpenConnections("following")}
                  >
                    <strong>{followingCount}</strong> siguiendo
                  </button>
                </div>
              </div>
            </div>

            <div className="hero-stat-wrap">
              <aside className="hero-stat" suppressHydrationWarning>
                <strong suppressHydrationWarning>
                  <span suppressHydrationWarning>{activeAchieved}</span>
                  <small suppressHydrationWarning> / {activeTotal}</small>
                </strong>
                <span suppressHydrationWarning>{activeUnit}</span>
                <div className="progress">
                  <span style={{ width: `${activeCompletion}%` }} suppressHydrationWarning />
                </div>
              </aside>

              <div className="hero-stat-actions-mobile">
                <button
                  type="button"
                  className="hero-stat-action-btn"
                  onClick={onShareApp}
                  title="Compartir Atlas"
                  aria-label="Compartir enlace de Atlas"
                >
                  <Share2 size={13} />
                </button>
                <button
                  type="button"
                  className="hero-stat-action-btn"
                  onClick={onOpenQr}
                  title="Código QR de Atlas"
                  aria-label="Ver código QR de Atlas"
                >
                  <QrCode size={13} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <aside className="hero-stat hero-stat--anon">
            <button type="button" className="button button--green" onClick={onOpenAuth}>
              Iniciar sesión
            </button>
            <span style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
              Conecta con otros exploradores
            </span>
          </aside>
        )}
      </div>

      {hasBothModes && (
        <div
          className={`app-mode-switch hide-on-desktop ${
            currentMode === "peaks" ? "app-mode-switch--peaks" : "app-mode-switch--countries"
          }`}
          style={{ marginTop: 10, display: "flex", width: "fit-content" }}
          onTouchStart={onSwipeTouchStart}
          onTouchEnd={onSwipeTouchEnd}
        >
          <div className="app-mode-switch__indicator" />
          <button
            type="button"
            className={`app-mode-btn ${currentMode === "peaks" ? "active" : ""}`}
            onClick={() => onSwitchMode("peaks")}
          >
            47 Picos
          </button>
          <button
            type="button"
            className={`app-mode-btn ${currentMode === "countries" ? "active" : ""}`}
            onClick={() => onSwitchMode("countries")}
          >
            196 Países
          </button>
        </div>
      )}
    </section>
  );
}
