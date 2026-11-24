import webpush from "web-push";
import { predefinedCategories } from "@/data/experiences";
import { countriesById, peaksById } from "@/lib/progress-utils";

export type PushItemKind = "country" | "peak" | "experience";

export interface PushNotificationPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

const predefinedExpNameMap = new Map<string, string>();
for (const cat of predefinedCategories) {
  for (const exp of cat.experiences) {
    predefinedExpNameMap.set(exp.id, exp.name);
  }
}

function getVapidConfig(): {
  subject: string;
  publicKey: string;
  privateKey: string;
} | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || "";
  const subject =
    process.env.VAPID_SUBJECT?.trim() || "mailto:atlas.maplog@gmail.com";

  if (!publicKey || !privateKey) return null;
  return { subject, publicKey, privateKey };
}

export function isPushConfigured(): boolean {
  return getVapidConfig() !== null;
}

function resolveItemTitle(
  itemKind: PushItemKind,
  itemId: string,
  fallbackTitle?: string | null
): string {
  if (itemKind === "country") {
    return countriesById.get(itemId)?.name || fallbackTitle || itemId;
  }
  if (itemKind === "peak") {
    return peaksById.get(itemId)?.name || fallbackTitle || itemId;
  }
  const baseId = itemId.includes("::") ? itemId.split("::")[0] : itemId;
  return predefinedExpNameMap.get(baseId) || fallbackTitle || "una experiencia";
}

export async function sendPushToUsers(options: {
  supabaseAdmin: any;
  recipientUserIds: string[];
  preferenceColumn: "notify_following_posts" | "notify_shared_records";
  payload: PushNotificationPayload;
}): Promise<{ sent: number; removed: number; skipped?: boolean }> {
  const { supabaseAdmin, recipientUserIds, preferenceColumn, payload } = options;
  const vapid = getVapidConfig();
  if (!vapid || !supabaseAdmin) {
    return { sent: 0, removed: 0, skipped: true };
  }

  const uniqueIds = Array.from(new Set(recipientUserIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return { sent: 0, removed: 0 };
  }

  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", uniqueIds)
    .eq(preferenceColumn, true);

  if (error || !Array.isArray(subs) || subs.length === 0) {
    return { sent: 0, removed: 0 };
  }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag || "atlas-notification",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  });

  let sent = 0;
  const staleIds: string[] = [];

  await Promise.all(
    subs.map(async (sub: any) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          message,
          { TTL: 86400 }
        );
        sent += 1;
      } catch (err: any) {
        const statusCode = err?.statusCode ?? err?.status;
        if (statusCode === 404 || statusCode === 410) {
          if (sub.id) staleIds.push(sub.id);
        } else {
          console.warn("[WebPush] Error sending notification:", err?.message || err);
        }
      }
    })
  );

  if (staleIds.length > 0) {
    await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .in("id", staleIds);
  }

  return { sent, removed: staleIds.length };
}

export async function notifyFollowersOfNewPost(
  supabaseAdmin: any,
  input: {
    actorUserId: string;
    itemKind: PushItemKind;
    itemId: string;
    subItemId?: string | null;
    title?: string | null;
  }
): Promise<{ sent: number; skipped?: boolean }> {
  if (!isPushConfigured() || !supabaseAdmin || !input.actorUserId) {
    return { sent: 0, skipped: true };
  }

  // Enforce stealth isolation: test accounts never trigger notifications
  const { data: actor } = await supabaseAdmin
    .from("profiles")
    .select("username, is_test")
    .eq("id", input.actorUserId)
    .maybeSingle();

  if (!actor || actor.is_test === true || !actor.username) {
    return { sent: 0, skipped: true };
  }

  const { data: followersRows } = await supabaseAdmin
    .from("connections")
    .select("follower_id")
    .eq("following_id", input.actorUserId)
    .eq("status", "accepted");

  const followerIds = (followersRows || [])
    .map((r: any) => r.follower_id as string)
    .filter((id: string) => Boolean(id) && id !== input.actorUserId);

  if (followerIds.length === 0) {
    return { sent: 0 };
  }

  // Respect recipient modality preferences
  const { data: recipientProfiles } = await supabaseAdmin
    .from("profiles")
    .select("id, enable_peaks, enable_countries, enable_experiences")
    .in("id", followerIds);

  const allowedRecipients = (recipientProfiles || [])
    .filter((p: any) => {
      if (input.itemKind === "peak") return p.enable_peaks !== false;
      if (input.itemKind === "country") return p.enable_countries !== false;
      return p.enable_countries !== false && p.enable_experiences !== false;
    })
    .map((p: any) => p.id as string);

  if (allowedRecipients.length === 0) {
    return { sent: 0 };
  }

  const itemTitle = resolveItemTitle(input.itemKind, input.itemId, input.title);
  const recordId = input.subItemId ? `${input.itemId}::${input.subItemId}` : input.itemId;
  const challenge =
    input.itemKind === "peak"
      ? "peaks"
      : input.itemKind === "experience"
        ? "experiences"
        : "countries";

  const title =
    input.itemKind === "peak"
      ? "Nueva cima en Atlas"
      : input.itemKind === "experience"
        ? "Nueva experiencia en Atlas"
        : "Nuevo país en Atlas";

  const body =
    input.itemKind === "peak"
      ? `@${actor.username} ha registrado ${itemTitle}`
      : input.itemKind === "experience"
        ? `@${actor.username} ha vivido ${itemTitle}`
        : `@${actor.username} ha visitado ${itemTitle}`;

  const url = `/perfil/${encodeURIComponent(actor.username)}?challenge=${challenge}#panel=${encodeURIComponent(recordId)}`;

  const res = await sendPushToUsers({
    supabaseAdmin,
    recipientUserIds: allowedRecipients,
    preferenceColumn: "notify_following_posts",
    payload: {
      title,
      body,
      url,
      tag: `atlas-post-${input.actorUserId}-${recordId}`,
    },
  });

  return { sent: res.sent, skipped: res.skipped };
}

export async function notifyCompanionsOfSharedRecord(
  supabaseAdmin: any,
  input: {
    actorUserId: string;
    companionUserIds: string[];
    itemKind: PushItemKind;
    itemId: string;
    title?: string | null;
  }
): Promise<{ sent: number; skipped?: boolean }> {
  if (!isPushConfigured() || !supabaseAdmin || !input.actorUserId) {
    return { sent: 0, skipped: true };
  }

  const targetIds = Array.from(
    new Set(
      (input.companionUserIds || []).filter((id) => Boolean(id) && id !== input.actorUserId)
    )
  );
  if (targetIds.length === 0) {
    return { sent: 0 };
  }

  const { data: actor } = await supabaseAdmin
    .from("profiles")
    .select("username, is_test")
    .eq("id", input.actorUserId)
    .maybeSingle();

  if (!actor || actor.is_test === true || !actor.username) {
    return { sent: 0, skipped: true };
  }

  // Verify real pending invitations exist so arbitrary recipients cannot be spoofed
  const { data: invRows } = await supabaseAdmin
    .from("record_companions")
    .select("companion_id")
    .eq("inviter_id", input.actorUserId)
    .eq("item_id", input.itemId)
    .eq("status", "pending")
    .in("companion_id", targetIds);

  const verifiedCompanionIds = (invRows || [])
    .map((r: any) => r.companion_id as string)
    .filter(Boolean);

  if (verifiedCompanionIds.length === 0) {
    return { sent: 0 };
  }

  const itemTitle = resolveItemTitle(input.itemKind, input.itemId, input.title);
  const res = await sendPushToUsers({
    supabaseAdmin,
    recipientUserIds: verifiedCompanionIds,
    preferenceColumn: "notify_shared_records",
    payload: {
      title: "Registro compartido en Atlas",
      body: `@${actor.username} ha compartido ${itemTitle} contigo`,
      url: "/social?inbox=shared",
      tag: `atlas-share-${input.actorUserId}-${input.itemId}`,
    },
  });

  return { sent: res.sent, skipped: res.skipped };
}
