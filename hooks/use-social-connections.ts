"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { usePendingRequests, notifyPendingChanged } from "@/components/use-pending-requests";
import { usePendingTripInvitations } from "@/components/use-pending-trip-invitations";
import {
  getInitialSocialData,
  preloadSocialConnections,
  updateSocialCache,
  type ConnectionStatus,
  type SocialData,
  type SocialProfile,
} from "@/lib/social-cache";

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

export interface ConfirmDialogState {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
}

export function useSocialConnections({
  session,
  myProfile,
  isActive,
}: {
  session: Session | null;
  myProfile: any;
  isActive: boolean;
}) {
  const userId = session?.user?.id || myProfile?.id;
  const { hasPendingInvitations, refreshPending: refreshPendingInvitations } =
    usePendingTripInvitations();
  const hookPending = usePendingRequests();

  const initialSocial = useMemo(() => getInitialSocialData(userId), [userId]);

  const [followers, setFollowers] = useState<SocialProfile[]>(() => initialSocial.followers);
  const [following, setFollowing] = useState<SocialProfile[]>(() => initialSocial.following);
  const [connections, setConnections] = useState<Record<string, ConnectionStatus>>(
    () => initialSocial.connections
  );
  const [followerStatuses, setFollowerStatuses] = useState<Record<string, ConnectionStatus>>(
    () => initialSocial.followerStatuses
  );
  const [confirmConfig, setConfirmConfig] = useState<ConfirmDialogState | null>(null);

  const [userAscents, setUserAscents] = useState<any[]>(() => {
    if (userId && cachedProgressUserId === userId && cachedUserAscents.length > 0) {
      return cachedUserAscents;
    }
    if (userId) return getStoredProgressData<any>("ascents", userId) || [];
    return [];
  });
  const [userExpRecords, setUserExpRecords] = useState<any[]>(() => {
    if (userId && cachedProgressUserId === userId && cachedUserExpRecords.length > 0) {
      return cachedUserExpRecords;
    }
    if (userId) return getStoredProgressData<any>("exp_records", userId) || [];
    return [];
  });
  const [userCustomExp, setUserCustomExp] = useState<any[]>(() => {
    if (userId && cachedProgressUserId === userId && cachedUserCustomExp.length > 0) {
      return cachedUserCustomExp;
    }
    if (userId) return getStoredProgressData<any>("custom_exp", userId) || [];
    return [];
  });

  useEffect(() => {
    if (!userId) return;
    const initial = getInitialSocialData(userId);
    if (initial.lastFetched > 0 || initial.followers.length > 0 || initial.following.length > 0) {
      setFollowers(initial.followers);
      setFollowing(initial.following);
      setConnections(initial.connections);
      setFollowerStatuses(initial.followerStatuses);
    }
  }, [userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePreload = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && (!userId || detail.userId === userId) && detail.socialData) {
        const d = detail.socialData as SocialData;
        setFollowers(d.followers);
        setFollowing(d.following);
        setConnections(d.connections);
        setFollowerStatuses(d.followerStatuses);
      }
    };
    window.addEventListener("atlas:social-preloaded", handlePreload);
    return () => window.removeEventListener("atlas:social-preloaded", handlePreload);
  }, [userId]);

  // Preload social connections cleanly (.neq("is_test", true) is enforced in preloadSocialConnections)
  useEffect(() => {
    if (!session?.user?.id) return;
    const uid = session.user.id;
    let ignore = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const loadConnections = async () => {
      const data = await preloadSocialConnections(uid, Boolean(hookPending));
      if (!ignore && data) {
        setFollowers(data.followers);
        setFollowing(data.following);
        setConnections(data.connections);
        setFollowerStatuses(data.followerStatuses);
      }
    };

    if (isActive) loadConnections();
    else timer = setTimeout(() => { if (!ignore) loadConnections(); }, 500);

    return () => {
      ignore = true;
      if (timer) clearTimeout(timer);
    };
  }, [session?.user?.id, isActive, hookPending]);

  // Fetch user progress in parallel for hero counters & StatsModal
  useEffect(() => {
    if (!session?.user?.id || !supabase) return;
    const uid = session.user.id;
    let ignore = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchUserProgress = async () => {
      try {
        const [ascentsRes, expRes, customRes] = await Promise.all([
          supabase!.from("ascents").select("*").eq("user_id", uid),
          supabase!
            .from("experience_records")
            .select("experience_id, sub_item_id, is_wishlist")
            .eq("user_id", uid),
          supabase!.from("custom_experiences").select("id, name, sub_items").eq("user_id", uid),
        ]);

        if (ignore) return;
        if (ascentsRes.data) {
          setUserAscents(ascentsRes.data);
          cachedUserAscents = ascentsRes.data;
          try {
            localStorage.setItem(`app_tracker_ascents_${uid}`, JSON.stringify(ascentsRes.data));
          } catch {
            /* ignore */
          }
        }
        if (expRes.data) {
          setUserExpRecords(expRes.data);
          cachedUserExpRecords = expRes.data;
          try {
            localStorage.setItem(`app_tracker_exp_records_${uid}`, JSON.stringify(expRes.data));
          } catch {
            /* ignore */
          }
        }
        if (customRes.data) {
          setUserCustomExp(customRes.data);
          cachedUserCustomExp = customRes.data;
          try {
            localStorage.setItem(`app_tracker_custom_exp_${uid}`, JSON.stringify(customRes.data));
          } catch {
            /* ignore */
          }
        }
        cachedProgressUserId = uid;
      } catch (err) {
        console.error("Error fetching progress for social:", err);
      }
    };

    if (isActive) fetchUserProgress();
    else timer = setTimeout(() => { if (!ignore) fetchUserProgress(); }, 800);

    return () => {
      ignore = true;
      if (timer) clearTimeout(timer);
    };
  }, [isActive, session?.user?.id]);

  const followingUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, status] of Object.entries(connections)) {
      if (status === "accepted") ids.add(id);
    }
    for (const p of following) {
      if (connections[p.id] !== "pending") ids.add(p.id);
    }
    return Array.from(ids);
  }, [connections, following]);

  const acceptedFollowers = useMemo(
    () => followers.filter((p) => followerStatuses[p.id] === "accepted"),
    [followers, followerStatuses]
  );

  const pendingFollowers = useMemo(
    () => followers.filter((p) => followerStatuses[p.id] === "pending"),
    [followers, followerStatuses]
  );

  const hasPendingRequests = Boolean(
    (myProfile && !myProfile.is_public && Object.values(followerStatuses).includes("pending")) ||
      pendingFollowers.length > 0 ||
      hookPending
  );

  const connect = useCallback(
    async (profileId: string, isPublic: boolean) => {
      if (!session || !supabase) return;
      const newStatus: ConnectionStatus = isPublic ? "accepted" : "pending";
      const { error } = await supabase.from("connections").insert({
        follower_id: session.user.id,
        following_id: profileId,
        status: newStatus,
      });

      if (!error) {
        setConnections((prev) => ({ ...prev, [profileId]: newStatus }));
        const profileToAdd = followers.find((p) => p.id === profileId);
        if (profileToAdd && !following.some((p) => p.id === profileId)) {
          setFollowing((prev) => [...prev, profileToAdd]);
        }
        updateSocialCache(session.user.id, (prev) => ({
          ...prev,
          connections: { ...prev.connections, [profileId]: newStatus },
          following:
            profileToAdd && !prev.following.some((p) => p.id === profileId)
              ? [...prev.following, profileToAdd]
              : prev.following,
        }));
      }
    },
    [session, followers, following]
  );

  const performUnfollow = useCallback(
    async (profileId: string) => {
      if (!session || !supabase) return;
      const { error } = await supabase
        .from("connections")
        .delete()
        .eq("follower_id", session.user.id)
        .eq("following_id", profileId);

      if (!error) {
        setConnections((prev) => {
          const next = { ...prev };
          delete next[profileId];
          return next;
        });
        setFollowing((prev) => prev.filter((p) => p.id !== profileId));
        updateSocialCache(session.user.id, (prev) => {
          const nextConn = { ...prev.connections };
          delete nextConn[profileId];
          return {
            ...prev,
            connections: nextConn,
            following: prev.following.filter((p) => p.id !== profileId),
          };
        });
      }
    },
    [session]
  );

  const unfollow = useCallback(
    (profileId: string, username: string) => {
      setConfirmConfig({
        isOpen: true,
        message: `¿Quieres dejar de seguir a @${username}?`,
        onConfirm: () => performUnfollow(profileId),
      });
    },
    [performUnfollow]
  );

  const applyFollowAccepted = useCallback(
    (followerId: string) => {
      setFollowerStatuses((prev) => ({ ...prev, [followerId]: "accepted" as ConnectionStatus }));
      if (session?.user?.id) {
        updateSocialCache(session.user.id, (prev) => ({
          ...prev,
          followerStatuses: { ...prev.followerStatuses, [followerId]: "accepted" },
        }));
      }
    },
    [session?.user?.id]
  );

  const applyFollowRejected = useCallback(
    (followerId: string) => {
      setFollowerStatuses((prev) => {
        const next = { ...prev };
        delete next[followerId];
        return next;
      });
      setFollowers((prev) => prev.filter((p) => p.id !== followerId));
      if (session?.user?.id) {
        updateSocialCache(session.user.id, (prev) => {
          const nextStatus = { ...prev.followerStatuses };
          delete nextStatus[followerId];
          return {
            ...prev,
            followerStatuses: nextStatus,
            followers: prev.followers.filter((p) => p.id !== followerId),
          };
        });
      }
    },
    [session?.user?.id]
  );

  const acceptRequest = useCallback(
    async (profileId: string) => {
      if (!session || !supabase) return;
      const { error } = await supabase
        .from("connections")
        .update({ status: "accepted" })
        .eq("follower_id", profileId)
        .eq("following_id", session.user.id);
      if (!error) {
        applyFollowAccepted(profileId);
        notifyPendingChanged();
      }
    },
    [session, applyFollowAccepted]
  );

  const rejectRequest = useCallback(
    async (profileId: string) => {
      if (!session || !supabase) return;
      const { error } = await supabase
        .from("connections")
        .delete()
        .eq("follower_id", profileId)
        .eq("following_id", session.user.id);
      if (!error) {
        applyFollowRejected(profileId);
        notifyPendingChanged();
      }
    },
    [session, applyFollowRejected]
  );

  const performRemoveFollower = useCallback(
    async (profileId: string) => {
      if (!session || !supabase) return;
      const { error } = await supabase
        .from("connections")
        .delete()
        .eq("follower_id", profileId)
        .eq("following_id", session.user.id);
      if (!error) applyFollowRejected(profileId);
    },
    [session, applyFollowRejected]
  );

  const removeFollower = useCallback(
    (profileId: string, username: string) => {
      setConfirmConfig({
        isOpen: true,
        message: `¿Quieres eliminar a @${username} de tus seguidores?`,
        onConfirm: () => performRemoveFollower(profileId),
      });
    },
    [performRemoveFollower]
  );

  return {
    followers,
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
  };
}
