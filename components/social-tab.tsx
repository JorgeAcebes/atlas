"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { AuthDialog } from "./auth-dialog";
import { IconLogo } from "./icons";
import { ProfileSettings } from "./profile-settings";
import { ConfirmModal } from "./confirm-modal";
import { FeedTab } from "./feed-tab";
import { useAuth } from "./auth-context";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";
import { peaks } from "@/data/peaks";
import { countries } from "@/data/countries";
import { predefinedCategories } from "@/data/experiences";
import { UserRoundCheck } from "lucide-react";
import { usePendingRequests } from "./use-pending-requests";

type Profile = {
  id: string;
  username: string;
  avatar_url: string | null;
  is_public: boolean;
};

type ConnectionStatus = 'pending' | 'accepted' | null;

let cachedConnections: Record<string, ConnectionStatus> = {};
let cachedFollowerStatuses: Record<string, ConnectionStatus> = {};
let cachedFollowers: Profile[] = [];
let cachedFollowing: Profile[] = [];
let cachedDataUserId: string | null = null;
let cachedConnectionsLastFetched = 0;
let isFetchingSocial = false;
const SOCIAL_CACHE_TTL = 60 * 1000;

let cachedUserAscents: any[] = [];
let cachedUserExpRecords: any[] = [];
let cachedUserCustomExp: any[] = [];
let cachedProgressUserId: string | null = null;

function getStoredProgressData<T>(key: string, userId: string): T[] | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = localStorage.getItem(`app_tracker_${key}_${userId}`);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return null;
}

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
  const enablePeaks = !myProfile || myProfile.enable_peaks !== false;
  const enableCountries = !myProfile || myProfile.enable_countries !== false;
  const enableExperiences = enableCountries && (!myProfile || myProfile.enable_experiences !== false);
  const hasBothModes = enablePeaks && enableCountries;

  const [currentMode, setCurrentMode] = useState<"countries" | "peaks">(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const urlChallenge = urlParams.get("challenge");
      if (urlChallenge === "peaks" && enablePeaks) return "peaks";
      if (urlChallenge === "countries" && enableCountries) return "countries";

      const saved = localStorage.getItem("last_active_mode") as "countries" | "peaks" | null;
      if (saved === "peaks" && enablePeaks) return "peaks";
      if (saved === "countries" && enableCountries) return "countries";
      const path = localStorage.getItem("last_map_path");
      if (path === "/picos" && enablePeaks) return "peaks";
    }
    return enableCountries ? "countries" : "peaks";
  });

  const [experiencesMode, setExperiencesMode] = useState(() => {
    if (controlledExperiencesMode !== undefined) return controlledExperiencesMode;
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const urlView = urlParams.get("view");
      if (urlView === "experiences") return true;
      return localStorage.getItem("myExperiencesMode") === "true";
    }
    return false;
  });

  useEffect(() => {
    if (controlledExperiencesMode !== undefined && controlledExperiencesMode !== experiencesMode) {
      setExperiencesMode(controlledExperiencesMode);
    }
  }, [controlledExperiencesMode]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("myExperiencesMode", experiencesMode.toString());
    }
  }, [experiencesMode]);

  const [connectionsModal, setConnectionsModal] = useState<'followers' | 'following' | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [followingOnly, setFollowingOnly] = useState(false);

  useEffect(() => {
    if (!session) {
      setFollowingOnly(false);
    }
  }, [session]);

  function switchMode(target: "countries" | "peaks") {
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
    setMapLink(target === "peaks" ? "/picos" : "/");
    if (onSwitchMode) {
      onSwitchMode(target);
    }
  }

  useEffect(() => {
    if (controlledMode && controlledMode !== currentMode) {
      if (controlledMode === "peaks" && enablePeaks) {
        setCurrentMode("peaks");
        setMapLink("/picos");
      } else if (controlledMode === "countries" && enableCountries) {
        setCurrentMode("countries");
        setMapLink("/");
      }
    }
  }, [controlledMode, enablePeaks, enableCountries, currentMode]);

  useEffect(() => {
    if (!enablePeaks && currentMode === "peaks") {
      setCurrentMode("countries");
    } else if (!enableCountries && currentMode === "countries") {
      setCurrentMode("peaks");
    }
  }, [enablePeaks, enableCountries, currentMode]);

  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);

  const handleSwipeTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isActive) return;
    if (e.touches.length === 1) {
      swipeStartXRef.current = e.touches[0].clientX;
      swipeStartYRef.current = e.touches[0].clientY;
    }
  }, [isActive]);

  const handleSwipeTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isActive) return;
    if (swipeStartXRef.current === null || swipeStartYRef.current === null) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const diffX = endX - swipeStartXRef.current;
    const diffY = endY - swipeStartYRef.current;

    // Minimum swipe distance 50px, predominantly horizontal, max 35px vertical deviation
    if (Math.abs(diffX) >= 50 && Math.abs(diffY) <= 35 && Math.abs(diffX) >= Math.abs(diffY) * 2.0) {
      if (diffX < 0) {
        // Swipe left -> go to 196 Países
        if (currentMode === "peaks" && enableCountries) {
          switchMode("countries");
        }
      } else {
        // Swipe right -> go to 47 Picos
        if (currentMode === "countries" && enablePeaks) {
          switchMode("peaks");
        }
      }
    }
    swipeStartXRef.current = null;
    swipeStartYRef.current = null;
  }, [isActive, currentMode, enablePeaks, enableCountries]);

  useEffect(() => {
    if (!isActive) return;

    const handleGlobalTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        document.body.classList.contains("lightbox-open") ||
        document.querySelector(".lightbox-backdrop") ||
        target?.closest('.lightbox-backdrop, .lightbox-stage, .leaflet-container, input, textarea, select, .info-panel, .record-dialog, .auth-dialog, button, a')
      ) {
        return;
      }
      if (e.touches.length === 1) {
        swipeStartXRef.current = e.touches[0].clientX;
        swipeStartYRef.current = e.touches[0].clientY;
      }
    };

    const handleGlobalTouchEnd = (e: TouchEvent) => {
      if (
        document.body.classList.contains("lightbox-open") ||
        document.querySelector(".lightbox-backdrop")
      ) {
        swipeStartXRef.current = null;
        swipeStartYRef.current = null;
        return;
      }
      if (swipeStartXRef.current === null || swipeStartYRef.current === null) return;
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = endX - swipeStartXRef.current;
      const diffY = endY - swipeStartYRef.current;

      if (Math.abs(diffX) >= 50 && Math.abs(diffY) <= 35 && Math.abs(diffX) >= Math.abs(diffY) * 2.0) {
        if (diffX < 0) {
          if (currentMode === "peaks" && enableCountries) switchMode("countries");
        } else {
          if (currentMode === "countries" && enablePeaks) switchMode("peaks");
        }
      }
      swipeStartXRef.current = null;
      swipeStartYRef.current = null;
    };

    window.addEventListener("touchstart", handleGlobalTouchStart, { passive: true });
    window.addEventListener("touchend", handleGlobalTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleGlobalTouchStart);
      window.removeEventListener("touchend", handleGlobalTouchEnd);
    };
  }, [isActive, currentMode, enablePeaks, enableCountries]);

  useEffect(() => {
    // Precarga dinámicamente en segundo plano los módulos del mapa para navegación instantánea sin flash blanco
    const timer = setTimeout(() => {
      import("./world-map").catch(() => {});
      import("./spain-map").catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const [authOpen, setAuthOpen] = useState<"login" | "register" | false>(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mapLink, setMapLink] = useState(() => currentMode === "peaks" ? "/picos" : "/");
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setMapLink(currentMode === "peaks" ? "/picos" : "/");
  }, [currentMode]);

  const userId = session?.user.id || myProfile?.id;
  const isCurrentCache = Boolean(userId && cachedDataUserId === userId);

  const [followers, setFollowers] = useState<Profile[]>(() => isCurrentCache ? cachedFollowers : []);
  const [following, setFollowing] = useState<Profile[]>(() => isCurrentCache ? cachedFollowing : []);
  
  // A mapping of profile id to connection status
  const [connections, setConnections] = useState<Record<string, ConnectionStatus>>(() => isCurrentCache ? cachedConnections : {});
  const [followerStatuses, setFollowerStatuses] = useState<Record<string, ConnectionStatus>>(() => isCurrentCache ? cachedFollowerStatuses : {});

  const followingUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, status] of Object.entries(connections)) {
      if (status === "accepted") ids.add(id);
    }
    for (const p of following) {
      if (connections[p.id] !== "pending") {
        ids.add(p.id);
      }
    }
    return Array.from(ids);
  }, [connections, following]);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const acceptedFollowers = useMemo(() => {
    return followers.filter((p) => followerStatuses[p.id] === "accepted");
  }, [followers, followerStatuses]);

  const pendingFollowers = useMemo(() => {
    return followers.filter((p) => followerStatuses[p.id] === "pending");
  }, [followers, followerStatuses]);

  const hookPending = usePendingRequests();
  const hasPendingRequests = Boolean(
    (myProfile && !myProfile.is_public && Object.values(followerStatuses).includes("pending")) ||
    pendingFollowers.length > 0 ||
    hookPending
  );

  const [userAscents, setUserAscents] = useState<any[]>(() => {
    if (userId && cachedProgressUserId === userId && cachedUserAscents.length > 0) return cachedUserAscents;
    if (userId) return getStoredProgressData<any>("ascents", userId) || [];
    return [];
  });
  const [userExpRecords, setUserExpRecords] = useState<any[]>(() => {
    if (userId && cachedProgressUserId === userId && cachedUserExpRecords.length > 0) return cachedUserExpRecords;
    if (userId) return getStoredProgressData<any>("exp_records", userId) || [];
    return [];
  });
  const [userCustomExp, setUserCustomExp] = useState<any[]>(() => {
    if (userId && cachedProgressUserId === userId && cachedUserCustomExp.length > 0) return cachedUserCustomExp;
    if (userId) return getStoredProgressData<any>("custom_exp", userId) || [];
    return [];
  });

  useEffect(() => {
    if (!isActive || !session || !supabase) return;
    const uid = session.user.id;
    let ignore = false;

    async function fetchUserProgress() {
      try {
        const [ascentsRes, expRes, customRes] = await Promise.all([
          supabase!.from("ascents").select("summit_id, is_wishlist").eq("user_id", uid),
          supabase!.from("experience_records").select("experience_id, sub_item_id, is_wishlist").eq("user_id", uid),
          supabase!.from("custom_experiences").select("id, name, sub_items").eq("user_id", uid),
        ]);

        if (ignore) return;
        if (ascentsRes.data) {
          setUserAscents(ascentsRes.data);
          cachedUserAscents = ascentsRes.data;
          try {
            localStorage.setItem(`app_tracker_ascents_${uid}`, JSON.stringify(ascentsRes.data));
          } catch {}
        }
        if (expRes.data) {
          setUserExpRecords(expRes.data);
          cachedUserExpRecords = expRes.data;
          try {
            localStorage.setItem(`app_tracker_exp_records_${uid}`, JSON.stringify(expRes.data));
          } catch {}
        }
        if (customRes.data) {
          setUserCustomExp(customRes.data);
          cachedUserCustomExp = customRes.data;
          try {
            localStorage.setItem(`app_tracker_custom_exp_${uid}`, JSON.stringify(customRes.data));
          } catch {}
        }
        cachedProgressUserId = uid;
      } catch (err) {
        console.error("Error fetching progress for social:", err);
      }
    }

    fetchUserProgress();
    return () => {
      ignore = true;
    };
  }, [isActive, session]);

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
      const completed = userAscents.filter(
        (a) =>
          !a.is_wishlist &&
          !a.summit_id.startsWith("country-") &&
          !a.summit_id.startsWith("region-") &&
          !a.summit_id.startsWith("exp-") &&
          !a.summit_id.startsWith("custom-"),
      );
      const uniqueNames = new Set(
        completed
          .map((a) => peaks.find((p) => p.id === a.summit_id)?.name)
          .filter(Boolean),
      );
      const achieved = uniqueNames.size;
      const total = 47;
      const completion = Math.round((achieved / total) * 100);
      return {
        activeAchieved: achieved,
        activeTotal: total,
        activeUnit: "cimas conquistadas",
        activeCompletion: completion,
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
              (a.summit_id.startsWith("exp-") || a.summit_id.startsWith("custom-")),
          )
          .map((a) => ({
            experience_id: a.summit_id,
            sub_item_id: a.sub_item_id,
          })),
      ];

      let count = 0;
      for (const item of allItems) {
        if (!item.subItems || item.subItems.length === 0) {
          if (completedExpRecords.some((r) => r.experience_id === item.id)) {
            count++;
          }
        } else {
          const subItemIds = item.subItems.map((s: any) => s.id);
          const completedSubIds = new Set(
            completedExpRecords
              .filter((r) => r.experience_id === item.id && r.sub_item_id)
              .map((r) => r.sub_item_id)
          );
          if (
            subItemIds.length > 0 &&
            subItemIds.every((id: string) => completedSubIds.has(id))
          ) {
            count++;
          }
        }
      }

      const total = allItems.length || predefinedCategories.reduce((acc, cat) => acc + cat.experiences.length, 0);
      const completion = total > 0 ? Math.round((count / total) * 100) : 0;
      return {
        activeAchieved: count,
        activeTotal: total,
        activeUnit: "experiencias registradas",
        activeCompletion: completion,
      };
    }

    // Default: countries
    const uniqueCountries = new Set(
      userAscents
        .filter((a) => !a.is_wishlist && a.summit_id.startsWith("country-"))
        .map((a) => a.summit_id),
    );
    const achieved = uniqueCountries.size;
    const total = countries.length || 196;
    const completion = Math.round((achieved / total) * 100);
    return {
      activeAchieved: achieved,
      activeTotal: total,
      activeUnit: "países visitados",
      activeCompletion: completion,
    };
  }, [isPeaks, isExp, userAscents, userExpRecords, userCustomExp]);
  
  useEffect(() => {
    if (typeof window !== "undefined") {
      let stored = localStorage.getItem("last_map_path") || "/";
      if (!enablePeaks && stored === "/picos") stored = "/";
      if (!enableCountries && stored === "/") stored = "/picos";
      if (stored !== "/" && stored !== "/picos") stored = enablePeaks ? "/picos" : "/";
      setMapLink(currentMode === "peaks" ? "/picos" : "/");
    }
  }, [enablePeaks, enableCountries, currentMode]);

  useEffect(() => {
    if (!connectionsModal) return;
    lockScroll();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConnectionsModal(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      unlockScroll();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [connectionsModal]);

  useEffect(() => {
    if (!isActive || !session || !supabase) return;
    
    const now = Date.now();
    const isFresh = cachedDataUserId === session.user.id && (now - cachedConnectionsLastFetched < SOCIAL_CACHE_TTL);
    if (isFresh || isFetchingSocial) return;
    
    isFetchingSocial = true;
    async function fetchConnections() {
      // Fetch who I am following
      const { data: followingConns } = await supabase!
        .from('connections')
        .select('following_id, status')
        .eq('follower_id', session!.user.id);
        
      if (followingConns) {
        const connMap: Record<string, ConnectionStatus> = {};
        for (const conn of followingConns) {
          connMap[conn.following_id] = conn.status;
        }
        setConnections(connMap);
        cachedConnections = connMap;
        
        // Fetch profiles for following
        const followingIds = followingConns.map(c => c.following_id);
        if (followingIds.length > 0) {
          const { data: followingProfiles } = await supabase!
            .from('profiles')
            .select('*')
            .in('id', followingIds)
            .neq('is_test', true);
          if (followingProfiles) {
            setFollowing(followingProfiles);
            cachedFollowing = followingProfiles;
          }
        }
      }

      // Fetch my followers
      const { data: followerConns } = await supabase!
        .from('connections')
        .select('follower_id, status')
        .eq('following_id', session!.user.id);
        
      if (followerConns) {
        const followerIds = followerConns.map(c => c.follower_id);
        
        const fStatusMap: Record<string, ConnectionStatus> = {};
        for (const conn of followerConns) {
          fStatusMap[conn.follower_id] = conn.status;
        }
        setFollowerStatuses(fStatusMap);
        cachedFollowerStatuses = fStatusMap;

        if (followerIds.length > 0) {
          const { data: followerProfiles } = await supabase!
            .from('profiles')
            .select('*')
            .in('id', followerIds)
            .neq('is_test', true);
          if (followerProfiles) {
            setFollowers(followerProfiles);
            cachedFollowers = followerProfiles;
          }
        } else {
          setFollowers([]);
          cachedFollowers = [];
        }
      }

      cachedDataUserId = session!.user.id;
      cachedConnectionsLastFetched = Date.now();
      isFetchingSocial = false;
    }
    
    fetchConnections();
  }, [session, isActive, hookPending]);

  async function connect(profileId: string, isPublic: boolean) {
    if (!session || !supabase) return;
    
    const newStatus = isPublic ? 'accepted' : 'pending';
    const { error } = await supabase
      .from('connections')
      .insert({
        follower_id: session.user.id,
        following_id: profileId,
        status: newStatus
      });
      
    if (!error) {
      setConnections(prev => ({ ...prev, [profileId]: newStatus }));
      const profileToAdd = followers.find(p => p.id === profileId);
      if (profileToAdd && !following.find(p => p.id === profileId)) {
        setFollowing(prev => [...prev, profileToAdd]);
      }
    }
  }

  function unfollow(profileId: string, username: string) {
    setConfirmConfig({
      isOpen: true,
      message: `¿Quieres dejar de seguir a @${username}?`,
      onConfirm: () => performUnfollow(profileId),
    });
  }

  async function performUnfollow(profileId: string) {
    if (!session || !supabase) return;
    const { error } = await supabase
      .from('connections')
      .delete()
      .eq('follower_id', session.user.id)
      .eq('following_id', profileId);
      
    if (!error) {
      setConnections(prev => {
        const next = { ...prev };
        delete next[profileId];
        return next;
      });
      setFollowing(prev => prev.filter(p => p.id !== profileId));
    }
  }

  async function acceptRequest(profileId: string) {
    if (!session || !supabase) return;
    const { error } = await supabase
      .from('connections')
      .update({ status: 'accepted' })
      .eq('follower_id', profileId)
      .eq('following_id', session.user.id);
      
    if (!error) {
      setFollowerStatuses(prev => ({ ...prev, [profileId]: 'accepted' }));
    }
  }

  async function rejectRequest(profileId: string) {
    if (!session || !supabase) return;
    const { error } = await supabase
      .from('connections')
      .delete()
      .eq('follower_id', profileId)
      .eq('following_id', session.user.id);
      
    if (!error) {
      setFollowerStatuses(prev => {
        const next = { ...prev };
        delete next[profileId];
        return next;
      });
      setFollowers(prev => prev.filter(p => p.id !== profileId));
    }
  }

  function removeFollower(profileId: string, username: string) {
    setConfirmConfig({
      isOpen: true,
      message: `¿Quieres eliminar a @${username} de tus seguidores?`,
      onConfirm: () => performRemoveFollower(profileId),
    });
  }

  async function performRemoveFollower(profileId: string) {
    if (!session || !supabase) return;
    const { error } = await supabase
      .from('connections')
      .delete()
      .eq('follower_id', profileId)
      .eq('following_id', session.user.id);
      
    if (!error) {
      setFollowerStatuses(prev => {
        const next = { ...prev };
        delete next[profileId];
        return next;
      });
      setFollowers(prev => prev.filter(p => p.id !== profileId));
    }
  }

  function renderProfileItem(profile: Profile, context: 'followers' | 'following') {
    const isMe = session?.user.id === profile.id;
    const followingStatus = connections[profile.id];
    const followerStatus = followerStatuses[profile.id];

    return (
      <div
        key={profile.id}
        className="connections-modal-item"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'var(--cream, #faf8f5)',
          borderRadius: '12px',
          border: '1px solid var(--line)',
        }}
      >
        <Link
          href={`/perfil/${profile.username}?challenge=${currentMode}&from=social`}
          onClick={() => setConnectionsModal(null)}
          style={{
            textDecoration: 'none',
            color: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            minWidth: 0,
            flex: 1,
          }}
        >
          <div
            className="connections-item-avatar"
            style={{
              width: 38,
              height: 38,
              minWidth: 38,
              borderRadius: '50%',
              background: 'var(--pine)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '15px',
              color: 'white',
              overflow: 'hidden',
            }}
          >
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.username}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              profile.username.charAt(0).toUpperCase()
            )}
          </div>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: '14px',
                color: 'var(--ink)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              @{profile.username}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
              {profile.is_public ? 'Público' : 'Privado'}
            </div>
          </div>
        </Link>
        
        {!isMe && session && (
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0, marginLeft: '8px' }}>
            {context === 'followers' ? (
              followerStatus === 'pending' ? (
                <>
                  <button
                    className="button button--green"
                    style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '16px', minHeight: 'auto', height: 'auto' }}
                    onClick={() => acceptRequest(profile.id)}
                  >
                    Aceptar
                  </button>
                  <button
                    className="button button--outline"
                    style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '16px', minHeight: 'auto', height: 'auto' }}
                    onClick={() => rejectRequest(profile.id)}
                  >
                    Rechazar
                  </button>
                </>
              ) : (
                <button
                  className="button button--outline"
                  style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '16px', minHeight: 'auto', height: 'auto' }}
                  onClick={() => removeFollower(profile.id, profile.username)}
                >
                  Eliminar
                </button>
              )
            ) : (
              followingStatus === 'accepted' ? (
                <button
                  className="button button--outline"
                  style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '16px', minHeight: 'auto', height: 'auto' }}
                  onClick={() => unfollow(profile.id, profile.username)}
                >
                  Siguiendo
                </button>
              ) : followingStatus === 'pending' ? (
                <button
                  className="button button--outline"
                  style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '16px', minHeight: 'auto', height: 'auto' }}
                  onClick={() => unfollow(profile.id, profile.username)}
                >
                  Pendiente
                </button>
              ) : (
                <button
                  className="button button--purple"
                  style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '16px', minHeight: 'auto', height: 'auto' }}
                  onClick={() => connect(profile.id, profile.is_public)}
                >
                  Conectar
                </button>
              )
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <main className={isPeaks ? "" : isExp ? "mode-experiences" : "mode-countries"}>
      <header className="topbar">
        <Link
          className="brand"
          href={mapLink}
          title="Atlas"
          aria-label="Atlas"
          onClick={(e) => {
            if (onNavigate) {
              e.preventDefault();
              onNavigate(mapLink);
            }
          }}
        >
          <IconLogo className="brand-icon" />
          <span>
            <b>Atlas</b>
          </span>
        </Link>

        {hasBothModes && (
          <div className={`app-mode-switch hide-on-mobile ${currentMode === "peaks" ? "app-mode-switch--peaks" : "app-mode-switch--countries"}`}>
            <div className="app-mode-switch__indicator" />
            <button
              className={`app-mode-btn ${currentMode === "peaks" ? "active" : ""}`}
              onClick={() => switchMode("peaks")}
            >
              47 Picos
            </button>
            <button
              className={`app-mode-btn ${currentMode === "countries" ? "active" : ""}`}
              onClick={() => switchMode("countries")}
            >
              196 Países
            </button>
          </div>
        )}

        <nav>
          <Link href={mapLink} prefetch={true} className="topbar-nav-link topbar-nav-link--mapa">Mapa</Link>
          <Link href={`/social?challenge=${currentMode}`} className="topbar-nav-link topbar-nav-link--social topbar-nav-link--active" style={{ position: 'relative' }}>
            Social
            {hasPendingRequests ? (
              <span 
                onClick={(e) => {
                  e.preventDefault();
                  setConnectionsModal('followers');
                }}
                style={{ 
                  position: 'absolute', 
                  top: '-2px', 
                  right: '-6px', 
                  width: '8px', 
                  height: '8px', 
                  backgroundColor: 'red', 
                  borderRadius: '50%',
                  cursor: 'pointer'
                }} 
              />
            ) : null}
          </Link>
          <Link
            href={`/ranking?challenge=${currentMode}`}
            prefetch={true}
            className="topbar-nav-link topbar-nav-link--ranking"
            onClick={(e) => {
              if (onNavigate) {
                e.preventDefault();
                onNavigate(`/ranking?challenge=${currentMode}`);
              }
            }}
          >
            Ranking
          </Link>
          {(myProfile || session) ? (
            <button
              className="account-button"
              aria-label="Mi Perfil"
              title="Mi Perfil"
              onClick={() => setProfileOpen(true)}
            >
              {myProfile?.avatar_url ? (
                <img
                  src={myProfile.avatar_url}
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
            <button className="button button--outline" onClick={() => setAuthOpen("login")}>
              Entrar
            </button>
          )}
        </nav>
      </header>

      {/* ── Franja Vertebral (Hero) ────────────────── */}
      <section
        id="inicio"
        className="hero"
        onTouchStart={handleSwipeTouchStart}
        onTouchEnd={handleSwipeTouchEnd}
      >
        <div className={`hero-main hero-main--social ${(!session || !myProfile) ? "hero-main--social-anon" : ""}`}>
          {session && myProfile ? (
            <>
              <div className="hero-profile-wrap">
                <div
                  className="hero-profile-avatar"
                  onClick={() => onNavigate?.('profile')}
                  title="Ver mi perfil"
                >
                  {myProfile.avatar_url ? (
                    <img src={myProfile.avatar_url} alt={myProfile.username} />
                  ) : (
                    myProfile.username.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="hero-profile-info">
                  <h2 className="hero-profile-username" onClick={() => onNavigate?.('profile')}>
                    @{myProfile.username}
                  </h2>
                  <div className="hero-profile-connections">
                    <button
                      type="button"
                      className="hero-profile-conn-btn"
                      onClick={() => setConnectionsModal('followers')}
                    >
                      <strong>{acceptedFollowers.length}</strong> seguidores
                      {hasPendingRequests && <span className="hero-pending-dot" />}
                    </button>
                    <span className="hero-profile-conn-sep">·</span>
                    <button
                      type="button"
                      className="hero-profile-conn-btn"
                      onClick={() => setConnectionsModal('following')}
                    >
                      <strong>{following.length}</strong> siguiendo
                    </button>
                  </div>
                </div>
              </div>

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
            </>
          ) : (
            <>
              {/* hero-title-wrap hide-on-mobile: suprimido por petición del usuario */}
              <aside className="hero-stat hero-stat--anon">
                <button
                  className="button button--green"
                  onClick={() => setAuthOpen("login")}
                >
                  Iniciar sesión
                </button>
                <span style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                  Conecta con otros exploradores
                </span>
              </aside>
            </>
          )}
        </div>

        {hasBothModes && (
          <div
            className={`app-mode-switch hide-on-desktop ${currentMode === "peaks" ? "app-mode-switch--peaks" : "app-mode-switch--countries"}`}
            style={{ marginTop: 10, display: "flex", width: "fit-content" }}
            onTouchStart={handleSwipeTouchStart}
            onTouchEnd={handleSwipeTouchEnd}
          >
            <div className="app-mode-switch__indicator" />
            <button
              className={`app-mode-btn ${currentMode === "peaks" ? "active" : ""}`}
              onClick={() => switchMode("peaks")}
            >
              47 Picos
            </button>
            <button
              className={`app-mode-btn ${currentMode === "countries" ? "active" : ""}`}
              onClick={() => switchMode("countries")}
            >
              196 Países
            </button>
          </div>
        )}
      </section>

      {/* ── Main Feed Section (Centered, without redundant sidebars/buttons) ── */}
      <section className="page-container" style={{ paddingTop: '14px', paddingBottom: '70px', paddingLeft: '16px', paddingRight: '16px' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', width: '100%' }}>
          {/* Feed Controls: Search pill & Following button (Left) and Experiences pill (Right, aligned with posts on Desktop) */}
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
                  className={`diff-toggle diff-toggle--compact ${experiencesMode ? "diff-toggle--active" : ""}`}
                  onClick={() => {
                    const next = !experiencesMode;
                    setExperiencesMode(next);
                    if (onToggleExperiences) {
                      onToggleExperiences(next);
                    }
                    if (typeof window !== "undefined") {
                      const url = new URL(window.location.href);
                      if (next) {
                        url.searchParams.set("view", "experiences");
                      } else {
                        url.searchParams.delete("view");
                      }
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

      {/* ── Followers & Following Modal ────────────────── */}
      {connectionsModal && (
        <div
          className="lightbox-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            background: 'rgba(0,0,0,0.5)',
          }}
          onClick={() => setConnectionsModal(null)}
        >
          <div
            className="connections-modal-card"
            style={{
              background: 'white',
              borderRadius: '16px',
              maxWidth: '460px',
              width: '100%',
              maxHeight: '82vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              className="connections-modal-header"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className={`connections-modal-tab ${connectionsModal === 'followers' ? 'active' : ''}`}
                  style={{
                    border: 'none',
                    background: connectionsModal === 'followers' ? 'var(--pine)' : 'rgba(0,0,0,0.05)',
                    color: connectionsModal === 'followers' ? 'white' : 'var(--ink)',
                    borderRadius: '20px',
                    padding: '6px 14px',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => setConnectionsModal('followers')}
                >
                  Seguidores ({acceptedFollowers.length})
                </button>
                <button
                  type="button"
                  className={`connections-modal-tab ${connectionsModal === 'following' ? 'active' : ''}`}
                  style={{
                    border: 'none',
                    background: connectionsModal === 'following' ? 'var(--pine)' : 'rgba(0,0,0,0.05)',
                    color: connectionsModal === 'following' ? 'white' : 'var(--ink)',
                    borderRadius: '20px',
                    padding: '6px 14px',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => setConnectionsModal('following')}
                >
                  Siguiendo ({following.length})
                </button>
              </div>
              <button
                type="button"
                className="connections-modal-close"
                onClick={() => setConnectionsModal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '18px',
                  cursor: 'pointer',
                  color: 'var(--muted)',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div
              style={{
                padding: '16px 18px',
                overflowY: 'auto',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {connectionsModal === 'followers' ? (
                <>
                  {pendingFollowers.length > 0 && (
                    <div className="connections-pending-block" style={{ marginBottom: '14px' }}>
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.6px',
                          color: '#e53e3e',
                          marginBottom: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#e53e3e', display: 'inline-block' }} />
                        Solicitudes pendientes ({pendingFollowers.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {pendingFollowers.map((p) => renderProfileItem(p, 'followers'))}
                      </div>
                      <div style={{ borderBottom: '1px solid var(--line)', marginTop: '14px', marginBottom: '10px' }} />
                    </div>
                  )}

                  {acceptedFollowers.length > 0 && pendingFollowers.length > 0 && (
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.6px',
                        color: 'var(--muted)',
                        marginBottom: '6px',
                      }}
                    >
                      Seguidores ({acceptedFollowers.length})
                    </div>
                  )}

                  {acceptedFollowers.length === 0 && pendingFollowers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--muted)', fontSize: '14px' }}>
                      Aún no tienes seguidores.
                    </div>
                  ) : (
                    acceptedFollowers.map((p) => renderProfileItem(p, 'followers'))
                  )}
                </>
              ) : (
                following.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--muted)', fontSize: '14px' }}>
                    No sigues a nadie todavía.
                  </div>
                ) : (
                  following.map((p) => renderProfileItem(p, 'following'))
                )
              )}
            </div>
          </div>
        </div>
      )}
      
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} initialTab={authOpen === "login" ? "login" : "register"} />}
      {profileOpen && session && (
        <ProfileSettings
          session={session}
          onClose={() => setProfileOpen(false)}
          onProfileUpdate={() => refreshProfile()}
        />
      )}
      <ConfirmModal
        isOpen={!!confirmConfig?.isOpen}
        message={confirmConfig?.message || ""}
        onConfirm={() => {
          if (confirmConfig?.onConfirm) confirmConfig.onConfirm();
          setConfirmConfig(null);
        }}
        onCancel={() => setConfirmConfig(null)}
      />
    </main>
  );
}
