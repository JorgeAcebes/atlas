import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  getInitialSocialData,
  getStoredSocialData,
  setStoredSocialData,
  updateSocialCache,
  preloadSocialConnections,
  type SocialData,
} from "@/lib/social-cache";

describe("Social Connections & Followers/Following Preloading", () => {
  const rootDir = process.cwd();
  const testUserId = "user-test-uuid-123";

  beforeEach(() => {
    (globalThis as any).window = {
      dispatchEvent: vi.fn(),
    };
    (globalThis as any).localStorage = {
      _store: {} as Record<string, string>,
      getItem(key: string) {
        return this._store[key] || null;
      },
      setItem(key: string, value: string) {
        this._store[key] = value;
      },
      removeItem(key: string) {
        delete this._store[key];
      },
      clear() {
        this._store = {};
      },
    };
  });

  afterEach(() => {
    delete (globalThis as any).localStorage;
    delete (globalThis as any).window;
  });

  it("1. getInitialSocialData returns empty structures when userId is null/undefined", () => {
    const data = getInitialSocialData(null);
    expect(data.followers).toEqual([]);
    expect(data.following).toEqual([]);
    expect(data.connections).toEqual({});
    expect(data.followerStatuses).toEqual({});
    expect(data.lastFetched).toBe(0);
  });

  it("2. getStoredSocialData and setStoredSocialData persist and recover from localStorage", () => {
    const sampleData: SocialData = {
      followers: [
        { id: "f1", username: "explorador1", avatar_url: null, is_public: true },
        { id: "f2", username: "montanero2", avatar_url: "https://example.com/avatar.jpg", is_public: false },
      ],
      following: [
        { id: "f3", username: "viajero3", avatar_url: null, is_public: true },
      ],
      connections: { f3: "accepted" },
      followerStatuses: { f1: "accepted", f2: "pending" },
      lastFetched: Date.now(),
    };

    setStoredSocialData(testUserId, sampleData);

    const retrieved = getStoredSocialData(testUserId);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.followers.length).toBe(2);
    expect(retrieved?.following.length).toBe(1);
    expect(retrieved?.followerStatuses["f1"]).toBe("accepted");
    expect(retrieved?.followerStatuses["f2"]).toBe("pending");
  });

  it("3. getInitialSocialData returns localStorage data synchronously on cold load", () => {
    const sampleData: SocialData = {
      followers: [{ id: "f1", username: "explorador1", avatar_url: null, is_public: true }],
      following: [{ id: "f2", username: "viajero2", avatar_url: null, is_public: true }],
      connections: { f2: "accepted" },
      followerStatuses: { f1: "accepted" },
      lastFetched: Date.now(),
    };

    setStoredSocialData("cold-user-456", sampleData);

    const initial = getInitialSocialData("cold-user-456");
    expect(initial.followers.length).toBe(1);
    expect(initial.following.length).toBe(1);
    expect(initial.followers[0].username).toBe("explorador1");
    expect(initial.following[0].username).toBe("viajero2");
  });

  it("4. updateSocialCache updates memory, localStorage, and dispatches atlas:social-preloaded event", () => {
    let dispatchedEvent: CustomEvent | null = null;
    (globalThis as any).window = {
      dispatchEvent: vi.fn((e: CustomEvent) => {
        dispatchedEvent = e;
        return true;
      }),
    };

    const updated = updateSocialCache(testUserId, (prev) => ({
      ...prev,
      followers: [{ id: "new-f", username: "nuevo_seguidor", avatar_url: null, is_public: true }],
      followerStatuses: { "new-f": "accepted" },
      lastFetched: Date.now(),
    }));

    expect(updated.followers.length).toBe(1);
    expect(updated.followers[0].username).toBe("nuevo_seguidor");

    // Check localStorage
    const stored = getStoredSocialData(testUserId);
    expect(stored?.followers[0].username).toBe("nuevo_seguidor");

    // Check event dispatch
    expect((globalThis as any).window.dispatchEvent).toHaveBeenCalled();
    expect(dispatchedEvent).not.toBeNull();
    expect((dispatchedEvent as any).type).toBe("atlas:social-preloaded");
    expect((dispatchedEvent as any).detail.userId).toBe(testUserId);
  });

  it("5. social-tab.tsx: uses getInitialSocialData on mount and listens for preloaded events", () => {
    const socialTabContent = fs.readFileSync(path.join(rootDir, "components/social-tab.tsx"), "utf-8");

    // Imports from social-cache
    expect(socialTabContent).toContain('import {');
    expect(socialTabContent).toContain('getInitialSocialData');
    expect(socialTabContent).toContain('preloadSocialConnections');
    expect(socialTabContent).toContain('updateSocialCache');
    expect(socialTabContent).toContain('from "@/lib/social-cache"');

    // State initialized from initialSocial
    expect(socialTabContent).toContain("const initialSocial = useMemo(() => getInitialSocialData(userId), [userId]);");
    expect(socialTabContent).toContain("const [followers, setFollowers] = useState<Profile[]>(() => initialSocial.followers);");
    expect(socialTabContent).toContain("const [following, setFollowing] = useState<Profile[]>(() => initialSocial.following);");
    expect(socialTabContent).toContain("const [connections, setConnections] = useState<Record<string, ConnectionStatus>>(() => initialSocial.connections);");
    expect(socialTabContent).toContain("const [followerStatuses, setFollowerStatuses] = useState<Record<string, ConnectionStatus>>(() => initialSocial.followerStatuses);");

    // Listens for atlas:social-preloaded
    expect(socialTabContent).toContain('window.addEventListener("atlas:social-preloaded", handlePreload);');
    expect(socialTabContent).toContain('window.removeEventListener("atlas:social-preloaded", handlePreload);');

    // Preloads connections in effect
    expect(socialTabContent).toContain("await preloadSocialConnections(uid, Boolean(hookPending));");
  });

  it("6. summit-tracker.tsx: preloads social connections in background alongside photo preloading and on follow/unfollow", () => {
    const trackerContent = fs.readFileSync(path.join(rootDir, "components/summit-tracker.tsx"), "utf-8");

    // Imports preloadSocialConnections
    expect(trackerContent).toContain('import { preloadSocialConnections } from "@/lib/social-cache";');

    // Background preloading effect
    expect(trackerContent).toMatch(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?preloadSocialConnections\(session\.user\.id\);[\s\S]*?\},?\s*\[session\?\.user\?\.id\]\);/);

    // handleFollowTarget refreshes cache
    expect(trackerContent).toMatch(/handleFollowTarget[\s\S]*?preloadSocialConnections\(session\.user\.id,\s*true\);/);

    // handleUnfollowTarget refreshes cache
    expect(trackerContent).toMatch(/handleUnfollowTarget[\s\S]*?preloadSocialConnections\(session\.user\.id,\s*true\);/);
  });

  it("7. auth-context.tsx: preloads social connections immediately on session load and auth state changes", () => {
    const authContent = fs.readFileSync(path.join(rootDir, "components/auth-context.tsx"), "utf-8");

    expect(authContent).toContain('import { preloadSocialConnections } from "@/lib/social-cache";');
    expect(authContent).toContain("preloadSocialConnections(initSession.user.id);");
    expect(authContent).toContain("preloadSocialConnections(nextSession.user.id);");
  });
});
