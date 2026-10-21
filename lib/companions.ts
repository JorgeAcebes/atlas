import { supabase } from "@/lib/supabase";

export interface CompanionProfile {
  id: string;
  username: string;
  avatar_url?: string | null;
  is_public?: boolean;
}

export interface RecordCompanion {
  id: string;
  trip_group_id: string;
  inviter_id: string;
  companion_id: string;
  record_type: "ascent" | "experience";
  inviter_record_id?: string | null;
  companion_record_id?: string | null;
  item_type: "peaks" | "countries" | "experience";
  item_id: string;
  sub_item_id?: string | null;
  location_name?: string | null;
  start_date: string;
  end_date?: string | null;
  original_start_date: string;
  original_end_date?: string | null;
  lat?: number | null;
  lng?: number | null;
  status: "pending" | "accepted" | "rejected" | "separated";
  created_at?: string;
  updated_at?: string;
  inviter_profile?: CompanionProfile;
  companion_profile?: CompanionProfile;
}

/**
 * Checks whether two date ranges overlap.
 * If end date is missing or empty, range is treated as [start, start].
 */
export function datesOverlap(
  startA: string | undefined | null,
  endA: string | undefined | null,
  startB: string | undefined | null,
  endB: string | undefined | null
): boolean {
  if (!startA || !startB) return false;
  const sA = startA.trim();
  const eA = endA && endA.trim() !== "" ? endA.trim() : sA;
  const sB = startB.trim();
  const eB = endB && endB.trim() !== "" ? endB.trim() : sB;
  return sA <= eB && sB <= eA;
}

/**
 * Fetches mutual followers for the currently authenticated user.
 * Users must follow each other with status = 'accepted'.
 */
export async function getMutualFollowers(userId: string): Promise<CompanionProfile[]> {
  if (!supabase || !userId) return [];

  try {
    // 1. Try RPC get_mutual_followers first
    const { data: rpcData, error: rpcErr } = await supabase.rpc("get_mutual_followers");
    if (!rpcErr && Array.isArray(rpcData)) {
      return rpcData.map((p: any) => ({
        id: p.id,
        username: p.username,
        avatar_url: p.avatar_url,
        is_public: p.is_public,
      }));
    }
  } catch {
    // Fallback below
  }

  try {
    // 2. Client-side query fallback
    // Fetch connections where current user is follower and status = accepted
    const { data: myFollowing } = await supabase
      .from("connections")
      .select("following_id")
      .eq("follower_id", userId)
      .eq("status", "accepted");

    if (!myFollowing || myFollowing.length === 0) return [];
    const followingIds = myFollowing.map((c) => c.following_id);

    // Fetch connections where those users follow current user back with status = accepted
    const { data: followersBack } = await supabase
      .from("connections")
      .select("follower_id")
      .eq("following_id", userId)
      .eq("status", "accepted")
      .in("follower_id", followingIds);

    if (!followersBack || followersBack.length === 0) return [];
    const mutualIds = followersBack.map((c) => c.follower_id);

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, avatar_url, is_public")
      .in("id", mutualIds)
      .order("username", { ascending: true });

    return (profiles || []) as CompanionProfile[];
  } catch (err) {
    console.warn("Could not fetch mutual followers:", err);
    return [];
  }
}

/**
 * Accepts a trip companion invitation.
 * Creates an entry in ascents or experience_records for the companion without copying photos or notes.
 */
export async function acceptTripInvitation(
  invitation: RecordCompanion,
  currentUserId: string
): Promise<{ success: boolean; error?: string; recordId?: string }> {
  if (!supabase || !currentUserId || invitation.companion_id !== currentUserId) {
    return { success: false, error: "No autorizado para aceptar esta invitación." };
  }

  try {
    let createdRecordId: string | null = null;

    if (invitation.record_type === "ascent") {
      // Check if user already has an ascent on that exact date/summit
      const { data: existing } = await supabase
        .from("ascents")
        .select("id")
        .eq("user_id", currentUserId)
        .eq("summit_id", invitation.item_id)
        .eq("achieved_on", invitation.start_date)
        .maybeSingle();

      if (existing?.id) {
        createdRecordId = existing.id;
        await supabase
          .from("ascents")
          .update({
            trip_group_id: invitation.trip_group_id,
            end_date: invitation.end_date || null,
          })
          .eq("id", existing.id);
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from("ascents")
          .insert({
            user_id: currentUserId,
            summit_id: invitation.item_id,
            achieved_on: invitation.start_date,
            end_date: invitation.end_date || null,
            trip_group_id: invitation.trip_group_id,
            notes: null,
            is_wishlist: false,
          })
          .select("id")
          .single();

        if (insErr) {
          return { success: false, error: insErr.message };
        }
        createdRecordId = inserted?.id || null;
      }
    } else {
      // Experience record
      const { data: existing } = await supabase
        .from("experience_records")
        .select("id")
        .eq("user_id", currentUserId)
        .eq("experience_id", invitation.item_id)
        .eq("achieved_on", invitation.start_date)
        .maybeSingle();

      if (existing?.id) {
        createdRecordId = existing.id;
        await supabase
          .from("experience_records")
          .update({
            trip_group_id: invitation.trip_group_id,
            sub_item_id: invitation.sub_item_id || null,
            location_name: invitation.location_name || null,
            lat: invitation.lat ?? null,
            lng: invitation.lng ?? null,
          })
          .eq("id", existing.id);
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from("experience_records")
          .insert({
            user_id: currentUserId,
            experience_id: invitation.item_id,
            sub_item_id: invitation.sub_item_id || null,
            achieved_on: invitation.start_date,
            location_name: invitation.location_name || null,
            lat: invitation.lat ?? null,
            lng: invitation.lng ?? null,
            trip_group_id: invitation.trip_group_id,
            notes: null,
            is_wishlist: false,
          })
          .select("id")
          .single();

        if (insErr) {
          return { success: false, error: insErr.message };
        }
        createdRecordId = inserted?.id || null;
      }
    }

    // Update invitation status
    const { error: updErr } = await supabase
      .from("record_companions")
      .update({
        status: "accepted",
        companion_record_id: createdRecordId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invitation.id);

    if (updErr) {
      return { success: false, error: updErr.message };
    }

    return { success: true, recordId: createdRecordId || undefined };
  } catch (err: any) {
    return { success: false, error: err?.message || "Error al aceptar invitación." };
  }
}

/**
 * Rejects a trip companion invitation.
 */
export async function rejectTripInvitation(
  invitationId: string,
  currentUserId: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabase || !currentUserId) return { success: false, error: "No autenticado" };

  try {
    const { error } = await supabase
      .from("record_companions")
      .update({
        status: "rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", invitationId)
      .eq("companion_id", currentUserId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Error al rechazar invitación." };
  }
}

/**
 * Unlinks / removes a companion from an accepted trip.
 */
export async function unlinkCompanion(
  companionRecordId: string,
  currentUserId: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabase || !currentUserId) return { success: false, error: "No autenticado" };

  try {
    // Check if the user is companion or inviter
    const { data: comp } = await supabase
      .from("record_companions")
      .select("*")
      .eq("id", companionRecordId)
      .single();

    if (!comp) return { success: false, error: "Registro de compañero no encontrado" };

    if (comp.companion_id === currentUserId) {
      // Unlink companion record
      if (comp.companion_record_id) {
        const table = comp.record_type === "ascent" ? "ascents" : "experience_records";
        await supabase
          .from(table)
          .update({ trip_group_id: null })
          .eq("id", comp.companion_record_id);
      }
      await supabase
        .from("record_companions")
        .update({
          status: "separated",
          companion_record_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", companionRecordId);
    } else if (comp.inviter_id === currentUserId) {
      // Inviter removes companion
      await supabase
        .from("record_companions")
        .delete()
        .eq("id", companionRecordId);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Error al desvincular" };
  }
}


/**
 * Automatically detects and links mutual invitations when both users have invited each other
 * for the same activity on overlapping dates.
 * If a matching invitation from companion -> current user exists:
 * - Unites both activities under the existing trip_group_id
 * - Automatically sets status to 'accepted' on both sides
 * - Links records together immediately
 */
export async function syncMutualTripInvitations({
  currentUserId,
  companionId,
  itemId,
  subItemId,
  startDate,
  endDate,
  currentRecordId,
  currentTripGroupId,
  recordType,
}: {
  currentUserId: string;
  companionId: string;
  itemId: string;
  subItemId?: string | null;
  startDate: string;
  endDate?: string | null;
  currentRecordId?: string | null;
  currentTripGroupId: string;
  recordType: "ascent" | "experience";
}): Promise<{
  isMutual: boolean;
  resolvedTripGroupId: string;
  status: "pending" | "accepted";
}> {
  if (!supabase || !currentUserId || !companionId) {
    return { isMutual: false, resolvedTripGroupId: currentTripGroupId, status: "pending" };
  }

  try {
    const { data: companionInvs, error } = await supabase
      .from("record_companions")
      .select("*")
      .eq("inviter_id", companionId)
      .eq("companion_id", currentUserId)
      .eq("item_id", itemId)
      .in("status", ["pending", "accepted"]);

    if (error || !companionInvs || companionInvs.length === 0) {
      return { isMutual: false, resolvedTripGroupId: currentTripGroupId, status: "pending" };
    }

    const matchingInv = companionInvs.find((inv: any) => {
      if (subItemId && inv.sub_item_id !== subItemId) return false;
      return datesOverlap(startDate, endDate, inv.start_date, inv.end_date);
    });

    if (!matchingInv) {
      return { isMutual: false, resolvedTripGroupId: currentTripGroupId, status: "pending" };
    }

    const unitedTripGroupId = matchingInv.trip_group_id;

    // 1. Mark companion's invitation to current user as accepted
    await supabase
      .from("record_companions")
      .update({
        status: "accepted",
        companion_record_id: currentRecordId || matchingInv.companion_record_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", matchingInv.id);

    // 2. If current user's record is stored with a different trip_group_id, update it to unitedTripGroupId
    if (currentRecordId && currentTripGroupId !== unitedTripGroupId) {
      const table = recordType === "ascent" ? "ascents" : "experience_records";
      await supabase
        .from(table)
        .update({ trip_group_id: unitedTripGroupId })
        .eq("id", currentRecordId);
    }

    return {
      isMutual: true,
      resolvedTripGroupId: unitedTripGroupId,
      status: "accepted",
    };
  } catch (err) {
    console.warn("Could not sync mutual invitations:", err);
    return { isMutual: false, resolvedTripGroupId: currentTripGroupId, status: "pending" };
  }
}
