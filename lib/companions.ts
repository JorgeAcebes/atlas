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
 * - If user already has a record on the exact invitation date: links under the trip_group_id.
 * - If user has an existing record with "Fecha desconocida" ('1900-01-01') and the invitation
 *   has a known date: converts the unknown date record to the invitation's concrete date,
 *   preserving the user's existing photos and notes.
 * - Conversely, if the invitation has "Fecha desconocida" and the user already has a known-date
 *   record, the user's dated record is NEVER overwritten or removed; instead, a new record
 *   with "Fecha desconocida" is created alongside it.
 */
export async function acceptTripInvitation(
  invitation: RecordCompanion,
  currentUserId: string
): Promise<{ success: boolean; error?: string; recordId?: string; wasConvertedFromUnknown?: boolean }> {
  if (!supabase || !currentUserId || invitation.companion_id !== currentUserId) {
    return { success: false, error: "No autorizado para aceptar esta invitación." };
  }

  try {
    let createdRecordId: string | null = null;
    let wasConvertedFromUnknown = false;
    const invitationHasKnownDate = Boolean(
      invitation.start_date && invitation.start_date !== "1900-01-01"
    );

    // Match inviter's actual trip_group_id if their record already has one
    let effectiveTripGroupId = invitation.trip_group_id;
    if (invitation.record_type === "ascent") {
      const { data: inviterAscent } = await supabase
        .from("ascents")
        .select("trip_group_id")
        .eq("user_id", invitation.inviter_id)
        .eq("summit_id", invitation.item_id)
        .eq("achieved_on", invitation.start_date)
        .maybeSingle();
      if (inviterAscent?.trip_group_id) {
        effectiveTripGroupId = inviterAscent.trip_group_id;
      }
    } else {
      const { data: inviterExp } = await supabase
        .from("experience_records")
        .select("trip_group_id")
        .eq("user_id", invitation.inviter_id)
        .eq("experience_id", invitation.item_id)
        .eq("achieved_on", invitation.start_date)
        .maybeSingle();
      if (inviterExp?.trip_group_id) {
        effectiveTripGroupId = inviterExp.trip_group_id;
      }
    }

    if (invitation.record_type === "ascent") {
      // 1. Check if user already has an ascent on that exact date/summit
      const { data: existingExact } = await supabase
        .from("ascents")
        .select("id")
        .eq("user_id", currentUserId)
        .eq("summit_id", invitation.item_id)
        .eq("achieved_on", invitation.start_date)
        .maybeSingle();

      if (existingExact?.id) {
        createdRecordId = existingExact.id;
        await supabase
          .from("ascents")
          .update({
            trip_group_id: effectiveTripGroupId,
            end_date: invitation.end_date || null,
          })
          .eq("id", existingExact.id);
      } else {
        // 2. If invitation has a concrete known date, check if user has an existing record with "Fecha desconocida"
        let unknownRecordId: string | null = null;
        if (invitationHasKnownDate) {
          const { data: existingUnknown } = await supabase
            .from("ascents")
            .select("id")
            .eq("user_id", currentUserId)
            .eq("summit_id", invitation.item_id)
            .eq("achieved_on", "1900-01-01")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingUnknown?.id) {
            unknownRecordId = existingUnknown.id;
          }
        }

        if (unknownRecordId) {
          createdRecordId = unknownRecordId;
          wasConvertedFromUnknown = true;
          await supabase
            .from("ascents")
            .update({
              achieved_on: invitation.start_date,
              end_date: invitation.end_date || null,
              trip_group_id: effectiveTripGroupId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", unknownRecordId);

          // Update any associated photos taken_on from 1900-01-01 to the invitation's real date
          await supabase
            .from("summit_photos")
            .update({ taken_on: invitation.start_date })
            .match({
              user_id: currentUserId,
              summit_id: invitation.item_id,
              taken_on: "1900-01-01",
            });
        } else {
          // 3. Otherwise (no exact match and no unknown record to convert, OR invitation itself has unknown date),
          // insert a new record without modifying any existing dated records.
          const { data: inserted, error: insErr } = await supabase
            .from("ascents")
            .insert({
              user_id: currentUserId,
              summit_id: invitation.item_id,
              achieved_on: invitation.start_date,
              end_date: invitation.end_date || null,
              trip_group_id: effectiveTripGroupId,
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
    } else {
      // Experience record
      // 1. Check if user already has an experience on that exact date & sub-item
      let exactQuery = supabase
        .from("experience_records")
        .select("id")
        .eq("user_id", currentUserId)
        .eq("experience_id", invitation.item_id)
        .eq("achieved_on", invitation.start_date);

      if (invitation.sub_item_id) {
        exactQuery = exactQuery.eq("sub_item_id", invitation.sub_item_id);
      } else {
        exactQuery = exactQuery.is("sub_item_id", null);
      }

      const { data: existingExact } = await exactQuery.maybeSingle();

      if (existingExact?.id) {
        createdRecordId = existingExact.id;
        await supabase
          .from("experience_records")
          .update({
            trip_group_id: effectiveTripGroupId,
            location_name: invitation.location_name || null,
            lat: invitation.lat ?? null,
            lng: invitation.lng ?? null,
          })
          .eq("id", existingExact.id);
      } else {
        // 2. If invitation has a concrete known date, check if user has an existing record with "Fecha desconocida"
        let unknownRecordId: string | null = null;
        if (invitationHasKnownDate) {
          let unknownQuery = supabase
            .from("experience_records")
            .select("id")
            .eq("user_id", currentUserId)
            .eq("experience_id", invitation.item_id)
            .eq("achieved_on", "1900-01-01");

          if (invitation.sub_item_id) {
            unknownQuery = unknownQuery.eq("sub_item_id", invitation.sub_item_id);
          } else {
            unknownQuery = unknownQuery.is("sub_item_id", null);
          }

          const { data: existingUnknown } = await unknownQuery
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingUnknown?.id) {
            unknownRecordId = existingUnknown.id;
          }
        }

        if (unknownRecordId) {
          createdRecordId = unknownRecordId;
          wasConvertedFromUnknown = true;
          await supabase
            .from("experience_records")
            .update({
              achieved_on: invitation.start_date,
              trip_group_id: invitation.trip_group_id,
              location_name: invitation.location_name || null,
              lat: invitation.lat ?? null,
              lng: invitation.lng ?? null,
            })
            .eq("id", unknownRecordId);

          // Update any associated photos taken_on from 1900-01-01 to the invitation's real date
          const photoSummitId = invitation.sub_item_id
            ? `${invitation.item_id}::${invitation.sub_item_id}`
            : invitation.item_id;

          await supabase
            .from("summit_photos")
            .update({ taken_on: invitation.start_date })
            .match({
              user_id: currentUserId,
              summit_id: photoSummitId,
              taken_on: "1900-01-01",
            });
        } else {
          // 3. Otherwise, insert a new experience record
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
              trip_group_id: effectiveTripGroupId,
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
    }

    // Update invitation status
    const { error: updErr } = await supabase
      .from("record_companions")
      .update({
        status: "accepted",
        trip_group_id: effectiveTripGroupId,
        companion_record_id: createdRecordId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invitation.id);

    // Clean up any stale duplicate invitations between this inviter and companion for this item and date
    await supabase
      .from("record_companions")
      .delete()
      .eq("companion_id", currentUserId)
      .eq("inviter_id", invitation.inviter_id)
      .eq("item_id", invitation.item_id)
      .eq("start_date", invitation.start_date)
      .neq("id", invitation.id);

    if (updErr) {
      return { success: false, error: updErr.message };
    }

    return {
      success: true,
      recordId: createdRecordId || undefined,
      wasConvertedFromUnknown,
    };
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
    if (currentTripGroupId !== unitedTripGroupId) {
      if (currentRecordId) {
        const table = recordType === "ascent" ? "ascents" : "experience_records";
        await supabase
          .from(table)
          .update({ trip_group_id: unitedTripGroupId })
          .eq("id", currentRecordId);
      } else if (recordType === "ascent") {
        await supabase
          .from("ascents")
          .update({ trip_group_id: unitedTripGroupId })
          .match({
            user_id: currentUserId,
            summit_id: itemId,
            achieved_on: startDate,
          });
      }
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
