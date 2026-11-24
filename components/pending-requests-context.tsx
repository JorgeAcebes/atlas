"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./auth-context";

type PendingRequestsContextValue = {
  hasPendingRequests: boolean;
  hasPendingInvitations: boolean;
  pendingCount: number;
  refreshPending: () => Promise<void>;
};

const PendingRequestsContext = createContext<PendingRequestsContextValue>({
  hasPendingRequests: false,
  hasPendingInvitations: false,
  pendingCount: 0,
  refreshPending: async () => {},
});

export function PendingRequestsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id || null;

  const [hasPendingConns, setHasPendingConns] = useState(false);
  const [pendingTripsCount, setPendingTripsCount] = useState(0);
  const inFlightRef = useRef(false);

  const refreshPending = useCallback(async () => {
    if (!supabase || !userId) {
      setHasPendingConns(false);
      setPendingTripsCount(0);
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const sb = supabase;
    try {
      const [connsRes, compsRes] = await Promise.all([
        sb
          .from("connections")
          .select("status")
          .eq("following_id", userId)
          .eq("status", "pending")
          .limit(1),
        sb
          .from("record_companions")
          .select("id")
          .eq("companion_id", userId)
          .eq("status", "pending"),
      ]);

      if (!connsRes.error) {
        setHasPendingConns(Boolean(connsRes.data && connsRes.data.length > 0));
      }
      if (!compsRes.error) {
        setPendingTripsCount(compsRes.data ? compsRes.data.length : 0);
      }
    } catch {
      // Ignore transient network errors
    } finally {
      inFlightRef.current = false;
    }
  }, [userId]);

  useEffect(() => {
    let mounted = true;
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

    if (!supabase || !userId) {
      setHasPendingConns(false);
      setPendingTripsCount(0);
      return;
    }

    const sb = supabase;
    refreshPending();

    const handlePendingChanged = () => {
      if (mounted) {
        refreshPending();
      }
    };

    window.addEventListener("atlas:pending-changed", handlePendingChanged);

    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    channel = sb.channel(`pending-shared:${userId}:${uniqueId}`);
    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "connections",
          filter: `following_id=eq.${userId}`,
        },
        () => {
          if (mounted) refreshPending();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "record_companions",
          filter: `companion_id=eq.${userId}`,
        },
        () => {
          if (mounted) refreshPending();
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
  }, [userId, refreshPending]);

  const value = useMemo<PendingRequestsContextValue>(
    () => ({
      hasPendingRequests: hasPendingConns || pendingTripsCount > 0,
      hasPendingInvitations: pendingTripsCount > 0,
      pendingCount: pendingTripsCount,
      refreshPending,
    }),
    [hasPendingConns, pendingTripsCount, refreshPending]
  );

  return (
    <PendingRequestsContext.Provider value={value}>
      {children}
    </PendingRequestsContext.Provider>
  );
}

export function usePendingRequestsContext() {
  return useContext(PendingRequestsContext);
}
