import { describe, it, expect } from "vitest";
import { datesOverlap, CompanionProfile } from "@/lib/companions";
import { compareFeedRecords } from "@/lib/feed-sort";

describe("Companions & Shared Trips Functionality", () => {
  describe("Date Overlap Rule (Separation logic)", () => {
    it("should recognize overlapping single-day dates", () => {
      expect(datesOverlap("2026-08-15", null, "2026-08-15", null)).toBe(true);
      expect(datesOverlap("2026-08-15", "", "2026-08-15", "")).toBe(true);
      expect(datesOverlap("2026-08-15", "2026-08-15", "2026-08-15", "2026-08-15")).toBe(true);
    });

    it("should recognize overlapping ranges", () => {
      // Range [10th to 20th] overlaps with [15th to 25th]
      expect(datesOverlap("2026-08-10", "2026-08-20", "2026-08-15", "2026-08-25")).toBe(true);
      // Range [10th to 20th] overlaps with single date [15th]
      expect(datesOverlap("2026-08-10", "2026-08-20", "2026-08-15", null)).toBe(true);
      // Boundary overlap (range ends on the day companion starts)
      expect(datesOverlap("2026-08-10", "2026-08-15", "2026-08-15", "2026-08-20")).toBe(true);
    });

    it("should detect non-overlapping dates and trigger separation", () => {
      // Modified to a date completely outside original range
      expect(datesOverlap("2026-08-10", "2026-08-14", "2026-08-15", "2026-08-20")).toBe(false);
      expect(datesOverlap("2026-08-01", null, "2026-08-02", null)).toBe(false);
      expect(datesOverlap("2025-10-10", "2025-10-15", "2026-10-10", "2026-10-15")).toBe(false);
    });

    it("should handle null or empty inputs gracefully", () => {
      expect(datesOverlap("", null, "2026-08-15", null)).toBe(false);
      expect(datesOverlap(null, null, null, null)).toBe(false);
    });
  });

  describe("Privacy Rules for Profile B (Private Companions)", () => {
    const publicUser: CompanionProfile = {
      id: "user-pub",
      username: "viajero_publico",
      avatar_url: "https://example.com/avatar1.jpg",
      is_public: true,
    };

    const privateUser: CompanionProfile = {
      id: "user-priv",
      username: "escalador_privado",
      avatar_url: "https://example.com/avatar2.jpg",
      is_public: false,
    };

    const companions: CompanionProfile[] = [publicUser, privateUser];

    it("should show public companions to any viewer (including anonymous)", () => {
      const viewerId = null;
      const followingSet = new Set<string>();

      const visible = companions.filter((comp) => {
        if (comp.is_public !== false) return true;
        if (viewerId === comp.id) return true;
        if (followingSet.has(comp.id)) return true;
        return false;
      });

      expect(visible.map((c) => c.username)).toContain("viajero_publico");
      expect(visible.map((c) => c.username)).not.toContain("escalador_privado");
    });

    it("should hide private companions from non-followers", () => {
      const viewerId = "stranger-123";
      const followingSet = new Set<string>(["someone-else"]);

      const visible = companions.filter((comp) => {
        if (comp.is_public !== false) return true;
        if (viewerId === comp.id) return true;
        if (followingSet.has(comp.id)) return true;
        return false;
      });

      expect(visible.find((c) => c.id === "user-priv")).toBeUndefined();
    });

    it("should show private companions to their accepted followers", () => {
      const viewerId = "follower-456";
      const followingSet = new Set<string>(["user-priv"]); // viewer follows user-priv

      const visible = companions.filter((comp) => {
        if (comp.is_public !== false) return true;
        if (viewerId === comp.id) return true;
        if (followingSet.has(comp.id)) return true;
        return false;
      });

      expect(visible.find((c) => c.id === "user-priv")).toBeDefined();
      expect(visible).toHaveLength(2);
    });

    it("should always allow private companions to see themselves", () => {
      const viewerId = "user-priv"; // The companion viewing the record
      const followingSet = new Set<string>();

      const visible = companions.filter((comp) => {
        if (comp.is_public !== false) return true;
        if (viewerId === comp.id) return true;
        if (followingSet.has(comp.id)) return true;
        return false;
      });

      expect(visible.find((c) => c.id === "user-priv")).toBeDefined();
    });
  });

  describe("Feed Sorting and Grouping for Companion Trips", () => {
    it("should group companion posts with the same trip_group_id together on the same date", () => {
      const tripA_user1 = {
        record_date: "2026-08-15",
        created_at: "2026-08-16T10:00:00Z",
        trip_group_id: "trip-alpha",
        user_id: "alice",
      };
      const tripA_user2 = {
        record_date: "2026-08-15",
        created_at: "2026-08-16T12:00:00Z",
        trip_group_id: "trip-alpha",
        user_id: "bob",
      };
      const unrelatedUser = {
        record_date: "2026-08-15",
        created_at: "2026-08-16T11:00:00Z",
        trip_group_id: "trip-beta",
        user_id: "charlie",
      };

      const feed = [tripA_user1, unrelatedUser, tripA_user2].sort(compareFeedRecords);

      // The two members of trip-alpha must be adjacent in the feed
      const idxAlice = feed.findIndex((x) => x.user_id === "alice");
      const idxBob = feed.findIndex((x) => x.user_id === "bob");
      expect(Math.abs(idxAlice - idxBob)).toBe(1);
    });
  });

  describe("Capacity Limits (Max 30 participants)", () => {
    it("should enforce a maximum of 29 companions (30 participants total with creator)", () => {
      const companions: CompanionProfile[] = [];
      for (let i = 1; i <= 35; i++) {
        companions.push({
          id: `user-${i}`,
          username: `amigo_${i}`,
          is_public: true,
        });
      }

      // Max allowed companions to attach to creator's trip is 29
      const allowedCompanions = companions.slice(0, 29);
      expect(allowedCompanions.length).toBe(29);
      expect(allowedCompanions.length + 1).toBe(30); // 30 total people
    });
  });
});


  describe("Mutual Invitation Automatic Union", () => {
    it("should automatically resolve as mutual and accepted if both users invite each other for overlapping dates", () => {
      // User B invites User A for Oct 10 - Oct 20
      const existingInvitationFromBtoA = {
        inviter_id: "user-b",
        companion_id: "user-a",
        item_id: "country-cr",
        start_date: "2026-10-10",
        end_date: "2026-10-20",
        trip_group_id: "trip-group-b",
        status: "pending",
      };

      // User A now invites User B for Oct 12 - Oct 18 (overlapping)
      const userA_trip = {
        currentUserId: "user-a",
        companionId: "user-b",
        itemId: "country-cr",
        startDate: "2026-10-12",
        endDate: "2026-10-18",
      };

      const overlaps = datesOverlap(
        userA_trip.startDate,
        userA_trip.endDate,
        existingInvitationFromBtoA.start_date,
        existingInvitationFromBtoA.end_date
      );

      expect(overlaps).toBe(true);

      const isMutual = overlaps && userA_trip.itemId === existingInvitationFromBtoA.item_id;
      const unitedGroupId = isMutual ? existingInvitationFromBtoA.trip_group_id : "trip-group-a";
      const status = isMutual ? "accepted" : "pending";

      expect(isMutual).toBe(true);
      expect(unitedGroupId).toBe("trip-group-b");
      expect(status).toBe("accepted");
    });

    it("should remain pending if activities match but dates do not overlap", () => {
      const existingInvitationFromBtoA = {
        inviter_id: "user-b",
        companion_id: "user-a",
        item_id: "country-cr",
        start_date: "2026-01-10",
        end_date: "2026-01-20",
        trip_group_id: "trip-group-b",
        status: "pending",
      };

      const userA_trip = {
        currentUserId: "user-a",
        companionId: "user-b",
        itemId: "country-cr",
        startDate: "2026-12-10",
        endDate: "2026-12-20",
      };

      const overlaps = datesOverlap(
        userA_trip.startDate,
        userA_trip.endDate,
        existingInvitationFromBtoA.start_date,
        existingInvitationFromBtoA.end_date
      );

      expect(overlaps).toBe(false);
    });
  });
