"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type UserProfile = {
  id: string;
  username: string;
  avatar_url: string | null;
  is_public: boolean;
  enable_experiences?: boolean;
  enable_peaks?: boolean;
  enable_countries?: boolean;
  share_photos?: boolean;
  share_notes?: boolean;
  is_test?: boolean;
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  refreshProfile: (customSession?: Session | null) => Promise<void>;
  signOut: () => Promise<void>;
};

// Global in-memory cache to ensure session & profile survive across ANY page navigation or component mount
let globalSession: Session | null = null;
let globalProfile: UserProfile | null = null;
let isAuthInitialized = false;

function getStoredProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("app_user_profile");
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return null;
}

/** Persist a minimal session snapshot so full-page refresh starts with non-null session */
function persistSessionSnapshot(s: Session | null) {
  if (typeof window === "undefined") return;
  try {
    if (s) {
      localStorage.setItem("app_user_session", JSON.stringify({
        user: { id: s.user.id, email: s.user.email },
        access_token: s.access_token,
        refresh_token: s.refresh_token,
        expires_at: s.expires_at,
      }));
    } else {
      localStorage.removeItem("app_user_session");
    }
  } catch { /* ignore */ }
}

function getStoredSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("app_user_session");
    if (raw) return JSON.parse(raw) as Session;
    const profileRaw = localStorage.getItem("app_user_profile");
    if (profileRaw) {
      const p = JSON.parse(profileRaw);
      if (p?.id) {
        return {
          user: { id: p.id, email: "" },
          access_token: "",
          refresh_token: "",
          expires_at: 0,
        } as unknown as Session;
      }
    }
  } catch { /* ignore */ }
  return null;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  setProfile: () => {},
  refreshProfile: async () => {},
  signOut: async () => {},
});

export function persistProfileCookie(p: UserProfile | null) {
  if (typeof document === "undefined") return;
  try {
    if (p) {
      const data = {
        id: p.id,
        username: p.username,
        avatar_url: p.avatar_url,
        enable_experiences: p.enable_experiences,
        enable_peaks: p.enable_peaks,
        enable_countries: p.enable_countries,
      };
      document.cookie = `app_user_profile=${encodeURIComponent(JSON.stringify(data))}; path=/; max-age=31536000; SameSite=Lax`;
    } else {
      document.cookie = "app_user_profile=; path=/; max-age=0; SameSite=Lax";
    }
  } catch { /* ignore */ }
}

export function AuthProvider({
  children,
  initialProfile = null,
}: {
  children: React.ReactNode;
  initialProfile?: UserProfile | null;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(
    () => initialProfile || globalProfile || getStoredProfile()
  );
  const [session, setSession] = useState<Session | null>(() => {
    if (globalSession) return globalSession;
    const stored = getStoredSession();
    if (stored) return stored;
    const effProfile = initialProfile || globalProfile || getStoredProfile();
    if (effProfile?.id) {
      return {
        user: { id: effProfile.id, email: "" },
        access_token: "",
        refresh_token: "",
        expires_at: 0,
      } as unknown as Session;
    }
    return null;
  });
  const [loading, setLoading] = useState(
    !isAuthInitialized && !initialProfile && !globalProfile && !getStoredProfile()
  );

  const refreshProfile = useCallback(async (activeSession?: Session | null) => {
    const s = activeSession !== undefined ? activeSession : globalSession;
    if (!s || !supabase) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, is_public, enable_experiences, enable_peaks, enable_countries, share_photos, share_notes")
        .eq("id", s.user.id)
        .single();

      if (data && !error) {
        setProfile(data);
        globalProfile = data;
        persistProfileCookie(data);
        if (typeof window !== "undefined") {
          localStorage.setItem("app_user_profile", JSON.stringify(data));
        }
      }
    } catch (err) {
      console.error("Error refreshing profile:", err);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Error during signOut:", err);
    }
    globalSession = null;
    globalProfile = null;
    setSession(null);
    setProfile(null);
    persistSessionSnapshot(null);
    persistProfileCookie(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("app_user_profile");
    }
  }, []);

  useEffect(() => {
    // Restore cached profile on client if not already populated
    if (!globalProfile) {
      const stored = getStoredProfile();
      if (stored) {
        globalProfile = stored;
        setProfile(stored);
        persistProfileCookie(stored);
      }
    } else {
      persistProfileCookie(globalProfile);
    }

    if (!supabase) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    // Initial session load
    supabase.auth.getSession().then(({ data: { session: initSession } }) => {
      if (!isMounted) return;
      if (initSession) {
        globalSession = initSession;
        setSession(initSession);
        persistSessionSnapshot(initSession);
        if (!globalProfile || globalProfile.id !== initSession.user.id) {
          refreshProfile(initSession);
        } else {
          persistProfileCookie(globalProfile);
        }
      } else {
        // If Supabase confirms there is no session, clean up
        globalSession = null;
        setSession(null);
        persistSessionSnapshot(null);
        persistProfileCookie(null);
      }
      setLoading(false);
      isAuthInitialized = true;
    });

    // Listen for auth changes (sign in, sign out, token refresh)
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;

      if (event === "SIGNED_OUT") {
        globalSession = null;
        globalProfile = null;
        setSession(null);
        setProfile(null);
        persistSessionSnapshot(null);
        persistProfileCookie(null);
        if (typeof window !== "undefined") {
          localStorage.removeItem("app_user_profile");
        }
        return;
      }

      if (nextSession) {
        globalSession = nextSession;
        setSession(nextSession);
        persistSessionSnapshot(nextSession);
        if (!globalProfile || globalProfile.id !== nextSession.user.id) {
          refreshProfile(nextSession);
        } else {
          persistProfileCookie(globalProfile);
        }
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [refreshProfile]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user || null,
        profile,
        loading,
        setProfile,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
