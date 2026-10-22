import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./auth-context";

export function usePendingTripInvitations() {
  const [pendingCount, setPendingCount] = useState(0);
  const { session } = useAuth();

  const checkPending = useCallback(async () => {
    if (!supabase || !session) {
      setPendingCount(0);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("record_companions")
        .select("id")
        .eq("companion_id", session.user.id)
        .eq("status", "pending");

      if (!error && data) {
        setPendingCount(data.length);
      }
    } catch {
      // Ignore
    }
  }, [session]);

  useEffect(() => {
    let mounted = true;
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

    if (!supabase || !session) {
      setPendingCount(0);
      return;
    }

    const sb = supabase;
    const userId = session.user.id;

    checkPending();

    const handlePendingChanged = () => {
      if (mounted) {
        checkPending();
      }
    };

    window.addEventListener("atlas:pending-changed", handlePendingChanged);

    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channelName = `pending-trip-invites:${userId}:${uniqueId}`;

    channel = sb.channel(channelName);
    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "record_companions",
          filter: `companion_id=eq.${userId}`,
        },
        () => {
          if (mounted) {
            checkPending();
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      window.removeEventListener("atlas:pending-changed", handlePendingChanged);
      if (channel) {
        sb.removeChannel(channel);
      }
    };
  }, [session, checkPending]);

  return {
    hasPendingInvitations: pendingCount > 0,
    pendingCount,
    refreshPending: checkPending,
  };
}
