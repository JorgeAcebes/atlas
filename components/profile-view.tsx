"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SummitTracker } from "./summit-tracker";
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
};

export function ProfileView({
  username,
  initialMode = "countries",
  initialExperiences = false,
  fromTab,
}: {
  username: string;
  initialMode?: "peaks" | "countries";
  initialExperiences?: boolean;
  fromTab?: "ranking" | "social" | "mapa";
}) {
  const { session, profile: myProfile } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initialConnStatus, setInitialConnStatus] = useState<"pending" | "accepted" | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAvatarUrl, setLoadingAvatarUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"peaks" | "countries">(initialMode);
  const router = useRouter();

  const handleNavigate = (path: string) => {
    router.push(path);
  };

  useEffect(() => {
    if (!supabase) return;
    async function loadData() {
      // 1. Fetch profile by username
      const { data: profileData, error: profileError } = await supabase!
        .from("profiles")
        .select("*")
        .eq("username", username)
        .single();

      if (profileError || !profileData || (profileData.is_test && (!session || session.user.id !== profileData.id))) {
        setError("Usuario no encontrado.");
        setLoading(false);
        return;
      }

      // Show avatar immediately while waiting for connection status
      setLoadingAvatarUrl(profileData.avatar_url ?? null);

      // 2. Fetch connection status before revealing SummitTracker so follow state is instantaneous
      let connStatus: "pending" | "accepted" | null = null;
      if (session?.user?.id && session.user.id !== profileData.id) {
        const { data: connData } = await supabase!
          .from("connections")
          .select("status")
          .eq("follower_id", session.user.id)
          .eq("following_id", profileData.id)
          .maybeSingle();

        if (connData) {
          connStatus = connData.status as "pending" | "accepted";
        }
      }

      setInitialConnStatus(connStatus);
      setProfile(profileData);
      setLoading(false);
    }
    loadData();
  }, [username, session]);

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
                src={loadingAvatarUrl}
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
