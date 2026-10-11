import { describe, it, expect, beforeEach } from "vitest";
import { createMockSupabaseClient, MockSupabaseClient } from "@/tests/mocks/supabase-mock";
import { peaks } from "@/data/peaks";
import { countries } from "@/data/countries";

describe("Modality Preferences & Filtering Logic", () => {
  let mockSupabase: MockSupabaseClient;

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient();
  });

  describe("Profile Modalities Storage & Persistence", () => {
    it("should allow disabling peaks mode while keeping countries mode active", async () => {
      const userId = "user-peaks-disabled";
      await mockSupabase.from("profiles").insert({
        id: userId,
        username: "viajero_puro",
        enable_peaks: true,
        enable_countries: true,
      });

      // Disable peaks
      await mockSupabase
        .from("profiles")
        .update({ enable_peaks: false, enable_countries: true })
        .eq("id", userId);

      const res = await mockSupabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      expect(res.error).toBeNull();
      expect(res.data.enable_peaks).toBe(false);
      expect(res.data.enable_countries).toBe(true);
    });

    it("should preserve user ascents in database even when peaks mode is deactivated", async () => {
      const userId = "user-preservation-check";
      await mockSupabase.from("profiles").insert({
        id: userId,
        username: "alpinista_historico",
        enable_peaks: true,
        enable_countries: true,
      });

      // Seed peak ascents
      await mockSupabase.from("ascents").insert([
        { id: "asc-1", user_id: userId, summit_id: "teide", achieved_on: "2024-05-10" },
        { id: "asc-2", user_id: userId, summit_id: "mulhacen", achieved_on: "2024-06-15" },
        { id: "asc-3", user_id: userId, summit_id: "country-fr", achieved_on: "2025-01-20" },
      ]);

      // User deactivates peaks mode
      await mockSupabase
        .from("profiles")
        .update({ enable_peaks: false })
        .eq("id", userId);

      // Verify ascents table still has all records intact (no data loss)
      const ascentsRes = await mockSupabase
        .from("ascents")
        .select("*")
        .eq("user_id", userId);

      expect(ascentsRes.data).toHaveLength(3);
      expect(ascentsRes.data.map((a: any) => a.summit_id)).toContain("teide");
      expect(ascentsRes.data.map((a: any) => a.summit_id)).toContain("mulhacen");
      expect(ascentsRes.data.map((a: any) => a.summit_id)).toContain("country-fr");
    });
  });

  describe("Feed Modality Filtering", () => {
    const sampleFeedItems = [
      { id: "1", type: "ascent", summit_id: "santa-cruz-tenerife" },
      { id: "2", type: "ascent", summit_id: "gorbea" },
      { id: "3", type: "ascent", summit_id: "country-fr" },
      { id: "4", type: "ascent", summit_id: "country-es" },
      { id: "5", type: "experience", experience_id: "camino-de-santiago" },
    ];

    function filterFeed(items: any[], enablePeaks: boolean, enableCountries: boolean) {
      return items.filter((item) => {
        if (item.type === "ascent") {
          const summitIdLower = (item.summit_id || "").toLowerCase();
          const isPeak = peaks.some((p) => p.id === summitIdLower);
          const isCountry =
            countries.some((c) => c.id === summitIdLower) ||
            summitIdLower.startsWith("country-");
          if (!enablePeaks && isPeak) return false;
          if (!enableCountries && isCountry) return false;
        }
        return true;
      });
    }

    it("should filter out all peaks items when enablePeaks is false", () => {
      const filtered = filterFeed(sampleFeedItems, false, true);
      expect(filtered.find((i) => i.summit_id === "santa-cruz-tenerife")).toBeUndefined();
      expect(filtered.find((i) => i.summit_id === "gorbea")).toBeUndefined();
      expect(filtered.find((i) => i.summit_id === "country-fr")).toBeDefined();
      expect(filtered.find((i) => i.experience_id === "camino-de-santiago")).toBeDefined();
      expect(filtered).toHaveLength(3);
    });

    it("should filter out all country items when enableCountries is false", () => {
      const filtered = filterFeed(sampleFeedItems, true, false);
      expect(filtered.find((i) => i.summit_id === "santa-cruz-tenerife")).toBeDefined();
      expect(filtered.find((i) => i.summit_id === "gorbea")).toBeDefined();
      expect(filtered.find((i) => i.summit_id === "country-fr")).toBeUndefined();
      expect(filtered.find((i) => i.summit_id === "country-es")).toBeUndefined();
      expect(filtered.find((i) => i.experience_id === "camino-de-santiago")).toBeDefined();
      expect(filtered).toHaveLength(3);
    });

    it("should retain all items when both modalities are enabled", () => {
      const filtered = filterFeed(sampleFeedItems, true, true);
      expect(filtered).toHaveLength(5);
    });

    describe("Feed visibleFeedItems mode filtering (Peaks vs Countries vs Experiences)", () => {
      function filterVisibleFeed(
        items: any[],
        mode: "countries" | "peaks",
        experiencesMode: boolean,
        enablePeaks = true,
        enableCountries = true,
        enableExperiences = true
      ) {
        return items.filter((item) => {
          if (item.type === "error") return true;

          const summitIdLower = (item.summit_id || "").toLowerCase();
          const isPeak = item.type === "ascent" && peaks.some((p) => p.id === summitIdLower);
          const isCountry =
            item.type === "ascent" &&
            (countries.some((c) => c.id === summitIdLower) || summitIdLower.startsWith("country-"));
          const isExperience =
            item.type === "experience" ||
            (item.type === "ascent" && (summitIdLower.startsWith("exp-") || summitIdLower.startsWith("custom-")));

          if (item.type === "ascent") {
            if (!enablePeaks && isPeak) return false;
            if (!enableCountries && isCountry) return false;
          }
          if (!enableExperiences && isExperience) return false;

          if (mode === "peaks") {
            return isPeak;
          } else {
            // mode === "countries"
            if (isPeak) return false;
            if (experiencesMode && enableExperiences) {
              return isExperience;
            }
            return isCountry;
          }
        });
      }

      it("should show ONLY experiences (and no countries or peaks) when in experiencesMode in social", () => {
        const result = filterVisibleFeed(sampleFeedItems, "countries", true);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("5");
        expect(result[0].type).toBe("experience");
        expect(result.some((i) => i.summit_id?.startsWith("country-"))).toBe(false);
        expect(result.some((i) => i.summit_id === "gorbea" || i.summit_id === "santa-cruz-tenerife")).toBe(false);
      });

      it("should show ONLY countries (and no experiences or peaks) when experiencesMode is false", () => {
        const result = filterVisibleFeed(sampleFeedItems, "countries", false);
        expect(result).toHaveLength(2);
        expect(result.map((i) => i.summit_id)).toEqual(["country-fr", "country-es"]);
        expect(result.some((i) => i.type === "experience")).toBe(false);
      });

      it("should show ONLY peaks when mode is peaks", () => {
        const result = filterVisibleFeed(sampleFeedItems, "peaks", false);
        expect(result).toHaveLength(2);
        expect(result.map((i) => i.summit_id)).toEqual(["santa-cruz-tenerife", "gorbea"]);
        expect(result.some((i) => i.summit_id?.startsWith("country-"))).toBe(false);
        expect(result.some((i) => i.type === "experience")).toBe(false);
      });
    });
  });

  describe("Aesthetic & UI Contract Rules", () => {
    it("should require at least one active modality and prevent turning off both", () => {
      let enablePeaks = true;
      let enableCountries = true;
      let errorMessage = "";

      const togglePeaks = (checked: boolean) => {
        if (!checked && !enableCountries) {
          errorMessage = "Debes mantener activa al menos una modalidad (Picos o Países).";
          return;
        }
        errorMessage = "";
        enablePeaks = checked;
      };

      const toggleCountries = (checked: boolean) => {
        if (!checked && !enablePeaks) {
          errorMessage = "Debes mantener activa al menos una modalidad (Picos o Países).";
          return;
        }
        errorMessage = "";
        enableCountries = checked;
      };

      // Disabling peaks when countries is active should succeed
      togglePeaks(false);
      expect(enablePeaks).toBe(false);
      expect(errorMessage).toBe("");

      // Disabling countries when peaks is already false should fail
      toggleCountries(false);
      expect(enableCountries).toBe(true);
      expect(errorMessage).toContain("Debes mantener activa al menos una modalidad");
    });

    it("should freeze experiences when countries mode is toggled off", () => {
      let enableCountries = true;
      let enableExperiences = true;

      const handleToggleCountries = (checked: boolean) => {
        enableCountries = checked;
        if (!checked) {
          enableExperiences = false;
        }
      };

      // Disabling countries mode
      handleToggleCountries(false);
      expect(enableCountries).toBe(false);
      expect(enableExperiences).toBe(false);

      // Verify payload serialization enforces hierarchy
      const updates = {
        enable_countries: enableCountries,
        enable_experiences: enableCountries ? enableExperiences : false,
      };

      expect(updates.enable_countries).toBe(false);
      expect(updates.enable_experiences).toBe(false);
    });
  });
});
