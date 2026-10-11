"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SummitTracker } from "./summit-tracker";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-context";

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
}: {
  username: string;
  initialMode?: "peaks" | "countries";
  initialExperiences?: boolean;
}) {
  const { session, profile: myProfile } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
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
      setProfile(profileData);
      setLoading(false);
    }
    loadData();
  }, [username, session]);

  if (loading) return <div style={{ padding: "4rem", textAlign: "center" }}>Cargando perfil...</div>;

  if (error || !profile) return (
    <div style={{ padding: "4rem", textAlign: "center" }}>
      <h2>{error}</h2>
      <Link href="/social" className="button button--outline">Volver a Social</Link>
    </div>
  );

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
      mode={activeMode}
      onSwitchMode={setMode}
      initialExperiencesMode={initialExperiences}
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
