"use client";

import { useEffect, useState } from "react";
import { getPhotoDisplayUrl } from "@/lib/photo-client";
import { supabase } from "@/lib/supabase";
import { SummitTracker } from "./summit-tracker";
import type { InitialTrackerData } from "./tracker/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-context";
import { IconLogo } from "./icons";

type Profile = {
  id: string;
  username: string;
  avatar_url: string | null;
  is_public: boolean;
  enable_peaks?: boolean;
  enable_countries?: boolean;
  enable_experiences?: boolean;
  is_test?: boolean | null;
};

const PROFILE_CACHE_TTL_MS = 60 * 1000;
const profileCacheByUsername: Record<string, { profile: Profile; cachedAt: number }> = {};
const trackerCacheByUserId: Record<string, InitialTrackerData> = {};

export function ProfileView({
  username,
  initialMode = "countries",
  initialExperiences = false,
  fromTab,
  initialRecord,
  initialProfile = null,
  initialTrackerData = null,
}: {
  username: string;
  initialMode?: "peaks" | "countries";
  initialExperiences?: boolean;
  fromTab?: "ranking" | "social" | "mapa";
  initialRecord?: string;
  initialProfile?: Profile | null;
  initialTrackerData?: InitialTrackerData | null;
}) {
  const { session, profile: myProfile } = useAuth();

  if (initialProfile) {
    profileCacheByUsername[username] = { profile: initialProfile, cachedAt: Date.now() };
  }
  if (initialTrackerData && initialProfile?.id === initialTrackerData.userId) {
    trackerCacheByUserId[initialTrackerData.userId] = initialTrackerData;
  }

  const cachedEntry = profileCacheByUsername[username];
  const hasFreshClientCache =
    Boolean(cachedEntry) && Date.now() - cachedEntry.cachedAt < PROFILE_CACHE_TTL_MS;
  const seedProfile = initialProfile ?? (hasFreshClientCache ? cachedEntry.profile : null);

  const [profile, setProfile] = useState<Profile | null>(seedProfile);
  const [resolvedTrackerData, setResolvedTrackerData] = useState<InitialTrackerData | null>(() =>
    initialTrackerData ?? (seedProfile ? trackerCacheByUserId[seedProfile.id] ?? null : null)
  );
  const [initialConnStatus, setInitialConnStatus] = useState<"pending" | "accepted" | null>(null);
  const [loading, setLoading] = useState<boolean>(() => !seedProfile);
  const [loadingAvatarUrl, setLoadingAvatarUrl] = useState<string | null>(() =>
    seedProfile?.avatar_url ? getPhotoDisplayUrl(seedProfile.avatar_url) : null
  );
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"peaks" | "countries">(initialMode);
  const router = useRouter();

  // Warm vector TopoJSON lazily without adding Leaflet to the initial route bundle
  useEffect(() => {
    void import("@/lib/geo-loader")
      .then((geo) => (initialMode === "peaks" ? geo.fetchSpainGeo() : geo.fetchWorldGeo()))
      .catch(() => {});
  }, [initialMode]);

  useEffect(() => {
    if (initialRecord && typeof window !== "undefined") {
      try {
        sessionStorage.setItem("auto_open_panel", initialRecord);
      } catch (err) {
        console.warn("Could not set sessionStorage:", err);
      }
      if (!window.location.hash.startsWith("#panel")) {
        const targetHash = `#panel=${encodeURIComponent(initialRecord)}`;
        window.history.replaceState({ hasPanel: true }, "", targetHash);
      }
    }
  }, [initialRecord]);

  const handleNavigate = (path: string) => {
    router.push(path);
  };

  const sessionUserId = session?.user?.id || null;

  useEffect(() => {
    if (!supabase) return;

    const cached = profileCacheByUsername[username];
    const cachedValid = cached && Date.now() - cached.cachedAt < PROFILE_CACHE_TTL_MS;
    const preloaded = initialProfile ?? (cachedValid ? cached.profile : null);

    if (preloaded) {
      setError("");
      setProfile(preloaded);
      setResolvedTrackerData(
        initialTrackerData ?? trackerCacheByUserId[preloaded.id] ?? null
      );
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function loadData() {
      setError("");
      setLoading(true);
      const { data: profileData, error: profileError } = await supabase!
        .from("profiles")
        .select("*")
        .eq("username", username)
        .single();

      if (cancelled) return;

      if (profileError || !profileData || (profileData.is_test && (!sessionUserId || sessionUserId !== profileData.id))) {
        setError("Usuario no encontrado.");
        setLoading(false);
        return;
      }

      profileCacheByUsername[username] = { profile: profileData, cachedAt: Date.now() };
      setLoadingAvatarUrl(profileData.avatar_url ? getPhotoDisplayUrl(profileData.avatar_url) : null);
      setProfile(profileData);
      setLoading(false);
    }
    loadData();
    return () => {
      cancelled = true;
    };
  }, [username, sessionUserId, initialProfile, initialTrackerData]);

  // Fetch viewer <-> target follow status without blocking initial profile render
  const profileId = profile?.id ?? null;
  useEffect(() => {
    if (!supabase || !profileId || !sessionUserId || sessionUserId === profileId) {
      setInitialConnStatus(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("connections")
      .select("status")
      .eq("follower_id", sessionUserId)
      .eq("following_id", profileId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setInitialConnStatus(data ? (data.status as "pending" | "accepted") : null);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, sessionUserId]);

  if (loading) {
    const initial = username ? username.charAt(0).toUpperCase() : "?";
    return (
      <main className="profile-loading-view" style={{ minHeight: "100vh", background: "var(--paper)" }}>
        <header className="topbar">
          <Link className="brand" href="/">
            <IconLogo className="brand-icon" />
            <span>
              <b>Atlas</b>
            </span>
          </Link>
          <nav>
            <Link
              href="/"
              className={`topbar-nav-link topbar-nav-link--mapa ${!fromTab || fromTab === "mapa" ? "topbar-nav-link--active" : ""}`}
            >
              Mapa
            </Link>
            <Link
              href="/social"
              className={`topbar-nav-link topbar-nav-link--social ${fromTab === "social" ? "topbar-nav-link--active" : ""}`}
            >
              Social
            </Link>
            <Link
              href="/ranking"
              className={`topbar-nav-link topbar-nav-link--ranking ${fromTab === "ranking" ? "topbar-nav-link--active" : ""}`}
            >
              Ranking
            </Link>
          </nav>
        </header>
        <div style={{ padding: "3rem 1rem", textAlign: "center", color: "var(--muted)", maxWidth: 480, margin: "0 auto" }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "var(--sand)",
              margin: "0 auto 16px",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: loadingAvatarUrl ? undefined : "pulse 1.5s ease-in-out infinite",
              boxShadow: loadingAvatarUrl ? "0 0 0 3px var(--pine)" : undefined,
            }}
          >
            {loadingAvatarUrl ? (
              <img
                src={getPhotoDisplayUrl(loadingAvatarUrl)}
                alt={username}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--pine)" }}>{initial}</span>
            )}
          </div>
          <h2 style={{ fontFamily: "Playfair Display, serif", fontSize: "1.4rem", margin: "0 0 8px", color: "var(--ink)" }}>
            @{username}
          </h2>
          <p style={{ fontSize: "14px", margin: 0, opacity: 0.8 }}>Cargando perfil…</p>
        </div>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--paper)" }}>
        <header className="topbar">
          <Link className="brand" href="/">
            <IconLogo className="brand-icon" />
            <span>
              <b>Atlas</b>
            </span>
          </Link>
        </header>
        <div style={{ padding: "4rem", textAlign: "center" }}>
          <h2>{error}</h2>
          <Link href={fromTab === "ranking" ? "/ranking" : "/social"} className="button button--outline" style={{ marginTop: "16px" }}>
            Volver a {fromTab === "ranking" ? "Ranking" : "Social"}
          </Link>
        </div>
      </main>
    );
  }

  const isMe = session?.user.id === profile.id;
  const viewerEnablePeaks = !myProfile || myProfile.enable_peaks !== false;
  const viewerEnableCountries = !myProfile || myProfile.enable_countries !== false;
  const targetEnablePeaks = !profile || profile.enable_peaks !== false;
  const targetEnableCountries = !profile || profile.enable_countries !== false;

  const effectiveEnablePeaks = viewerEnablePeaks && targetEnablePeaks;
  const effectiveEnableCountries = viewerEnableCountries && targetEnableCountries;

  const activeMode =
    mode === "peaks" && !effectiveEnablePeaks
      ? "countries"
      : mode === "countries" && !effectiveEnableCountries
      ? "peaks"
      : mode;

  return (
    <SummitTracker
      key={profile.id}
      mode={activeMode}
      onSwitchMode={setMode}
      initialExperiencesMode={initialExperiences}
      fromTab={fromTab}
      initialTargetConnStatus={initialConnStatus}
      initialTrackerData={resolvedTrackerData}
      targetProfile={
        isMe
          ? undefined
          : {
              id: profile.id,
              username: profile.username,
              enable_peaks: effectiveEnablePeaks,
              enable_countries: effectiveEnableCountries,
              is_public: profile.is_public,
            }
      }
      onNavigate={handleNavigate}
    />
  );
}
