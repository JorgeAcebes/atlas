"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { countries } from "@/data/countries";
import { peaks } from "@/data/peaks";
import { predefinedCategories, type ExperienceCategory } from "@/data/experiences";
import type { CompanionProfile } from "@/lib/companions";
import { preloadImages } from "@/lib/image-preloader";
import { sortPhotosByTime } from "@/lib/image-utils";
import { getPhotoDisplayUrl } from "@/lib/photo-client";
import { getPredefinedExperienceTotalCount } from "@/lib/progress-utils";
import { preloadSocialConnections } from "@/lib/social-cache";
import { supabase } from "@/lib/supabase";
import { computeRecordsFingerprint, readJsonCache, scheduleLocalCacheWrite } from "@/lib/tracker-cache";
import {
  countryToItem,
  peakToItem,
  type Ascent,
  type ExperienceRecord,
  type HiddenItem,
  type SelectedItem,
  type SummitPhoto,
  type TargetProfile,
} from "../types";

const cachedAscentsByUser: Record<string, Ascent[]> = {};
const cachedPhotosByUser: Record<string, SummitPhoto[]> = {};
const cachedExperienceRecordsByUser: Record<string, ExperienceRecord[]> = {};
const cachedCustomExperiencesByUser: Record<string, any[]> = {};
const cachedCustomCategoriesByUser: Record<string, any[]> = {};
const cachedHiddenItemsByUser: Record<string, HiddenItem[]> = {};
const cachedTrackerLastFetched: Record<string, number> = {};
const TRACKER_CACHE_TTL = 60 * 1000;

export const cachedTotalCounts: Record<string, number> = {
  peaks: 47,
  countries: countries.length || 196,
  experiences: getPredefinedExperienceTotalCount(),
};

function getStoredUserId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem("app_user_profile");
    if (raw) return JSON.parse(raw)?.id;
  } catch {
    /* ignore */
  }
  return undefined;
}

function getInitialTrackerList<T>(
  key: string,
  userId?: string,
  memoryCache?: Record<string, T[]>
): T[] {
  if (!userId) return [];
  if (memoryCache && memoryCache[userId]) return memoryCache[userId];
  const stored = readJsonCache<T[] | null>(`app_tracker_${key}_${userId}`, null);
  if (stored && Array.isArray(stored)) {
    if (memoryCache) memoryCache[userId] = stored;
    return stored;
  }
  return [];
}

const peaksByIdMap = new Map(peaks.map((p) => [p.id, p]));
const peakIdsByNameMap = new Map<string, string[]>();
for (const p of peaks) {
  const arr = peakIdsByNameMap.get(p.name) || [];
  arr.push(p.id);
  peakIdsByNameMap.set(p.name, arr);
}

interface UseTrackerDataOptions {
  targetProfile?: TargetProfile;
  session: Session | null;
  authProfile: any;
  authLoading: boolean;
  isReadOnly: boolean;
  profileOpen: boolean;
  isPeaks: boolean;
  isExp: boolean;
  selected: SelectedItem | null;
  isSelectedValidForCurrentMode: boolean;
  ascentsSortOrder: "asc" | "desc";
  targetConnStatus: "pending" | "accepted" | null;
  setTargetConnStatus: (s: "pending" | "accepted" | null) => void;
  setMyProfile: (p: any) => void;
  myProfile: any;
}

export function useTrackerData({
  targetProfile,
  session,
  authProfile,
  authLoading,
  isReadOnly,
  profileOpen,
  isPeaks,
  isExp,
  selected,
  isSelectedValidForCurrentMode,
  ascentsSortOrder,
  targetConnStatus,
  setTargetConnStatus,
  setMyProfile,
  myProfile,
}: UseTrackerDataOptions) {
  const targetId = targetProfile ? targetProfile.id : session?.user.id || authProfile?.id;

  const [ascents, setAscents] = useState<Ascent[]>(() =>
    getInitialTrackerList<Ascent>("ascents", targetId, cachedAscentsByUser)
  );
  const [photos, setPhotos] = useState<SummitPhoto[]>(() =>
    getInitialTrackerList<SummitPhoto>("photos", targetId, cachedPhotosByUser)
  );
  const [experienceRecords, setExperienceRecords] = useState<ExperienceRecord[]>(() =>
    getInitialTrackerList<ExperienceRecord>("exp_records", targetId, cachedExperienceRecordsByUser)
  );
  const [customExperiences, setCustomExperiences] = useState<any[]>(() =>
    getInitialTrackerList<any>("custom_exp", targetId, cachedCustomExperiencesByUser)
  );
  const [customCategories, setCustomCategories] = useState<any[]>(() =>
    getInitialTrackerList<any>("custom_cat", targetId, cachedCustomCategoriesByUser)
  );
  const [hiddenItems, setHiddenItems] = useState<HiddenItem[]>(() =>
    getInitialTrackerList<HiddenItem>("hidden_items", targetId, cachedHiddenItemsByUser)
  );
  const [myAscents, setMyAscents] = useState<Ascent[]>([]);
  const [tripCompanionsMap, setTripCompanionsMap] = useState<Record<string, CompanionProfile[]>>({});
  const [userFollowingSet, setUserFollowingSet] = useState<Set<string>>(new Set());

  const prevTargetIdRef = useRef(targetId);
  useEffect(() => {
    if (prevTargetIdRef.current !== targetId) {
      prevTargetIdRef.current = targetId;
      setAscents(getInitialTrackerList<Ascent>("ascents", targetId, cachedAscentsByUser));
      setPhotos(getInitialTrackerList<SummitPhoto>("photos", targetId, cachedPhotosByUser));
      setExperienceRecords(
        getInitialTrackerList<ExperienceRecord>("exp_records", targetId, cachedExperienceRecordsByUser)
      );
      setCustomExperiences(
        getInitialTrackerList<any>("custom_exp", targetId, cachedCustomExperiencesByUser)
      );
      setCustomCategories(
        getInitialTrackerList<any>("custom_cat", targetId, cachedCustomCategoriesByUser)
      );
      setHiddenItems(
        getInitialTrackerList<HiddenItem>("hidden_items", targetId, cachedHiddenItemsByUser)
      );
    }
  }, [targetId]);

  useEffect(() => {
    if (targetId && prevTargetIdRef.current === targetId) {
      cachedAscentsByUser[targetId] = ascents;
      scheduleLocalCacheWrite(`app_tracker_ascents_${targetId}`, ascents);
    }
  }, [ascents, targetId]);

  useEffect(() => {
    if (targetId && prevTargetIdRef.current === targetId) {
      cachedExperienceRecordsByUser[targetId] = experienceRecords;
      scheduleLocalCacheWrite(`app_tracker_exp_records_${targetId}`, experienceRecords);
    }
  }, [experienceRecords, targetId]);

  useEffect(() => {
    if (targetId && prevTargetIdRef.current === targetId) {
      cachedPhotosByUser[targetId] = photos;
      scheduleLocalCacheWrite(`app_tracker_photos_${targetId}`, photos);
    }
  }, [photos, targetId]);

  useEffect(() => {
    if (targetId && prevTargetIdRef.current === targetId) {
      cachedCustomExperiencesByUser[targetId] = customExperiences;
      scheduleLocalCacheWrite(`app_tracker_custom_exp_${targetId}`, customExperiences);
    }
  }, [customExperiences, targetId]);

  useEffect(() => {
    if (targetId && prevTargetIdRef.current === targetId) {
      cachedCustomCategoriesByUser[targetId] = customCategories;
      scheduleLocalCacheWrite(`app_tracker_custom_cat_${targetId}`, customCategories);
    }
  }, [customCategories, targetId]);

  useEffect(() => {
    if (targetId && prevTargetIdRef.current === targetId) {
      cachedHiddenItemsByUser[targetId] = hiddenItems;
      scheduleLocalCacheWrite(`app_tracker_hidden_items_${targetId}`, hiddenItems);
    }
  }, [hiddenItems, targetId]);

  // Fetch accepted following set for companion visibility
  useEffect(() => {
    if (!supabase || !session?.user?.id) return;
    let cancelled = false;
    supabase
      .from("connections")
      .select("following_id")
      .eq("follower_id", session.user.id)
      .eq("status", "accepted")
      .then(({ data }) => {
        if (!cancelled && data) {
          setUserFollowingSet(new Set(data.map((c: any) => c.following_id)));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  // Preload social connections cleanly
  useEffect(() => {
    if (typeof window === "undefined" || !session?.user?.id) return;
    preloadSocialConnections(session.user.id);
  }, [session?.user?.id]);

  // Load companions for open record panel
  useEffect(() => {
    if (!supabase || !selected) return;
    const currentAscents = ascents.filter((a) => a.summit_id === selected.id);
    const currentExp = experienceRecords.filter((e) => e.experience_id === selected.id);
    const tripGroupIds = Array.from(
      new Set(
        [
          ...currentAscents.map((a) => a.trip_group_id),
          ...currentExp.map((e) => e.trip_group_id),
        ].filter(Boolean) as string[]
      )
    );
    if (tripGroupIds.length === 0) return;

    let cancelled = false;
    supabase
      .from("record_companions")
      .select(
        `
        trip_group_id,
        companion_id,
        status,
        companion_profile:profiles!record_companions_companion_id_fkey(id, username, avatar_url, is_public),
        inviter_profile:profiles!record_companions_inviter_id_fkey(id, username, avatar_url, is_public)
      `
      )
      .in("trip_group_id", tripGroupIds)
      .eq("status", "accepted")
      .then(({ data }) => {
        if (cancelled || !data) return;
        const map: Record<string, CompanionProfile[]> = {};
        for (const row of data as any[]) {
          const gid = row.trip_group_id;
          if (!map[gid]) map[gid] = [];
          if (row.companion_profile && !map[gid].some((p) => p.id === row.companion_profile.id)) {
            map[gid].push(row.companion_profile);
          }
          if (row.inviter_profile && !map[gid].some((p) => p.id === row.inviter_profile.id)) {
            map[gid].push(row.inviter_profile);
          }
        }
        setTripCompanionsMap((prev) => ({ ...prev, ...map }));
      });

    return () => {
      cancelled = true;
    };
  }, [selected, ascents, experienceRecords]);

  // Parallel data load
  useEffect(() => {
    let cancelled = false;

    async function loadProgress() {
      const effectiveTargetId = targetProfile
        ? targetProfile.id
        : session?.user.id || authProfile?.id || getStoredUserId();
      if (!supabase || !effectiveTargetId) {
        if (!targetProfile && !authLoading && !session && !getStoredUserId()) {
          setAscents([]);
          setPhotos([]);
          setExperienceRecords([]);
        }
        return;
      }

      const isPrivateTarget = Boolean(
        isReadOnly &&
          targetProfile &&
          targetProfile.is_public === false &&
          session?.user?.id !== targetProfile.id
      );

      let effectiveConnStatus = targetConnStatus;
      if (isPrivateTarget && targetProfile && session?.user?.id && effectiveConnStatus === null) {
        const { data: conn } = await supabase
          .from("connections")
          .select("status")
          .eq("follower_id", session.user.id)
          .eq("following_id", targetProfile.id)
          .maybeSingle();
        if (cancelled) return;
        if (conn) {
          effectiveConnStatus = conn.status as "pending" | "accepted";
          setTargetConnStatus(effectiveConnStatus);
        }
      }

      const isPrivateRestricted = isPrivateTarget && effectiveConnStatus !== "accepted";

      if (isPrivateRestricted) {
        const [completedSummitsRes, myAscentsRes] = await Promise.all([
          supabase.rpc("get_user_completed_summits", { p_user_id: effectiveTargetId }),
          isReadOnly && session
            ? supabase
                .from("ascents")
                .select(
                  "id, summit_id, achieved_on, end_date, trip_group_id, notes, is_wishlist, link, link_name, link_2, link_name_2"
                )
                .eq("user_id", session.user.id)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;

        const syntheticAscents: Ascent[] = (completedSummitsRes.data || []).map(
          (row: { summit_id: string }) => ({
            summit_id: row.summit_id,
            achieved_on: "1900-01-01",
            end_date: null,
            notes: null,
            is_wishlist: false,
            link: null,
            link_name: null,
            link_2: null,
            link_name_2: null,
          })
        );

        setAscents(syntheticAscents);
        cachedAscentsByUser[effectiveTargetId] = syntheticAscents;
        scheduleLocalCacheWrite(`app_tracker_ascents_${effectiveTargetId}`, syntheticAscents);
        setPhotos([]);
        cachedPhotosByUser[effectiveTargetId] = [];
        scheduleLocalCacheWrite(`app_tracker_photos_${effectiveTargetId}`, []);
        setExperienceRecords([]);
        setCustomExperiences([]);
        setCustomCategories([]);
        setHiddenItems([]);
        cachedTrackerLastFetched[effectiveTargetId] = Date.now();

        if (myAscentsRes?.data) {
          setMyAscents(myAscentsRes.data as Ascent[]);
        }
        return;
      }

      const now = Date.now();
      const hadSyntheticCache = cachedAscentsByUser[effectiveTargetId]?.some(
        (a) => a.achieved_on === "1900-01-01"
      );
      const isFresh =
        !hadSyntheticCache &&
        Boolean(cachedAscentsByUser[effectiveTargetId]) &&
        now - (cachedTrackerLastFetched[effectiveTargetId] || 0) < TRACKER_CACHE_TTL;

      if (isFresh) {
        if (!isReadOnly && !profileOpen && session && !myProfile) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("username, avatar_url, enable_experiences, enable_peaks, enable_countries")
            .eq("id", session.user.id)
            .single();
          if (!cancelled && profile) setMyProfile(profile);
        }
        return;
      }

      const [
        ascentResult,
        photoResult,
        expResult,
        customExpResult,
        customCatResult,
        hiddenItemsResult,
        profileResult,
        myAscentsResult,
      ] = await Promise.all([
        supabase
          .from("ascents")
          .select(
            "id, summit_id, achieved_on, end_date, trip_group_id, notes, is_wishlist, link, link_name, link_2, link_name_2"
          )
          .eq("user_id", effectiveTargetId)
          .order("achieved_on", { ascending: false }),
        supabase
          .from("summit_photos")
          .select("id, summit_id, public_url, taken_on, caption, created_at, storage_path, shot_at")
          .eq("user_id", effectiveTargetId)
          .order("taken_on", { ascending: false })
          .order("created_at", { ascending: true }),
        supabase.from("experience_records").select("*").eq("user_id", effectiveTargetId),
        supabase.from("custom_experiences").select("*").eq("user_id", effectiveTargetId),
        supabase.from("custom_experience_categories").select("*").eq("user_id", effectiveTargetId),
        supabase.from("hidden_items").select("*").eq("user_id", effectiveTargetId),
        !isReadOnly && !profileOpen && session && !myProfile
          ? supabase
              .from("profiles")
              .select("username, avatar_url, enable_experiences, enable_peaks, enable_countries")
              .eq("id", session.user.id)
              .single()
          : Promise.resolve(null),
        isReadOnly && session
          ? supabase
              .from("ascents")
              .select(
                "summit_id, achieved_on, end_date, notes, is_wishlist, link, link_name, link_2, link_name_2"
              )
              .eq("user_id", session.user.id)
          : Promise.resolve(null),
      ]);

      if (cancelled) return;

      if (ascentResult.data) {
        const nextData = ascentResult.data as Ascent[];
        if (
          computeRecordsFingerprint(cachedAscentsByUser[effectiveTargetId] || []) !==
          computeRecordsFingerprint(nextData)
        ) {
          setAscents(nextData);
        } else {
          setAscents(nextData);
        }
        cachedAscentsByUser[effectiveTargetId] = nextData;
        scheduleLocalCacheWrite(`app_tracker_ascents_${effectiveTargetId}`, nextData);
      }

      if (photoResult.data) {
        const nextData = sortPhotosByTime(
          (photoResult.data as SummitPhoto[]).map((p) => ({
            ...p,
            public_url: getPhotoDisplayUrl(p.public_url, p.storage_path),
          }))
        );
        cachedPhotosByUser[effectiveTargetId] = nextData;
        setPhotos(nextData);
        scheduleLocalCacheWrite(`app_tracker_photos_${effectiveTargetId}`, nextData);
      }

      if (expResult.data) {
        const nextData = expResult.data as ExperienceRecord[];
        cachedExperienceRecordsByUser[effectiveTargetId] = nextData;
        setExperienceRecords(nextData);
        scheduleLocalCacheWrite(`app_tracker_exp_records_${effectiveTargetId}`, nextData);
      }

      if (customExpResult.data) {
        cachedCustomExperiencesByUser[effectiveTargetId] = customExpResult.data;
        setCustomExperiences(customExpResult.data);
        scheduleLocalCacheWrite(`app_tracker_custom_exp_${effectiveTargetId}`, customExpResult.data);
      }

      if (customCatResult.data) {
        cachedCustomCategoriesByUser[effectiveTargetId] = customCatResult.data;
        setCustomCategories(customCatResult.data);
        scheduleLocalCacheWrite(`app_tracker_custom_cat_${effectiveTargetId}`, customCatResult.data);
      }

      if (hiddenItemsResult.data) {
        const nextData = hiddenItemsResult.data as HiddenItem[];
        cachedHiddenItemsByUser[effectiveTargetId] = nextData;
        setHiddenItems(nextData);
        scheduleLocalCacheWrite(`app_tracker_hidden_items_${effectiveTargetId}`, nextData);
      }

      cachedTrackerLastFetched[effectiveTargetId] = Date.now();

      if (profileResult?.data) {
        setMyProfile(profileResult.data);
      }
      if (myAscentsResult?.data) {
        setMyAscents(myAscentsResult.data as Ascent[]);
      }
    }

    loadProgress();
    return () => {
      cancelled = true;
    };
  }, [
    session?.user?.id,
    profileOpen,
    isReadOnly,
    targetProfile?.id,
    authLoading,
    authProfile?.id,
    targetConnStatus,
  ]);

  // Throttled preload for active item photos and initial gallery preview
  useEffect(() => {
    if (!selected || typeof window === "undefined") return;
    const targetSummitId = selected.sub_item_id
      ? `${selected.id}::${selected.sub_item_id}`
      : selected.id;
    const urls = photos
      .filter((p) => p.summit_id === targetSummitId || p.summit_id === selected.id)
      .map((p) => getPhotoDisplayUrl(p.public_url, p.storage_path));
    preloadImages(urls, { maxConcurrent: 3, maxCount: 6 });
  }, [selected, photos]);

  useEffect(() => {
    if (typeof window === "undefined" || photos.length === 0) return;
    const timer = setTimeout(() => {
      preloadImages(
        photos.slice(0, 12).map((p) => getPhotoDisplayUrl(p.public_url, p.storage_path)),
        { maxConcurrent: 3, maxCount: 9 }
      );
    }, 1500);
    return () => clearTimeout(timer);
  }, [photos]);

  const dynamicCategories = useMemo(() => {
    const hiddenCategoryIds = new Set(
      hiddenItems.filter((h) => h.item_type === "category").map((h) => h.item_id)
    );
    const hiddenExperienceIds = new Set(
      hiddenItems.filter((h) => h.item_type === "experience").map((h) => h.item_id)
    );

    const visiblePredefined = predefinedCategories
      .filter((cat) => !hiddenCategoryIds.has(cat.id))
      .map((cat) => {
        const linkedCustomExps = customExperiences
          .filter((ce) => ce.static_category_id === cat.id)
          .map((ce) => ({ id: ce.id, name: ce.name, subItems: ce.sub_items }));

        return {
          ...cat,
          name: cat.name,
          iconName: cat.iconName,
          experiences: [
            ...cat.experiences.filter((exp) => !hiddenExperienceIds.has(exp.id)),
            ...linkedCustomExps.filter((exp) => !hiddenExperienceIds.has(exp.id)),
          ],
        };
      });

    const customCats: ExperienceCategory[] = customCategories
      .filter((cat) => !cat.static_id && !hiddenCategoryIds.has(cat.id))
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        iconName: cat.icon_name,
        experiences: customExperiences
          .filter((ce) => ce.category_id === cat.id && !hiddenExperienceIds.has(ce.id))
          .map((ce) => ({
            id: ce.id,
            name: ce.name,
            subItems: ce.sub_items,
          })),
      }));

    const orphanedExperiences = customExperiences.filter(
      (ce) => !ce.category_id && !ce.static_category_id && !hiddenExperienceIds.has(ce.id)
    );
    if (orphanedExperiences.length > 0) {
      const orphansCat = orphanedExperiences.reduce((acc: ExperienceCategory[], ce) => {
        const icon = ce.icon_name || "star";
        let c = acc.find((x) => x.iconName === icon);
        if (!c) {
          c = {
            id: `cat-custom-${icon}`,
            name: `Personalizadas (${icon})`,
            iconName: icon,
            experiences: [],
          };
          acc.push(c);
        }
        c.experiences.push({
          id: ce.id,
          name: ce.name,
          subItems: ce.sub_items,
        } as any);
        return acc;
      }, []);
      customCats.push(...orphansCat);
    }

    return [...visiblePredefined, ...customCats];
  }, [customExperiences, customCategories, hiddenItems]);

  const allItems: SelectedItem[] = useMemo(
    () =>
      isPeaks
        ? peaks.map(peakToItem)
        : isExp
          ? dynamicCategories.flatMap((cat) =>
              cat.experiences.map((exp) => ({
                id: exp.id,
                title: exp.name,
                subtitle: "",
                label: "",
                detail: cat.name,
                note: "",
                iconName: cat.iconName,
                subItems: exp.subItems,
                itemType: "experience" as const,
              }))
            )
          : countries.map(countryToItem),
    [isPeaks, isExp, dynamicCategories]
  );

  const totalCount = isPeaks ? 47 : allItems.length || cachedTotalCounts.experiences;

  const validIds = useMemo(() => {
    const ids = new Set(allItems.map((i) => i.id));
    if (!isPeaks && isExp) {
      countries.forEach((c) => ids.add(c.id));
    }
    return ids;
  }, [allItems, isPeaks, isExp]);

  const modeAscents = useMemo(() => {
    const regularAscents = ascents.filter((a) => validIds.has(a.summit_id));
    if (isExp) {
      const expAscents = experienceRecords.map((r) => ({
        summit_id: r.experience_id,
        achieved_on: r.achieved_on,
        end_date: null,
        notes: r.notes || null,
        is_wishlist: r.is_wishlist,
        record_id: r.id,
        lat: r.lat,
        lng: r.lng,
        location_name: r.location_name,
        sub_item_id: r.sub_item_id,
      }));
      return [...regularAscents, ...expAscents].filter((a) => validIds.has(a.summit_id));
    }
    return regularAscents;
  }, [ascents, validIds, isExp, experienceRecords]);

  const completedModeAscents = useMemo(
    () => modeAscents.filter((a) => !a.is_wishlist),
    [modeAscents]
  );

  const achievedCount = useMemo(() => {
    if (isExp) {
      const doneDirectIds = new Set<string>();
      const doneSubsByExp = new Map<string, Set<string>>();
      for (const a of completedModeAscents) {
        doneDirectIds.add(a.summit_id);
        if (a.sub_item_id) {
          let set = doneSubsByExp.get(a.summit_id);
          if (!set) {
            set = new Set();
            doneSubsByExp.set(a.summit_id, set);
          }
          set.add(a.sub_item_id);
        }
      }
      let count = 0;
      for (const item of allItems) {
        if (!item.subItems || item.subItems.length === 0) {
          if (doneDirectIds.has(item.id)) count++;
        } else {
          const doneSubs = doneSubsByExp.get(item.id);
          if (
            doneSubs &&
            item.subItems.length > 0 &&
            item.subItems.every((s: any) => doneSubs.has(s.id))
          ) {
            count++;
          }
        }
      }
      return count;
    }

    if (!isPeaks) {
      const uniqueCountries = new Set<string>();
      for (const a of completedModeAscents) {
        if (a.summit_id.startsWith("country-")) uniqueCountries.add(a.summit_id);
      }
      return uniqueCountries.size;
    }

    const uniquePeakNames = new Set<string>();
    for (const a of completedModeAscents) {
      const p = peaksByIdMap.get(a.summit_id);
      if (p) uniquePeakNames.add(p.name);
    }
    return uniquePeakNames.size;
  }, [isPeaks, isExp, completedModeAscents, allItems]);

  const wishlistCount = useMemo(() => {
    const w = modeAscents.filter((a) => a.is_wishlist);
    if (isExp) {
      return new Set(
        w
          .filter((a) => !a.summit_id.startsWith("country-"))
          .map((a) => a.summit_id + (a.sub_item_id ? `::${a.sub_item_id}` : ""))
      ).size;
    }
    if (!isPeaks) {
      return new Set(
        w.filter((a) => a.summit_id.startsWith("country-")).map((a) => a.summit_id)
      ).size;
    }
    return new Set(
      w.map((a) => peaksByIdMap.get(a.summit_id)?.name).filter(Boolean) as string[]
    ).size;
  }, [isPeaks, isExp, modeAscents]);

  const completedPeakCodes = useMemo(
    () =>
      new Set(
        ascents
          .filter((a) => !a.is_wishlist)
          .map((a) => peaksByIdMap.get(a.summit_id)?.code)
          .filter((c): c is string => Boolean(c))
      ),
    [ascents]
  );

  const wishlistPeakCodes = useMemo(
    () =>
      new Set(
        ascents
          .filter((a) => a.is_wishlist)
          .map((a) => peaksByIdMap.get(a.summit_id)?.code)
          .filter((c): c is string => Boolean(c))
      ),
    [ascents]
  );

  const completedCountryIds = useMemo(
    () =>
      new Set(
        ascents
          .filter((a) => !a.is_wishlist && a.summit_id.startsWith("country-"))
          .map((a) => a.summit_id)
      ),
    [ascents]
  );

  const wishlistCountryIds = useMemo(
    () =>
      new Set(
        ascents
          .filter((a) => a.is_wishlist && a.summit_id.startsWith("country-"))
          .map((a) => a.summit_id)
      ),
    [ascents]
  );

  const myCompletedPeakCodes = useMemo(
    () =>
      new Set(
        myAscents
          .filter((a) => !a.is_wishlist)
          .map((a) => peaksByIdMap.get(a.summit_id)?.code)
          .filter((c): c is string => Boolean(c))
      ),
    [myAscents]
  );

  const myCompletedCountryIds = useMemo(
    () =>
      new Set(
        myAscents
          .filter((a) => !a.is_wishlist && a.summit_id.startsWith("country-"))
          .map((a) => a.summit_id)
      ),
    [myAscents]
  );

  const myCompletedIds = useMemo(
    () => new Set(myAscents.filter((a) => !a.is_wishlist).map((a) => a.summit_id)),
    [myAscents]
  );

  const diffPeakOnlyViewer = useMemo(
    () => new Set([...myCompletedPeakCodes].filter((c) => !completedPeakCodes.has(c))),
    [myCompletedPeakCodes, completedPeakCodes]
  );
  const diffPeakOnlyTarget = useMemo(
    () => new Set([...completedPeakCodes].filter((c) => !myCompletedPeakCodes.has(c))),
    [completedPeakCodes, myCompletedPeakCodes]
  );
  const diffPeakBoth = useMemo(
    () => new Set([...completedPeakCodes].filter((c) => myCompletedPeakCodes.has(c))),
    [completedPeakCodes, myCompletedPeakCodes]
  );

  const diffItemOnlyViewer = useMemo(() => {
    const targetCompleted = new Set(completedModeAscents.map((a) => a.summit_id));
    return new Set([...myCompletedIds].filter((id) => validIds.has(id) && !targetCompleted.has(id)));
  }, [myCompletedIds, completedModeAscents, validIds]);
  const diffItemOnlyTarget = useMemo(
    () =>
      new Set(completedModeAscents.map((a) => a.summit_id).filter((id) => !myCompletedIds.has(id))),
    [completedModeAscents, myCompletedIds]
  );
  const diffItemBoth = useMemo(
    () =>
      new Set(completedModeAscents.map((a) => a.summit_id).filter((id) => myCompletedIds.has(id))),
    [completedModeAscents, myCompletedIds]
  );

  const selectedAscents = useMemo(() => {
    if (!selected || !isSelectedValidForCurrentMode) return [];
    const combined: Ascent[] = [
      ...ascents,
      ...experienceRecords.map((r) => ({
        summit_id: r.experience_id,
        achieved_on: r.achieved_on,
        end_date: null,
        notes: r.notes || null,
        is_wishlist: r.is_wishlist,
        record_id: r.id,
        lat: r.lat,
        lng: r.lng,
        location_name: r.location_name,
        sub_item_id: r.sub_item_id,
        link: r.link || null,
        link_name: r.link_name || null,
        link_2: r.link_2 || null,
        link_name_2: r.link_name_2 || null,
        trip_group_id: r.trip_group_id || null,
      })),
    ];

    return combined
      .filter((a) => a.summit_id === selected.id && !a.is_wishlist)
      .sort((a, b) => {
        const order = ascentsSortOrder === "asc" ? 1 : -1;
        if (a.achieved_on !== b.achieved_on) {
          return a.achieved_on.localeCompare(b.achieved_on) * order;
        }
        const aEnd = a.end_date || a.achieved_on;
        const bEnd = b.end_date || b.achieved_on;
        return aEnd.localeCompare(bEnd) * order;
      });
  }, [selected, isSelectedValidForCurrentMode, ascents, experienceRecords, ascentsSortOrder]);

  const selectedExperienceRecords = useMemo(() => {
    if (!selected || !isSelectedValidForCurrentMode) return [];
    return experienceRecords
      .filter((r) => r.experience_id === selected.id && !r.sub_item_id)
      .sort((a, b) => {
        const order = ascentsSortOrder === "asc" ? 1 : -1;
        return a.achieved_on !== b.achieved_on
          ? a.achieved_on.localeCompare(b.achieved_on) * order
          : 0;
      });
  }, [selected, isSelectedValidForCurrentMode, experienceRecords, ascentsSortOrder]);

  const hasWishlist = useMemo(() => {
    if (!selected || !isSelectedValidForCurrentMode) return false;
    return (
      ascents.some((a) => a.summit_id === selected.id && a.is_wishlist) ||
      experienceRecords.some((r) => r.experience_id === selected.id && r.is_wishlist)
    );
  }, [selected, isSelectedValidForCurrentMode, ascents, experienceRecords]);

  const wishlistEntry = useMemo(() => {
    if (!selected || !isSelectedValidForCurrentMode) return null;
    return ascents.find((a) => a.summit_id === selected.id && a.is_wishlist) ?? null;
  }, [selected, isSelectedValidForCurrentMode, ascents]);

  const selectedPhotos = useMemo(() => {
    if (!selected || !isSelectedValidForCurrentMode) return [];
    return photos.filter(
      (p) => p.summit_id === selected.id || p.summit_id.startsWith(selected.id + "::")
    );
  }, [selected, isSelectedValidForCurrentMode, photos]);

  const completion = Math.round((achievedCount / (totalCount || 1)) * 100);

  return {
    targetId,
    ascents,
    setAscents,
    photos,
    setPhotos,
    experienceRecords,
    setExperienceRecords,
    customExperiences,
    setCustomExperiences,
    customCategories,
    setCustomCategories,
    hiddenItems,
    setHiddenItems,
    tripCompanionsMap,
    userFollowingSet,
    dynamicCategories,
    allItems,
    totalCount,
    modeAscents,
    completedModeAscents,
    achievedCount,
    wishlistCount,
    completion,
    completedPeakCodes,
    wishlistPeakCodes,
    completedCountryIds,
    wishlistCountryIds,
    myCompletedCountryIds,
    diffPeakOnlyViewer,
    diffPeakOnlyTarget,
    diffPeakBoth,
    diffItemOnlyViewer,
    diffItemOnlyTarget,
    diffItemBoth,
    selectedAscents,
    selectedExperienceRecords,
    hasWishlist,
    wishlistEntry,
    selectedPhotos,
  };
}
