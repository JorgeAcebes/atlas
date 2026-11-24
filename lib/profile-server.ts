import * as React from "react";
import { getSupabaseServerClient } from "./supabase-server";
import type {
  Ascent,
  ExperienceRecord,
  HiddenItem,
  InitialTrackerData,
  SummitPhoto,
} from "@/components/tracker/types";

export type { InitialTrackerData };

export type ServerProfile = {
  id: string;
  username: string;
  avatar_url: string | null;
  is_public: boolean;
  share_photos?: boolean | null;
  share_notes?: boolean | null;
  enable_peaks?: boolean;
  enable_countries?: boolean;
  enable_experiences?: boolean;
  is_test?: boolean | null;
};

const cacheRequest: <T extends (...args: any[]) => any>(fn: T) => T =
  typeof (React as any).cache === "function"
    ? (React as any).cache
    : (fn) => fn;

export const getServerProfileByUsername = cacheRequest(
  async (
    username: string
  ): Promise<{ profile: ServerProfile | null; error: boolean }> => {
    const supabase = getSupabaseServerClient();
    if (!supabase) return { profile: null, error: false };

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, username, avatar_url, is_public, share_photos, share_notes, enable_peaks, enable_countries, enable_experiences, is_test"
        )
        .eq("username", username)
        .maybeSingle();

      if (error) return { profile: null, error: true };
      return { profile: (data as ServerProfile | null) ?? null, error: false };
    } catch {
      return { profile: null, error: true };
    }
  }
);

export const getServerInitialProfileData = cacheRequest(
  async (
    username: string
  ): Promise<{
    profile: ServerProfile | null;
    trackerData: InitialTrackerData | null;
  }> => {
    const supabase = getSupabaseServerClient();
    if (!supabase) return { profile: null, trackerData: null };

    const { profile, error } = await getServerProfileByUsername(username);
    if (error || !profile || profile.is_test) {
      return { profile: null, trackerData: null };
    }

    const publicShell: ServerProfile = {
      id: profile.id,
      username: profile.username,
      avatar_url: profile.avatar_url,
      is_public: profile.is_public,
      enable_peaks: profile.enable_peaks,
      enable_countries: profile.enable_countries,
      enable_experiences: profile.enable_experiences,
    };

    // Strict privacy: never query or serialize tracker records for private profiles on SSR
    if (profile.is_public === false) {
      return { profile: publicShell, trackerData: null };
    }

    try {
      const [
        ascentRes,
        photoRes,
        expRes,
        customExpRes,
        customCatRes,
        hiddenRes,
      ] = await Promise.all([
        supabase
          .from("ascents")
          .select(
            "id, summit_id, achieved_on, end_date, trip_group_id, notes, is_wishlist, link, link_name, link_2, link_name_2"
          )
          .eq("user_id", profile.id)
          .order("achieved_on", { ascending: false }),
        supabase
          .from("summit_photos")
          .select("id, summit_id, public_url, taken_on, caption, created_at, storage_path, shot_at")
          .eq("user_id", profile.id)
          .order("taken_on", { ascending: false })
          .order("created_at", { ascending: true }),
        supabase.from("experience_records").select("*").eq("user_id", profile.id),
        supabase.from("custom_experiences").select("*").eq("user_id", profile.id),
        supabase.from("custom_experience_categories").select("*").eq("user_id", profile.id),
        supabase.from("hidden_items").select("*").eq("user_id", profile.id),
      ]);

      const trackerData: InitialTrackerData = {
        userId: profile.id,
        ascents: (ascentRes.data as Ascent[]) || [],
        photos: (photoRes.data as SummitPhoto[]) || [],
        experienceRecords: (expRes.data as ExperienceRecord[]) || [],
        customExperiences: customExpRes.data || [],
        customCategories: customCatRes.data || [],
        hiddenItems: (hiddenRes.data as HiddenItem[]) || [],
      };

      return { profile: publicShell, trackerData };
    } catch {
      return { profile: publicShell, trackerData: null };
    }
  }
);
