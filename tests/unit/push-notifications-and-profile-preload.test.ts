import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { apiRateLimiter } from "@/lib/rate-limit";

const webPushMocks = vi.hoisted(() => ({
  sentCalls: [] as Array<{ subscription: any; payload: any; options: any }>,
  staleEndpoints: new Set<string>(),
  setVapidCalls: [] as Array<[string, string, string]>,
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: (subject: string, publicKey: string, privateKey: string) => {
      webPushMocks.setVapidCalls.push([subject, publicKey, privateKey]);
    },
    sendNotification: async (subscription: any, payload: string, options: any) => {
      if (webPushMocks.staleEndpoints.has(subscription.endpoint)) {
        const err: any = new Error("Gone");
        err.statusCode = 410;
        throw err;
      }
      webPushMocks.sentCalls.push({
        subscription,
        payload: JSON.parse(payload),
        options,
      });
    },
  },
}));

import {
  notifyCompanionsOfSharedRecord,
  notifyFollowersOfNewPost,
} from "@/lib/push-notifications";
import { POST as postPushSubscribe } from "@/app/api/push/subscribe/route";
import { generateApiKey } from "@/lib/api-auth";

function createInMemoryPushDb() {
  const tables: Record<string, Array<Record<string, any>>> = {
    profiles: [
      {
        id: "actor-1",
        username: "jorge",
        is_test: false,
        enable_peaks: true,
        enable_countries: true,
        enable_experiences: true,
      },
      {
        id: "test-actor",
        username: "qa_bot",
        is_test: true,
        enable_peaks: true,
        enable_countries: true,
        enable_experiences: true,
      },
      {
        id: "follower-yes",
        username: "ana",
        is_test: false,
        enable_peaks: true,
        enable_countries: true,
        enable_experiences: true,
      },
      {
        id: "follower-no-peaks",
        username: "bruno",
        is_test: false,
        enable_peaks: false,
        enable_countries: true,
        enable_experiences: false,
      },
      {
        id: "non-follower",
        username: "clara",
        is_test: false,
        enable_peaks: true,
        enable_countries: true,
        enable_experiences: true,
      },
    ],
    connections: [
      {
        follower_id: "follower-yes",
        following_id: "actor-1",
        status: "accepted",
      },
      {
        follower_id: "follower-no-peaks",
        following_id: "actor-1",
        status: "accepted",
      },
      {
        follower_id: "follower-yes",
        following_id: "test-actor",
        status: "accepted",
      },
    ],
    record_companions: [
      {
        id: "rc-1",
        inviter_id: "actor-1",
        companion_id: "follower-yes",
        item_id: "country-jp",
        status: "pending",
      },
    ],
    push_subscriptions: [
      {
        id: "sub-1",
        user_id: "follower-yes",
        endpoint: "https://push.example.test/sub-1",
        p256dh: "p256dh-1",
        auth: "auth-1",
        notify_following_posts: true,
        notify_shared_records: true,
      },
      {
        id: "sub-stale",
        user_id: "follower-yes",
        endpoint: "https://push.example.test/sub-stale",
        p256dh: "p256dh-stale",
        auth: "auth-stale",
        notify_following_posts: true,
        notify_shared_records: true,
      },
      {
        id: "sub-no-peaks",
        user_id: "follower-no-peaks",
        endpoint: "https://push.example.test/sub-2",
        p256dh: "p256dh-2",
        auth: "auth-2",
        notify_following_posts: true,
        notify_shared_records: true,
      },
      {
        id: "sub-stranger",
        user_id: "non-follower",
        endpoint: "https://push.example.test/sub-3",
        p256dh: "p256dh-3",
        auth: "auth-3",
        notify_following_posts: true,
        notify_shared_records: true,
      },
    ],
  };

  const makeBuilder = (table: string) => {
    const filters: Array<(r: Record<string, any>) => boolean> = [];
    let isDelete = false;
    let isMaybeSingle = false;

    const builder: any = {
      select: () => builder,
      eq: (col: string, val: any) => {
        filters.push((r) => r[col] === val);
        return builder;
      },
      in: (col: string, vals: any[]) => {
        filters.push((r) => vals.includes(r[col]));
        return builder;
      },
      delete: () => {
        isDelete = true;
        return builder;
      },
      maybeSingle: () => {
        isMaybeSingle = true;
        return builder;
      },
      then: (resolve: any) => {
        const rows = tables[table] || [];
        if (isDelete) {
          tables[table] = rows.filter((r) => !filters.every((f) => f(r)));
          return Promise.resolve({ data: null, error: null }).then(resolve);
        }
        const matched = rows.filter((r) => filters.every((f) => f(r)));
        if (isMaybeSingle) {
          return Promise.resolve({ data: matched[0] || null, error: null }).then(resolve);
        }
        return Promise.resolve({ data: matched, error: null }).then(resolve);
      },
    };
    return builder;
  };

  return {
    tables,
    from: (table: string) => makeBuilder(table),
  };
}

describe("Web Push Notifications & ProfileSettings Preload", () => {
  const prevPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const prevPrivate = process.env.VAPID_PRIVATE_KEY;

  beforeEach(() => {
    apiRateLimiter.reset();
    webPushMocks.sentCalls = [];
    webPushMocks.setVapidCalls = [];
    webPushMocks.staleEndpoints.clear();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-vapid-public-key";
    process.env.VAPID_PRIVATE_KEY = "test-vapid-private-key";
  });

  afterEach(() => {
    if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    else process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = prevPublic;
    if (prevPrivate === undefined) delete process.env.VAPID_PRIVATE_KEY;
    else process.env.VAPID_PRIVATE_KEY = prevPrivate;
  });

  it("ProfileSettings hydrates synchronously from useAuth and app shell + topbar preload its chunk", () => {
    const profileSettingsSrc = fs.readFileSync(
      path.join(process.cwd(), "components/profile-settings.tsx"),
      "utf8"
    );
    expect(profileSettingsSrc).toContain("useAuth");
    expect(profileSettingsSrc).toContain("const [loading, setLoading] = useState(!initialProfile);");
    expect(profileSettingsSrc).toContain("usePushNotifications");
    expect(profileSettingsSrc).toContain("Notificaciones push");

    const shellSrc = fs.readFileSync(
      path.join(process.cwd(), "components/app-tabs-shell.tsx"),
      "utf8"
    );
    expect(shellSrc).toContain('import("@/components/profile-settings")');

    const topbarSrc = fs.readFileSync(
      path.join(process.cwd(), "components/layout/app-topbar.tsx"),
      "utf8"
    );
    expect(topbarSrc).toContain('import("@/components/profile-settings")');
  });

  it("public/sw.js keeps CACHE_VERSION = 'v14' and registers push + notificationclick listeners", () => {
    const swSrc = fs.readFileSync(path.join(process.cwd(), "public/sw.js"), "utf8");
    expect(swSrc).toContain('CACHE_VERSION = "v14"');
    expect(swSrc).toContain('self.addEventListener("push"');
    expect(swSrc).toContain('self.addEventListener("notificationclick"');
  });

  it("migration 036_push_subscriptions.sql enables RLS and avoids DROP statements", () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/036_push_subscriptions.sql"),
      "utf8"
    );
    expect(sql).toContain("ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;");
    expect(sql).toContain("CREATE POLICY");
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("notifyFollowersOfNewPost notifies accepted followers matching modality, respects is_test stealth, and deletes 410 subscriptions", async () => {
    const db = createInMemoryPushDb();
    webPushMocks.staleEndpoints.add("https://push.example.test/sub-stale");

    // 1. Peak ascent: follower-no-peaks disabled peaks, so only follower-yes receives push
    const res = await notifyFollowersOfNewPost(db, {
      actorUserId: "actor-1",
      itemKind: "peak",
      itemId: "granada",
    });

    expect(res.sent).toBe(1);
    expect(webPushMocks.sentCalls).toHaveLength(1);
    expect(webPushMocks.sentCalls[0].subscription.endpoint).toBe(
      "https://push.example.test/sub-1"
    );
    expect(webPushMocks.sentCalls[0].payload.body).toContain("@jorge");
    expect(webPushMocks.sentCalls[0].payload.body).toContain("Mulhacén");
    expect(webPushMocks.sentCalls[0].payload.url).toBe(
      "/perfil/jorge?challenge=peaks#panel=granada"
    );

    // Stale 410 subscription must be pruned from push_subscriptions
    expect(db.tables.push_subscriptions.some((s) => s.id === "sub-stale")).toBe(false);

    // 2. Test account (is_test: true) must never trigger notifications
    const stealthRes = await notifyFollowersOfNewPost(db, {
      actorUserId: "test-actor",
      itemKind: "country",
      itemId: "country-jp",
    });
    expect(stealthRes.sent).toBe(0);
    expect(stealthRes.skipped).toBe(true);
  });

  it("notifyCompanionsOfSharedRecord only notifies companions with verified pending invitations", async () => {
    const db = createInMemoryPushDb();
    webPushMocks.staleEndpoints.add("https://push.example.test/sub-stale");

    const res = await notifyCompanionsOfSharedRecord(db, {
      actorUserId: "actor-1",
      companionUserIds: ["follower-yes", "non-follower"],
      itemKind: "country",
      itemId: "country-jp",
    });

    // Only follower-yes has a record_companions pending row (sub-3 for non-follower is excluded)
    expect(res.sent).toBe(1);
    expect(webPushMocks.sentCalls).toHaveLength(1);
    expect(webPushMocks.sentCalls[0].subscription.endpoint).toBe(
      "https://push.example.test/sub-1"
    );
    expect(webPushMocks.sentCalls[0].payload.url).toBe("/social?inbox=shared");
    expect(webPushMocks.sentCalls[0].payload.body).toContain("Japón");
  });

  it("POST /api/push/subscribe rejects API keys (403 session_required)", async () => {
    const key = generateApiKey();
    const res = await postPushSubscribe(
      new Request("https://atlas-log.vercel.app/api/push/subscribe", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key.rawKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          endpoint: "https://push.example.test/abc",
          keys: { p256dh: "k1", auth: "k2" },
        }),
      })
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe("session_required");
  });
});
