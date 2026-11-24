"use client";

import React, { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { UserRoundArrowLeft, UserRoundCheck, UserRoundMinus, UserRoundPlus } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { ChallengeMode, TargetProfile } from "./types";

interface TrackerHeroProps {
  targetProfile?: TargetProfile;
  session: Session | null;
  isPeaks: boolean;
  experiencesMode: boolean;
  hasBothModes: boolean;
  achievedCount: number;
  totalCount: number;
  modeUnit: string;
  completion: number;
  targetConnStatus: "pending" | "accepted" | null;
  targetConnLoading: boolean;
  justFollowed: boolean;
  setJustFollowed: (val: boolean) => void;
  onFollowTarget: () => void;
  onUnfollowTarget: () => void;
  onSwitchMode: (target: ChallengeMode) => void;
  onSwipeTouchStart: (e: React.TouchEvent) => void;
  onSwipeTouchEnd: (e: React.TouchEvent) => void;
}

export function TrackerHero({
  targetProfile,
  session,
  isPeaks,
  experiencesMode,
  hasBothModes,
  achievedCount,
  totalCount,
  modeUnit,
  completion,
  targetConnStatus,
  targetConnLoading,
  justFollowed,
  setJustFollowed,
  onFollowTarget,
  onUnfollowTarget,
  onSwitchMode,
  onSwipeTouchStart,
  onSwipeTouchEnd,
}: TrackerHeroProps) {
  const [touchUnfollowActive, setTouchUnfollowActive] = useState(false);
  const touchHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justFollowedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (touchHoldTimerRef.current) clearTimeout(touchHoldTimerRef.current);
      if (justFollowedTimerRef.current) clearTimeout(justFollowedTimerRef.current);
    };
  }, []);

  return (
    <>
      <section
        id="inicio"
        className="hero"
        onTouchStart={onSwipeTouchStart}
        onTouchEnd={onSwipeTouchEnd}
      >
        <div
          className={`hero-main ${
            !targetProfile
              ? "hero-main--motto"
              : targetProfile && session?.user?.id !== targetProfile.id
                ? "hero-main--with-follow"
                : ""
          }`}
        >
          <div
            className={`hero-title-wrap ${
              !targetProfile ? "hero-title-wrap--motto hide-on-mobile" : "hero-title-wrap--user"
            }`}
          >
            <h1 className={targetProfile ? "hero-title--user" : undefined}>
              {targetProfile ? (
                <>
                  El mapa de <br />
                  <em>@{targetProfile.username}</em>
                </>
              ) : isPeaks ? (
                <>
                  Sube alto.
                  <br />
                  <em>Déjalo escrito.</em>
                </>
              ) : experiencesMode ? (
                <>
                  Vive experiencias.
                  <br />
                  <em>Márcalo en tu mapa.</em>
                </>
              ) : (
                <>
                  Explora el mundo.
                  <br />
                  <em>Márcalo en tu mapa.</em>
                </>
              )}
            </h1>
          </div>

          {targetProfile && session?.user?.id !== targetProfile.id && (
            <div
              className={`hero-target-follow-center ${
                justFollowed ? "hero-target-follow-center--just-followed" : ""
              } ${touchUnfollowActive ? "hero-target-follow-center--touch-unfollow" : ""}`}
              onMouseLeave={() => setJustFollowed(false)}
              onTouchStart={() => {
                if (justFollowed) setJustFollowed(false);
                if (targetConnStatus === "accepted") {
                  if (touchHoldTimerRef.current) clearTimeout(touchHoldTimerRef.current);
                  touchHoldTimerRef.current = setTimeout(() => {
                    setTouchUnfollowActive(true);
                  }, 120);
                }
              }}
              onTouchEnd={() => {
                if (touchHoldTimerRef.current) {
                  clearTimeout(touchHoldTimerRef.current);
                  touchHoldTimerRef.current = null;
                }
                setTouchUnfollowActive(false);
                if (justFollowed) {
                  if (justFollowedTimerRef.current) clearTimeout(justFollowedTimerRef.current);
                  justFollowedTimerRef.current = setTimeout(() => {
                    setJustFollowed(false);
                  }, 800);
                }
              }}
              onTouchCancel={() => {
                if (touchHoldTimerRef.current) {
                  clearTimeout(touchHoldTimerRef.current);
                  touchHoldTimerRef.current = null;
                }
                setTouchUnfollowActive(false);
              }}
            >
              <button
                type="button"
                className={`hero-center-follow-btn ${
                  targetConnStatus === "accepted"
                    ? "hero-center-follow-btn--following"
                    : targetConnStatus === "pending"
                      ? "hero-center-follow-btn--pending"
                      : "hero-center-follow-btn--connect"
                } ${justFollowed ? "hero-center-follow-btn--just-followed" : ""} ${
                  touchUnfollowActive ? "hero-center-follow-btn--touch-unfollow" : ""
                }`}
                disabled={targetConnLoading}
                onClick={targetConnStatus ? onUnfollowTarget : onFollowTarget}
                onMouseLeave={() => setJustFollowed(false)}
                title={
                  targetConnStatus === "accepted"
                    ? "Siguiendo (clic para dejar de seguir)"
                    : targetConnStatus === "pending"
                      ? "Solicitud pendiente (clic para cancelar)"
                      : `Seguir a @${targetProfile.username}`
                }
                aria-label={
                  targetConnStatus === "accepted"
                    ? "Dejar de seguir"
                    : targetConnStatus === "pending"
                      ? "Cancelar solicitud"
                      : "Seguir"
                }
              >
                {targetConnStatus === "accepted" ? (
                  <>
                    <UserRoundCheck
                      className="hero-center-follow-icon hero-center-follow-icon--check"
                      size={18}
                      strokeWidth={2.2}
                    />
                    <UserRoundMinus
                      className="hero-center-follow-icon hero-center-follow-icon--minus"
                      size={18}
                      strokeWidth={2.2}
                    />
                  </>
                ) : targetConnStatus === "pending" ? (
                  <UserRoundArrowLeft
                    className="hero-center-follow-icon"
                    size={18}
                    strokeWidth={2.2}
                  />
                ) : (
                  <UserRoundPlus
                    className="hero-center-follow-icon"
                    size={18}
                    strokeWidth={2.2}
                  />
                )}
              </button>
              <span
                className={`hero-center-follow-label ${
                  targetConnStatus === "accepted"
                    ? "hero-center-follow-label--following"
                    : targetConnStatus === "pending"
                      ? "hero-center-follow-label--pending"
                      : "hero-center-follow-label--connect"
                }`}
                onClick={
                  targetConnLoading
                    ? undefined
                    : targetConnStatus
                      ? onUnfollowTarget
                      : onFollowTarget
                }
              >
                {targetConnStatus === "accepted"
                  ? "Siguiendo"
                  : targetConnStatus === "pending"
                    ? "pendiente"
                    : "Seguir"}
              </span>
            </div>
          )}

          <aside className="hero-stat" suppressHydrationWarning>
            <strong suppressHydrationWarning>
              <span suppressHydrationWarning>{achievedCount}</span>
              <small suppressHydrationWarning> / {totalCount}</small>
            </strong>
            <span suppressHydrationWarning>{modeUnit}</span>
            <div className="progress">
              <span style={{ width: `${completion}%` }} suppressHydrationWarning />
            </div>
          </aside>
        </div>

        {hasBothModes && (
          <div
            className={`app-mode-switch hide-on-desktop ${
              isPeaks ? "app-mode-switch--peaks" : "app-mode-switch--countries"
            }`}
            style={{ marginTop: 10, display: "flex", width: "fit-content" }}
            onTouchStart={onSwipeTouchStart}
            onTouchEnd={onSwipeTouchEnd}
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
      </section>

      {!isSupabaseConfigured && (
        <section className="configuration-note">
          <strong>Configuración pendiente.</strong> El diseño está listo; añade las dos variables de
          Supabase del archivo <code>.env.example</code> para activar cuentas, progreso y fotos.
        </section>
      )}
    </>
  );
}
