import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './auth-context';
import { notifyPendingChanged } from '@/lib/events';

export { notifyPendingChanged };

export function usePendingRequests() {
  const [hasPendingRequests, setHasPendingRequests] = useState(false);
  const { session } = useAuth();

  const checkPending = useCallback(async () => {
    if (!supabase || !session) {
      setHasPendingRequests(false);
      return;
    }

    const sb = supabase;
    const userId = session.user.id;

    try {
      const { data: pendingConns } = await sb
        .from('connections')
        .select('status')
        .eq('following_id', userId)
        .eq('status', 'pending')
        .limit(1);
      const hasPendingConns = Boolean(pendingConns && pendingConns.length > 0);

      const { data: pendingComps } = await sb
        .from('record_companions')
        .select('id')
        .eq('companion_id', userId)
        .eq('status', 'pending')
        .limit(1);
      const hasPendingComps = Boolean(pendingComps && pendingComps.length > 0);

      setHasPendingRequests(hasPendingConns || hasPendingComps);
    } catch {
      // Ignore
    }
  }, [session]);

  useEffect(() => {
    let mounted = true;
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;

    if (!supabase || !session) {
      setHasPendingRequests(false);
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

    window.addEventListener('atlas:pending-changed', handlePendingChanged);

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
          if (mounted) checkPending();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'record_companions',
          filter: `companion_id=eq.${userId}`,
        },
        () => {
          if (mounted) checkPending();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      window.removeEventListener('atlas:pending-changed', handlePendingChanged);
      if (channel) {
        sb.removeChannel(channel);
      }
    };
  }, [session, checkPending]);

  return hasPendingRequests;
}
