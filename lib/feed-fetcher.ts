import { predefinedCategories } from "@/data/experiences";
import { isUnknownDate } from "@/lib/date-utils";
import { sortPhotosByTime } from "@/lib/image-utils";
import { compareFeedRecords } from "@/lib/feed-sort";
import { getPhotoDisplayUrl } from "@/lib/photo-client";
import { supabase } from "@/lib/supabase";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const predefinedExpIndex = new Map<string, { title: string; subTitleById: Map<string, string> }>();
for (const cat of predefinedCategories) {
  for (const exp of cat.experiences) {
    const subTitleById = new Map<string, string>();
    if (exp.subItems) {
      for (const s of exp.subItems) {
        subTitleById.set(s.id, s.name);
      }
    }
    predefinedExpIndex.set(exp.id, { title: exp.name, subTitleById });
  }
}

export interface FetchFeedResult {
  items: any[];
  error: string | null;
  preloadUrls: string[];
}

export async function fetchCombinedFeed(limit = 200): Promise<FetchFeedResult> {
  if (!supabase) {
    return { items: [], error: null, preloadUrls: [] };
  }

  // Parallel base queries (eliminates sequential waterfall)
  const [ascRes, expRes] = await Promise.all([
    supabase
      .from("ascents")
      .select(
        "id, user_id, summit_id, trip_group_id, created_at, achieved_on, end_date, notes, link, link_name, link_2, link_name_2, profiles!ascents_user_id_profiles_fkey(username, avatar_url, is_public, is_test)"
      )
      .eq("is_wishlist", false)
      .or("summit_id.not.ilike.country-%,achieved_on.gt.1900-01-01")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("experience_records")
      .select(
        "id, user_id, experience_id, sub_item_id, trip_group_id, created_at, achieved_on, notes, link, link_name, link_2, link_name_2, location_name, profiles!experience_records_user_id_profiles_fkey(username, avatar_url, is_public, is_test)"
      )
      .eq("is_wishlist", false)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const fetchError = ascRes.error?.message || expRes.error?.message || null;
  if (fetchError) {
    return { items: [], error: fetchError, preloadUrls: [] };
  }

  const ascents = (ascRes.data || []).filter((a: any) => {
    if (a.profiles?.is_test) return false;
    const summitIdLower = (a.summit_id || "").toLowerCase();
    if (summitIdLower.startsWith("region-")) return false;
    if (!a.achieved_on || isUnknownDate(a.achieved_on)) return false;
    return true;
  });

  const expRecords = (expRes.data || []).filter((e: any) => {
    if (e.profiles?.is_test) return false;
    if (!e.achieved_on || isUnknownDate(e.achieved_on)) return false;
    return true;
  });

  const combinedBase = [
    ...ascents.map((a: any) => ({ ...a, type: "ascent", record_date: a.achieved_on })),
    ...expRecords.map((e: any) => ({ ...e, type: "experience", record_date: e.achieved_on })),
  ]
    .filter((item) => item.record_date && !isNaN(new Date(item.record_date).getTime()))
    .sort(compareFeedRecords)
    .slice(0, limit);

  const customExpIds = Array.from(
    new Set(
      combinedBase
        .filter(
          (item) =>
            item.type === "experience" && item.experience_id && UUID_REGEX.test(item.experience_id)
        )
        .map((item) => item.experience_id as string)
    )
  );

  const tripGroupIds = Array.from(
    new Set(combinedBase.map((item) => item.trip_group_id).filter(Boolean) as string[])
  );

  const pairSet = new Set<string>();
  for (const item of combinedBase) {
    const baseId = item.summit_id || item.experience_id;
    if (!item.user_id || !baseId) continue;
    if (item.sub_item_id) {
      pairSet.add(`${item.user_id}|${baseId}::${item.sub_item_id}`);
    }
    pairSet.add(`${item.user_id}|${baseId}`);
  }
  const pairs = Array.from(pairSet).map((p) => {
    const [user_id, summit_id] = p.split("|");
    return { user_id, summit_id };
  });

  // Parallel enrichment queries (custom experiences + companions + photos)
  const [customExpRes, companionsRes, uniquePhotos] = await Promise.all([
    customExpIds.length > 0
      ? supabase.from("custom_experiences").select("id, name").in("id", customExpIds)
      : Promise.resolve({ data: null }),
    tripGroupIds.length > 0
      ? supabase
          .from("record_companions")
          .select(
            `
            trip_group_id,
            status,
            inviter_id,
            companion_id,
            item_id,
            start_date,
            end_date,
            companion_profile:profiles!record_companions_companion_id_fkey(id, username, avatar_url, is_public),
            inviter_profile:profiles!record_companions_inviter_id_fkey(id, username, avatar_url, is_public)
          `
          )
          .in("trip_group_id", tripGroupIds)
          .eq("status", "accepted")
          .then(
            (res) => res,
            () => ({ data: null })
          )
      : Promise.resolve({ data: null }),
    fetchFeedPhotos(pairs),
  ]);

  const customExperiences: Record<string, string> = {};
  if (customExpRes?.data) {
    for (const ce of customExpRes.data) {
      customExperiences[ce.id] = ce.name;
    }
  }

  const companionsByTripGroup: Record<string, any[]> = {};
  const canonicalTripGroupMap = new Map<string, string>();
  if (companionsRes?.data) {
    const tripKeyToCanonicalGid = new Map<string, string>();
    for (const row of companionsRes.data as any[]) {
      const participants = [row.inviter_id, row.companion_id].sort().join(":");
      const tripKey = `${row.item_id || ""}:${row.start_date || ""}:${participants}`;
      if (!tripKeyToCanonicalGid.has(tripKey)) {
        tripKeyToCanonicalGid.set(tripKey, row.trip_group_id);
      }
      canonicalTripGroupMap.set(row.trip_group_id, tripKeyToCanonicalGid.get(tripKey)!);
    }

    for (const row of companionsRes.data as any[]) {
      const gid = canonicalTripGroupMap.get(row.trip_group_id) || row.trip_group_id;
      if (!companionsByTripGroup[gid]) companionsByTripGroup[gid] = [];
      const bucket = companionsByTripGroup[gid];
      if (row.companion_profile && !bucket.some((p) => p.id === row.companion_profile.id)) {
        bucket.push(row.companion_profile);
      }
      if (row.inviter_profile && !bucket.some((p) => p.id === row.inviter_profile.id)) {
        bucket.push(row.inviter_profile);
      }
    }
  }

  const photosMap = new Map<string, any[]>();
  const photosMapBySummit = new Map<string, any[]>();
  for (const p of uniquePhotos) {
    const key = `${p.user_id}_${p.summit_id}_${p.taken_on || ""}`;
    const list = photosMap.get(key) || [];
    list.push(p);
    photosMap.set(key, list);

    const summitKey = `${p.user_id}_${p.summit_id}`;
    const sList = photosMapBySummit.get(summitKey) || [];
    sList.push(p);
    photosMapBySummit.set(summitKey, sList);
  }

  const combined = combinedBase.map((item) => {
    let enriched = item;
    if (item.type === "experience") {
      const entry = predefinedExpIndex.get(item.experience_id);
      const title = entry
        ? entry.title
        : customExperiences[item.experience_id] || item.location_name || "Experiencia";
      const subTitle =
        entry && item.sub_item_id ? entry.subTitleById.get(item.sub_item_id) || "" : "";
      enriched = { ...item, experience_title: title, sub_item_title: subTitle };
    }

    if (enriched.trip_group_id && canonicalTripGroupMap.has(enriched.trip_group_id)) {
      enriched.trip_group_id = canonicalTripGroupMap.get(enriched.trip_group_id);
    }
    enriched.companions = enriched.trip_group_id
      ? companionsByTripGroup[enriched.trip_group_id] || []
      : [];

    const baseId = enriched.summit_id || enriched.experience_id;
    const targetId = enriched.sub_item_id ? `${baseId}::${enriched.sub_item_id}` : baseId;
    const recordDate = enriched.achieved_on || "";

    let matched =
      targetId && recordDate ? photosMap.get(`${enriched.user_id}_${targetId}_${recordDate}`) : null;
    if ((!matched || matched.length === 0) && baseId && baseId !== targetId && recordDate) {
      matched = photosMap.get(`${enriched.user_id}_${baseId}_${recordDate}`);
    }
    if ((!matched || matched.length === 0) && targetId) {
      matched = photosMapBySummit.get(`${enriched.user_id}_${targetId}`);
    }
    if ((!matched || matched.length === 0) && baseId) {
      matched = photosMapBySummit.get(`${enriched.user_id}_${baseId}`);
    }

    enriched.photos = sortPhotosByTime(matched || []);
    return enriched;
  });

  // Collect limited initial thumbnails for throttled idle warmup
  const preloadSet = new Set<string>();
  for (const feedItem of combined.slice(0, 12)) {
    if (!Array.isArray(feedItem.photos) || feedItem.photos.length === 0) continue;
    const first = feedItem.photos[0];
    const url = getPhotoDisplayUrl(first?.public_url, first?.storage_path);
    if (url) preloadSet.add(url);
    if (preloadSet.size >= 9) break;
  }

  return {
    items: combined,
    error: null,
    preloadUrls: Array.from(preloadSet),
  };
}

async function fetchFeedPhotos(pairs: Array<{ user_id: string; summit_id: string }>): Promise<any[]> {
  if (!supabase || pairs.length === 0) return [];

  const { data: rpcPhotos, error: rpcErr } = await supabase.rpc("get_feed_photos", { pairs });
  if (!rpcErr && Array.isArray(rpcPhotos)) {
    return rpcPhotos;
  }

  const BATCH_SIZE = 25;
  const batches: Array<{ user_id: string; summit_id: string }[]> = [];
  for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
    batches.push(pairs.slice(i, i + BATCH_SIZE));
  }

  const responses = await Promise.all(
    batches.map((batch) => {
      const orFilter = batch
        .map((p) => `and(user_id.eq.${p.user_id},summit_id.eq.${p.summit_id})`)
        .join(",");
      return supabase!
        .from("summit_photos")
        .select("id, user_id, summit_id, public_url, taken_on, caption, created_at, storage_path, shot_at")
        .or(orFilter)
        .order("created_at", { ascending: true });
    })
  );

  const seenIds = new Set<string>();
  const uniquePhotos: any[] = [];
  for (const res of responses) {
    if (!res.data) continue;
    for (const p of res.data) {
      if (!seenIds.has(p.id)) {
        seenIds.add(p.id);
        uniquePhotos.push(p);
      }
    }
  }
  return uniquePhotos;
}
