import { supabase } from "@/lib/supabase";

export type SocialProfile = {
  id: string;
  username: string;
  avatar_url: string | null;
  is_public: boolean;
};

export type ConnectionStatus = "pending" | "accepted" | null;

export type SocialData = {
  followers: SocialProfile[];
  following: SocialProfile[];
  connections: Record<string, ConnectionStatus>; // who I follow: following_id -> status
  followerStatuses: Record<string, ConnectionStatus>; // who follows me: follower_id -> status
  lastFetched: number;
};

const SOCIAL_CACHE_TTL = 60 * 1000; // 1 minute fresh window

const memorySocialCache: Record<string, SocialData> = {};
const inFlightPreload: Record<string, Promise<SocialData | null> | undefined> = {};

export function getStoredSocialData(userId: string): SocialData | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = localStorage.getItem(`app_social_data_${userId}`);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return null;
}

export function setStoredSocialData(userId: string, data: SocialData): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    localStorage.setItem(`app_social_data_${userId}`, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function getInitialSocialData(userId: string | null | undefined): SocialData {
  const empty: SocialData = {
    followers: [],
    following: [],
    connections: {},
    followerStatuses: {},
    lastFetched: 0,
  };
  if (!userId) return empty;

  if (memorySocialCache[userId]) {
    return memorySocialCache[userId];
  }

  const stored = getStoredSocialData(userId);
  if (stored) {
    memorySocialCache[userId] = stored;
    return stored;
  }

  return empty;
}

export function updateSocialCache(
  userId: string,
  updater: (prev: SocialData) => SocialData
): SocialData {
  const prev = getInitialSocialData(userId);
  const next = updater(prev);
  memorySocialCache[userId] = next;
  setStoredSocialData(userId, next);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("atlas:social-preloaded", { detail: { userId, socialData: next } })
    );
  }
  return next;
}

export async function preloadSocialConnections(
  userId: string,
  force = false
): Promise<SocialData | null> {
  if (!userId || !supabase) return null;

  const now = Date.now();
  const cached = memorySocialCache[userId];
  if (!force && cached && now - cached.lastFetched < SOCIAL_CACHE_TTL) {
    return cached;
  }

  if (inFlightPreload[userId]) {
    return inFlightPreload[userId];
  }

  const fetchPromise = (async () => {
    try {
      const [followingConnsRes, followerConnsRes] = await Promise.all([
        supabase
          .from("connections")
          .select("following_id, status")
          .eq("follower_id", userId),
        supabase
          .from("connections")
          .select("follower_id, status")
          .eq("following_id", userId),
      ]);

      const followingConns = followingConnsRes.data || [];
      const followerConns = followerConnsRes.data || [];

      const connMap: Record<string, ConnectionStatus> = {};
      for (const c of followingConns) {
        connMap[c.following_id] = c.status as ConnectionStatus;
      }

      const fStatusMap: Record<string, ConnectionStatus> = {};
      for (const c of followerConns) {
        fStatusMap[c.follower_id] = c.status as ConnectionStatus;
      }

      const followingIds = followingConns.map((c) => c.following_id);
      const followerIds = followerConns.map((c) => c.follower_id);

      const allProfileIds = Array.from(new Set([...followingIds, ...followerIds]));
      const profilesMap = new Map<string, SocialProfile>();

      if (allProfileIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username, avatar_url, is_public")
          .in("id", allProfileIds)
          .neq("is_test", true);

        if (profiles) {
          for (const p of profiles) {
            profilesMap.set(p.id, p);
          }
        }
      }

      const followingProfiles = followingIds
        .map((id) => profilesMap.get(id))
        .filter((p): p is SocialProfile => Boolean(p));

      const followerProfiles = followerIds
        .map((id) => profilesMap.get(id))
        .filter((p): p is SocialProfile => Boolean(p));

      const socialData: SocialData = {
        followers: followerProfiles,
        following: followingProfiles,
        connections: connMap,
        followerStatuses: fStatusMap,
        lastFetched: Date.now(),
      };

      memorySocialCache[userId] = socialData;
      setStoredSocialData(userId, socialData);

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("atlas:social-preloaded", { detail: { userId, socialData } })
        );
      }

      return socialData;
    } catch (err) {
      console.error("Error preloading social connections:", err);
      return null;
    } finally {
      delete inFlightPreload[userId];
    }
  })();

  inFlightPreload[userId] = fetchPromise;
  return fetchPromise;
}
