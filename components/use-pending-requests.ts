import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './auth-context';

export function usePendingRequests() {
  const [hasPendingRequests, setHasPendingRequests] = useState(false);
  const { session, profile } = useAuth();

  useEffect(() => {
    let mounted = true;
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;

    if (!supabase || !session) {
      setHasPendingRequests(false);
      return;
    }

    const sb = supabase;
    const userId = session.user.id;

    async function checkPending() {
      if (!mounted) return;
      if (profile && profile.is_public) {
        if (mounted) setHasPendingRequests(false);
        return;
      }

      const { data: pendingConns } = await sb
        .from('connections')
        .select('status')
        .eq('following_id', userId)
        .eq('status', 'pending')
        .limit(1);

      if (mounted) {
        setHasPendingRequests(Boolean(pendingConns && pendingConns.length > 0));
      }
    }

    checkPending();

    // Globally unique channel name to avoid collisions with
    // stale channels from React StrictMode double-mount or HMR.
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channelName = `pending-req:${userId}:${uniqueId}`;

    channel = sb.channel(channelName);
    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'connections',
          filter: `following_id=eq.${userId}`,
        },
        () => {
          checkPending();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      if (channel) {
        sb.removeChannel(channel);
      }
    };
  }, [session, profile]);

  return hasPendingRequests;
}
