"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { UserRoundCheck } from "lucide-react";
import { peaks } from "@/data/peaks";
import { countries } from "@/data/countries";
import { predefinedCategories } from "@/data/experiences";
import { getLocationInfo } from "@/lib/stats-utils";
import {
  countCompletedCountriesUnique,
  countCompletedPeaksUnique,
  isExperienceItemCompleted,
} from "@/lib/progress-utils";
import { AppTopbar } from "@/components/layout/app-topbar";
import { useAuth } from "@/components/auth-context";
import { FeedTab } from "@/components/feed-tab";
import { SocialHero } from "@/components/social/social-hero";
import { ConnectionsModal } from "@/components/social/connections-modal";
import { useSocialConnections } from "@/hooks/use-social-connections";
import { useHorizontalModeSwipe } from "@/hooks/use-horizontal-mode-swipe";
import { usePwaInstall } from "@/hooks/use-pwa-install";

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
const InboxModal = dynamic(
  () => import("@/components/inbox-modal").then((m) => m.InboxModal),
  { ssr: false }
);
const QrModal = dynamic(
  () => import("@/components/qr-modal").then((m) => m.QrModal),
  { ssr: false }
);
const InstallPrompt = dynamic(
  () => import("@/components/install-prompt").then((m) => m.InstallPrompt),
  { ssr: false }
);
const ConfirmModal = dynamic(
  () => import("@/components/confirm-modal").then((m) => m.ConfirmModal),
  { ssr: false }
);

export function SocialTab({
  mode: controlledMode,
  experiencesMode: controlledExperiencesMode,
  onToggleExperiences,
  onSwitchMode,
  onNavigate,
  isActive = true,
}: {
  mode?: "countries" | "peaks";
  experiencesMode?: boolean;
  onToggleExperiences?: (active: boolean) => void;
  onSwitchMode?: (target: "countries" | "peaks") => void;
  onNavigate?: (tab: string) => void;
  isActive?: boolean;
}) {
  const { session, profile: myProfile, refreshProfile } = useAuth();
  const router = useRouter();
  const enablePeaks = !myProfile || myProfile.enable_peaks !== false;
  const enableCountries = !myProfile || myProfile.enable_countries !== false;
  const enableExperiences = enableCountries && (!myProfile || myProfile.enable_experiences !== false);
  const hasBothModes = enablePeaks && enableCountries;

  const [currentMode, setCurrentMode] = useState<"countries" | "peaks">(() => {
    if (controlledMode === "peaks" && enablePeaks) return "peaks";
    if (controlledMode === "countries" && enableCountries) return "countries";
    return enableCountries ? "countries" : "peaks";
  });
  const [experiencesMode, setExperiencesMode] = useState<boolean>(() =>
    controlledExperiencesMode !== undefined ? controlledExperiencesMode : false
  );
  const prevControlledModeRef = useRef(controlledMode);
  const prevControlledExpRef = useRef(controlledExperiencesMode);
  const [connectionsModal, setConnectionsModal] = useState<"followers" | "following" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [followingOnly, setFollowingOnly] = useState(false);

  const [inboxOpen, setInboxOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState<"login" | "register" | false>(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(() =>
    typeof window !== "undefined" ? window.location.hash === "#estadisticas" : false
  );
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [toastNotice, setToastNotice] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { installPromptOpen, setInstallPromptOpen, canInstallMobile, handleHeroInstallClick } =
    usePwaInstall();

  const {
    following,
    connections,
    followerStatuses,
    acceptedFollowers,
    pendingFollowers,
    followingUserIds,
    hasPendingRequests,
    hasPendingInvitations,
    refreshPendingInvitations,
    confirmConfig,
    setConfirmConfig,
    userAscents,
    userExpRecords,
    userCustomExp,
    connect,
    unfollow,
    acceptRequest,
    rejectRequest,
    removeFollower,
    applyFollowAccepted,
    applyFollowRejected,
  } = useSocialConnections({ session, myProfile, isActive });

  useEffect(() => {
    setMounted(true);
    const handleHash = () => setStatsOpen(window.location.hash === "#estadisticas");
    window.addEventListener("hashchange", handleHash);
    window.addEventListener("popstate", handleHash);
    return () => {
      window.removeEventListener("hashchange", handleHash);
      window.removeEventListener("popstate", handleHash);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlChallenge = urlParams.get("challenge");
      if (urlChallenge === "peaks" && enablePeaks) setCurrentMode("peaks");
      else if (urlChallenge === "countries" && enableCountries) setCurrentMode("countries");
      else if (controlledMode === undefined) {
        const saved = localStorage.getItem("last_active_mode") as "countries" | "peaks" | null;
        if (saved === "peaks" && enablePeaks) setCurrentMode("peaks");
        else if (saved === "countries" && enableCountries) setCurrentMode("countries");
      }
      if (controlledExperiencesMode === undefined) {
        const urlView = urlParams.get("view");
        if (urlView === "experiences" || localStorage.getItem("myExperiencesMode") === "true") {
          setExperiencesMode(true);
        }
      }
    } catch {
      /* ignore */
    }
  }, [enablePeaks, enableCountries, controlledMode, controlledExperiencesMode]);

  useEffect(() => {
    if (
      controlledExperiencesMode !== undefined &&
      controlledExperiencesMode !== prevControlledExpRef.current
    ) {
      prevControlledExpRef.current = controlledExperiencesMode;
      setExperiencesMode(controlledExperiencesMode);
    }
  }, [controlledExperiencesMode]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("myExperiencesMode", experiencesMode.toString());
    }
  }, [experiencesMode]);

  useEffect(() => {
    if (!session) setFollowingOnly(false);
  }, [session]);

  useEffect(() => {
    if (!session || typeof window === "undefined") return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("inbox") === "shared") {
        setInboxOpen(true);
      }
    } catch {
      /* ignore */
    }
  }, [session]);

  useEffect(() => {
    if (controlledMode && controlledMode !== prevControlledModeRef.current) {
      prevControlledModeRef.current = controlledMode;
      if (controlledMode === "peaks" && enablePeaks) setCurrentMode("peaks");
      else if (controlledMode === "countries" && enableCountries) setCurrentMode("countries");
    }
  }, [controlledMode, enablePeaks, enableCountries]);

  useEffect(() => {
    if (!enablePeaks && currentMode === "peaks") setCurrentMode("countries");
    else if (!enableCountries && currentMode === "countries") setCurrentMode("peaks");
  }, [enablePeaks, enableCountries, currentMode]);

  const switchMode = useCallback(
    (target: "countries" | "peaks") => {
      if (target === currentMode) return;
      if (target === "peaks" && !enablePeaks) return;
      if (target === "countries" && !enableCountries) return;
      setCurrentMode(target);
      if (typeof window !== "undefined") {
        localStorage.setItem("last_active_mode", target);
        localStorage.setItem("last_map_path", target === "peaks" ? "/picos" : "/");
        const url = new URL(window.location.href);
        url.searchParams.set("challenge", target);
        if (target === "countries" && experiencesMode) {
          url.searchParams.set("view", "experiences");
        } else if (target === "peaks") {
          url.searchParams.delete("view");
        }
        window.history.replaceState(null, "", url.toString());
      }
      onSwitchMode?.(target);
    },
    [currentMode, enablePeaks, enableCountries, experiencesMode, onSwitchMode]
  );

  const { handleTouchStart: handleSwipeTouchStart, handleTouchEnd: handleSwipeTouchEnd } =
    useHorizontalModeSwipe({
      isActive,
      isPeaks: currentMode === "peaks",
      canShowPeaks: enablePeaks,
      canShowCountries: enableCountries,
      onSwitchMode: switchMode,
    });

  const handleShareApp = useCallback(async () => {
    const shareUrl = typeof window !== "undefined" ? window.location.origin : "https://atlas.app";
    const shareTitle = "Atlas · 47 Picos & 196 Países";
    const shareText = "¡Únete a Atlas! Registra tus países visitados, experiencias y picos.";

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
        setToastNotice("Enlace copiado al portapapeles");
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToastNotice(null), 3000);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const isPeaks = currentMode === "peaks";
  const isExp = !isPeaks && experiencesMode;

  useEffect(() => {
    if (!isActive) return;
    if (isExp) {
      document.body.classList.add("mode-experiences");
      document.body.classList.remove("mode-countries");
    } else if (isPeaks) {
      document.body.classList.remove("mode-experiences");
      document.body.classList.remove("mode-countries");
    } else {
      document.body.classList.add("mode-countries");
      document.body.classList.remove("mode-experiences");
    }

    return () => {
      document.body.classList.remove("mode-experiences");
      document.body.classList.remove("mode-countries");
    };
  }, [isExp, isPeaks, isActive]);

  const { activeAchieved, activeTotal, activeUnit, activeCompletion } = useMemo(() => {
    if (isPeaks) {
      const achieved = countCompletedPeaksUnique(userAscents);
      return {
        activeAchieved: achieved,
        activeTotal: 47,
        activeUnit: "cimas conquistadas",
        activeCompletion: Math.round((achieved / 47) * 100),
      };
    }

    if (isExp) {
      const allPredefined = predefinedCategories.flatMap((cat) => cat.experiences);
      const allCustom = userCustomExp.map((ce) => ({
        id: ce.id,
        name: ce.name,
        subItems: ce.sub_items,
      }));
      const allItems = [...allPredefined, ...allCustom];

      const completedExpRecords = [
        ...userExpRecords.filter((r) => !r.is_wishlist),
        ...userAscents
          .filter(
            (a) =>
              !a.is_wishlist &&
              (a.summit_id?.startsWith("exp-") || a.summit_id?.startsWith("custom-"))
          )
          .map((a) => ({
            experience_id: a.summit_id,
            sub_item_id: a.sub_item_id,
          })),
      ];

      let count = 0;
      for (const item of allItems) {
        if (isExperienceItemCompleted(item, completedExpRecords)) count++;
      }

      const total =
        allItems.length ||
        predefinedCategories.reduce((acc, cat) => acc + cat.experiences.length, 0);
      return {
        activeAchieved: count,
        activeTotal: total,
        activeUnit: "experiencias registradas",
        activeCompletion: total > 0 ? Math.round((count / total) * 100) : 0,
      };
    }

    const achieved = countCompletedCountriesUnique(userAscents);
    const total = countries.length || 196;
    return {
      activeAchieved: achieved,
      activeTotal: total,
      activeUnit: "países visitados",
      activeCompletion: Math.round((achieved / total) * 100),
    };
  }, [isPeaks, isExp, userAscents, userExpRecords, userCustomExp]);

  return (
    <main className={isPeaks ? "" : isExp ? "mode-experiences" : "mode-countries"}>
      <AppTopbar
        activeTab="social"
        mode={currentMode}
        experiencesMode={experiencesMode}
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
        onOpenInbox={() => setInboxOpen(true)}
      />

      <SocialHero
        session={session}
        myProfile={myProfile}
        currentMode={currentMode}
        hasBothModes={hasBothModes}
        acceptedFollowersCount={acceptedFollowers.length}
        followingCount={following.length}
        hasPendingNotifications={hasPendingInvitations || hasPendingRequests}
        activeAchieved={activeAchieved}
        activeTotal={activeTotal}
        activeUnit={activeUnit}
        activeCompletion={activeCompletion}
        onSwipeTouchStart={handleSwipeTouchStart}
        onSwipeTouchEnd={handleSwipeTouchEnd}
        onSwitchMode={switchMode}
        onOpenInbox={() => setInboxOpen(true)}
        onOpenProfilePage={(username) => {
          const path = `/perfil/${username}`;
          if (onNavigate) onNavigate(path);
          else router.push(path);
        }}
        onOpenConnections={(tab) => setConnectionsModal(tab)}
        onShareApp={handleShareApp}
        onOpenQr={() => setQrModalOpen(true)}
        onOpenAuth={() => setAuthOpen("login")}
      />

      <section
        className="page-container"
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
              <div className="social-search-box">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="social-search-icon"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="search"
                  placeholder={
                    currentMode === "peaks"
                      ? "Usuario, picos, fecha..."
                      : isExp
                        ? "Usuario, experiencia, fecha..."
                        : "Usuario, país, fecha..."
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="social-search-input"
                  aria-label="Buscar en el feed social"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="social-search-clear"
                    onClick={() => setSearchQuery("")}
                    title="Limpiar búsqueda"
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                type="button"
                className={`social-following-btn ${followingOnly ? "social-following-btn--active" : ""}`}
                onClick={() => {
                  if (!session) {
                    setAuthOpen("login");
                    return;
                  }
                  setFollowingOnly((prev) => !prev);
                }}
                title={followingOnly ? "Ver todas las publicaciones" : "Ver solo a quienes sigues"}
                aria-pressed={followingOnly}
              >
                <UserRoundCheck size={14} className="social-following-icon" />
                <span>Siguiendo</span>
              </button>
            </div>

            {currentMode === "countries" && enableExperiences && (
              <div className="diff-toggle-wrap">
                <button
                  type="button"
                  className={`diff-toggle diff-toggle--compact ${
                    experiencesMode ? "diff-toggle--active" : ""
                  }`}
                  onClick={() => {
                    const next = !experiencesMode;
                    setExperiencesMode(next);
                    onToggleExperiences?.(next);
                    if (typeof window !== "undefined") {
                      const url = new URL(window.location.href);
                      if (next) url.searchParams.set("view", "experiences");
                      else url.searchParams.delete("view");
                      window.history.replaceState(null, "", url.toString());
                    }
                  }}
                  title={experiencesMode ? "Ocultar experiencias" : "Ver experiencias"}
                >
                  <svg
                    className="diff-toggle-icon"
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
                  Experiencias
                </button>
              </div>
            )}
          </div>

          <FeedTab
            session={session}
            isActive={isActive}
            onAuthRequired={() => setAuthOpen("login")}
            mode={currentMode}
            experiencesMode={experiencesMode}
            searchQuery={searchQuery}
            onClearSearch={() => setSearchQuery("")}
            followingOnly={followingOnly}
            followingUserIds={followingUserIds}
            onDisableFollowingOnly={() => setFollowingOnly(false)}
          />
        </div>
      </section>

      <ConnectionsModal
        modalMode={connectionsModal}
        session={session}
        currentMode={currentMode}
        acceptedFollowers={acceptedFollowers}
        pendingFollowers={pendingFollowers}
        following={following}
        connections={connections}
        followerStatuses={followerStatuses}
        onChangeTab={setConnectionsModal}
        onClose={() => setConnectionsModal(null)}
        onAcceptRequest={acceptRequest}
        onRejectRequest={rejectRequest}
        onRemoveFollower={removeFollower}
        onUnfollow={unfollow}
        onConnect={connect}
      />

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
          ascents={userAscents}
          experienceRecords={userExpRecords}
          customExperiences={userCustomExp}
          initialMode={isExp ? "experiences" : currentMode}
          onModeChange={(mode) => {
            if (mode === "peaks" && enablePeaks) {
              setCurrentMode("peaks");
              setExperiencesMode(false);
              onToggleExperiences?.(false);
              onSwitchMode?.("peaks");
            } else if (mode === "countries" && enableCountries) {
              setCurrentMode("countries");
              setExperiencesMode(false);
              onToggleExperiences?.(false);
              onSwitchMode?.("countries");
            } else if (mode === "experiences" && enableCountries) {
              setCurrentMode("countries");
              setExperiencesMode(true);
              onToggleExperiences?.(true);
              onSwitchMode?.("countries");
            }
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
              : loc.type === "experience"
                ? `/?exp=${encodeURIComponent(cleanId)}#panel=${encodeURIComponent(cleanId)}`
                : `/#panel=${encodeURIComponent(cleanId)}`;
            if (onNavigate) onNavigate(targetPath);
            else window.location.href = targetPath;
          }}
        />
      )}
      {inboxOpen && (
        <InboxModal
          isOpen={inboxOpen}
          onClose={() => setInboxOpen(false)}
          onInvitationAccepted={refreshPendingInvitations}
          onInvitationRejected={refreshPendingInvitations}
          onFollowAccepted={(followerId) => {
            applyFollowAccepted(followerId);
            refreshPendingInvitations();
          }}
          onFollowRejected={(followerId) => {
            applyFollowRejected(followerId);
            refreshPendingInvitations();
          }}
          onPendingChanged={refreshPendingInvitations}
        />
      )}
      {confirmConfig?.isOpen && (
        <ConfirmModal
          isOpen={confirmConfig.isOpen}
          message={confirmConfig.message}
          onConfirm={() => {
            confirmConfig.onConfirm();
            setConfirmConfig(null);
          }}
          onCancel={() => setConfirmConfig(null)}
        />
      )}
      {qrModalOpen && <QrModal isOpen={qrModalOpen} onClose={() => setQrModalOpen(false)} />}
      <InstallPrompt
        isActive={isActive}
        manualOpen={installPromptOpen}
        onManualClose={() => setInstallPromptOpen(false)}
      />
      {toastNotice && (
        <div className="toast" role="status">
          {toastNotice}
        </div>
      )}
    </main>
  );
}
