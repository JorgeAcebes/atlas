"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { preloadImages } from "@/lib/image-preloader";
import { getPhotoDisplayUrl } from "@/lib/photo-client";
import { supabase } from "@/lib/supabase";

export type RankingEntry = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  ascents_count: number;
};

export type RankedEntry = RankingEntry & {
  rank: number;
};

export type ScopeFilter = "all" | "following";
export type ModeFilter = "countries" | "peaks";

const globalRankingCache: Record<string, RankingEntry[]> = {};
const globalRankingLastFetched: Record<string, number> = {};
const cachedRankingCount: Record<ModeFilter, number | null> = {
  countries: null,
  peaks: null,
};
const RANKING_CACHE_TTL = 60 * 1000;

/**
 * Warms global ranking cache and top-20 explorer avatars during idle time before opening Ranking.
 */
export async function prefetchRankingInBackground(
  mode: ModeFilter,
  userId?: string | null
): Promise<void> {
  if (typeof window === "undefined" || !supabase) return;
  const cacheKey = `${mode}-all-${userId || "anon"}`;
  const sharedAllKey = `${mode}-all-anon`;
  const now = Date.now();
  const cached = globalRankingCache[cacheKey] || globalRankingCache[sharedAllKey];
  const cachedAt =
    globalRankingLastFetched[cacheKey] || globalRankingLastFetched[sharedAllKey] || 0;
  if (cached && now - cachedAt < RANKING_CACHE_TTL) {
    return;
  }

  try {
    const { data, error } = await supabase.rpc("get_user_ranking", {
      p_summit_ids: null,
      p_following_only: false,
      p_follower: null,
      p_mode: mode,
    });
    if (error || !data) return;
    const result = ((data as RankingEntry[]) || []).filter((e) => e.ascents_count > 0);
    globalRankingCache[cacheKey] = result;
    globalRankingCache[sharedAllKey] = result;
    globalRankingLastFetched[cacheKey] = Date.now();
    globalRankingLastFetched[sharedAllKey] = globalRankingLastFetched[cacheKey];
    cachedRankingCount[mode] = result.length;

    const avatarUrls = result
      .slice(0, 20)
      .map((e) => (e.avatar_url ? getPhotoDisplayUrl(e.avatar_url) : ""))
      .filter(Boolean);
    if (avatarUrls.length > 0) {
      preloadImages(avatarUrls, { maxConcurrent: 3, maxCount: 20 });
    }
  } catch {
    /* ignore idle prefetch failures */
  }
}

export function useRankingData({
  mode,
  scope,
  session,
  enablePeaks,
  enableCountries,
  isActive,
}: {
  mode: ModeFilter;
  scope: ScopeFilter;
  session: Session | null;
  enablePeaks: boolean;
  enableCountries: boolean;
  isActive: boolean;
}) {
  const [entries, setEntries] = useState<RankingEntry[]>(() => []);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function fetchRanking(isBackground = false) {
      if (!supabase) return;
      const cacheKey = `${mode}-${scope}-${session?.user?.id || "anon"}`;
      const sharedAllKey = scope === "all" ? `${mode}-all-anon` : cacheKey;
      const effectiveCached = globalRankingCache[cacheKey] || globalRankingCache[sharedAllKey];
      const effectiveLastFetched =
        globalRankingLastFetched[cacheKey] || globalRankingLastFetched[sharedAllKey] || 0;
      const now = Date.now();
      const isFresh =
        Boolean(effectiveCached) && now - effectiveLastFetched < RANKING_CACHE_TTL;

      if (effectiveCached) {
        globalRankingCache[cacheKey] = effectiveCached;
        setEntries(effectiveCached);
        setLoading(false);
      } else if (!isBackground) {
        setLoading(true);
      }

      const prefetchOtherMode = () => {
        const otherMode: ModeFilter = mode === "countries" ? "peaks" : "countries";
        const canPrefetchOther = otherMode === "peaks" ? enablePeaks : enableCountries;
        const otherKey = `${otherMode}-${scope}-${session?.user?.id || "anon"}`;
        const otherSharedKey = scope === "all" ? `${otherMode}-all-anon` : otherKey;
        if (!canPrefetchOther || globalRankingCache[otherKey] || globalRankingCache[otherSharedKey] || !supabase) return;

        Promise.resolve(
          supabase.rpc("get_user_ranking", {
            p_summit_ids: null,
            p_following_only: scope === "following",
            p_follower: session?.user?.id || null,
            p_mode: otherMode,
          })
        )
          .then(({ data }) => {
            if (data && !ignore) {
              // Strictly count participants with > 0 registered records (excludes is_test inside SQL RPC)
              const res = ((data as RankingEntry[]) || []).filter((e) => e.ascents_count > 0);
              globalRankingCache[otherKey] = res;
              globalRankingLastFetched[otherKey] = Date.now();
              if (scope === "all") {
                globalRankingCache[otherSharedKey] = res;
                globalRankingLastFetched[otherSharedKey] = globalRankingLastFetched[otherKey];
                cachedRankingCount[otherMode] = res.length;
              }
            }
          })
          .catch(() => {});
      };

      if (isFresh) {
        prefetchOtherMode();
        return;
      }

      try {
        const { data, error } = await supabase.rpc("get_user_ranking", {
          p_summit_ids: null,
          p_following_only: scope === "following",
          p_follower: session?.user?.id || null,
          p_mode: mode,
        });

        if (ignore) return;

        if (error) {
          console.error("Error fetching ranking:", error);
          if (!globalRankingCache[cacheKey]) setEntries([]);
        } else {
          const result = ((data as RankingEntry[]) || []).filter((e) => e.ascents_count > 0);
          globalRankingCache[cacheKey] = result;
          globalRankingLastFetched[cacheKey] = Date.now();
          setEntries(result);
          if (scope === "all") {
            globalRankingCache[sharedAllKey] = result;
            globalRankingLastFetched[sharedAllKey] = globalRankingLastFetched[cacheKey];
            cachedRankingCount[mode] = result.length;
          }
          const avatarUrls = result
            .slice(0, 20)
            .map((e) => (e.avatar_url ? getPhotoDisplayUrl(e.avatar_url) : ""))
            .filter(Boolean);
          if (avatarUrls.length > 0) {
            preloadImages(avatarUrls, { maxConcurrent: 3, maxCount: 20 });
          }
        }

        prefetchOtherMode();
      } catch (err) {
        if (!ignore) console.error(err);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    if (supabase) {
      if (isActive) {
        fetchRanking(false);
      } else {
        timer = setTimeout(() => {
          if (!ignore) fetchRanking(true);
        }, 1300);
      }
    }

    return () => {
      ignore = true;
      if (timer) clearTimeout(timer);
    };
  }, [mode, scope, session?.user?.id, enablePeaks, enableCountries, isActive]);

  const rankedEntries: RankedEntry[] = useMemo(() => {
    let currentRank = 1;
    return entries.map((entry, index) => {
      if (index > 0 && entry.ascents_count < entries[index - 1].ascents_count) {
        currentRank = index + 1;
      }
      return { ...entry, rank: currentRank };
    });
  }, [entries]);

  const myEntry = useMemo(
    () => (session ? entries.find((e) => e.user_id === session.user.id) || null : null),
    [session, entries]
  );

  const myRank = useMemo(
    () =>
      session && myEntry
        ? rankedEntries.find((e) => e.user_id === session.user.id)?.rank || null
        : null,
    [session, myEntry, rankedEntries]
  );

  return {
    entries,
    rankedEntries,
    loading,
    myEntry,
    myRank,
    cachedCount: cachedRankingCount[mode],
  };
}
