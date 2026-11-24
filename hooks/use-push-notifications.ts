"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-context";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function detectIosNeedsInstall(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIos =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true;
  return !isStandalone;
}

export function usePushNotifications() {
  const { session } = useAuth();
  const [supported, setSupported] = useState(false);
  const [needsIosInstall, setNeedsIosInstall] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveAccessToken = useCallback(async (): Promise<string | null> => {
    if (session?.access_token) return session.access_token;
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  }, [session?.access_token]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const iosNeedsInstall = detectIosNeedsInstall();
    setNeedsIosInstall(iosNeedsInstall);

    const hasPushApis =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window &&
      Boolean(VAPID_PUBLIC_KEY);

    setSupported(hasPushApis);
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }

    if (!hasPushApis) return;

    let cancelled = false;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) {
          setSubscribed(Boolean(sub));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const enablePush = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (needsIosInstall) {
      setError("En iPhone/iPad añade Atlas a tu pantalla de inicio para activar notificaciones.");
      return false;
    }
    if (!supported) {
      setError("Las notificaciones push no están disponibles en este navegador.");
      return false;
    }

    const token = await resolveAccessToken();
    if (!token) {
      setError("Inicia sesión para activar las notificaciones.");
      return false;
    }

    setBusy(true);
    try {
      const perm =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        setError("Permiso de notificaciones denegado en el navegador.");
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const keyArray = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyArray.buffer as ArrayBuffer,
        });
      }

      const jsonSub = subscription.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: jsonSub.keys,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.detail || data?.error || "No se pudo guardar la suscripción.");
        return false;
      }

      setSubscribed(true);
      return true;
    } catch (err: any) {
      setError(err?.message || "No se pudieron activar las notificaciones.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [needsIosInstall, supported, resolveAccessToken]);

  const disablePush = useCallback(async (): Promise<boolean> => {
    setError(null);
    setBusy(true);
    try {
      let endpoint: string | null = null;
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          endpoint = subscription.endpoint;
          await subscription.unsubscribe();
        }
      }

      const token = await resolveAccessToken();
      if (token && endpoint) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ endpoint }),
        });
      }

      setSubscribed(false);
      return true;
    } catch (err: any) {
      setError(err?.message || "No se pudieron desactivar las notificaciones.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [resolveAccessToken]);

  const togglePush = useCallback(
    async (nextEnabled: boolean): Promise<boolean> => {
      return nextEnabled ? enablePush() : disablePush();
    },
    [enablePush, disablePush]
  );

  return {
    supported,
    needsIosInstall,
    permission,
    subscribed,
    busy,
    error,
    enablePush,
    disablePush,
    togglePush,
  };
}
