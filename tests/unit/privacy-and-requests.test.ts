import { describe, it, expect } from "vitest";
import { createMockSupabaseClient } from "../mocks/supabase-mock";

describe("Privacy Model and Follow Requests Integration", () => {
  it("should return summit_id list without exposing dates, notes or photos via get_user_completed_summits", async () => {
    const supabase = createMockSupabaseClient();
    const privateUserId = "user-private-123";

    supabase.seedTable("ascents", [
      {
        id: "asc-1",
        user_id: privateUserId,
        summit_id: "country-fr",
        achieved_on: "2024-05-15",
        notes: "Viaje secreto a París con detalles íntimos",
        is_wishlist: false,
      },
      {
        id: "asc-2",
        user_id: privateUserId,
        summit_id: "country-jp",
        achieved_on: "2023-11-20",
        notes: "Viaje a Tokio",
        is_wishlist: false,
      },
      {
        id: "asc-3",
        user_id: privateUserId,
        summit_id: "country-us",
        achieved_on: "2025-01-01",
        notes: "Deseo futuro",
        is_wishlist: true,
      },
    ]);

    const { data, error } = await supabase.rpc("get_user_completed_summits", {
      p_user_id: privateUserId,
    });

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.length).toBe(2);
    expect(data).toEqual([
      { summit_id: "country-fr" },
      { summit_id: "country-jp" },
    ]);

    // Ensure no sensitive fields are present in the returned objects
    for (const item of data) {
      expect((item as any).achieved_on).toBeUndefined();
      expect((item as any).notes).toBeUndefined();
      expect((item as any).photos).toBeUndefined();
    }
  });

  it("should include private profiles in get_user_ranking when they have ascents_count > 0", async () => {
    const supabase = createMockSupabaseClient();

    supabase.seedTable("profiles", [
      { id: "pub-1", username: "explorador_publico", is_public: true, is_test: false },
      { id: "priv-1", username: "escalador_privado", is_public: false, is_test: false },
      { id: "ghost-1", username: "sin_registros", is_public: false, is_test: false },
    ]);

    supabase.seedTable("ascents", [
      { user_id: "pub-1", summit_id: "country-es", is_wishlist: false },
      { user_id: "pub-1", summit_id: "country-pt", is_wishlist: false },
      { user_id: "priv-1", summit_id: "country-it", is_wishlist: false },
    ]);

    const { data: ranking } = await supabase.rpc("get_user_ranking", { p_mode: "countries" });

    expect(ranking).toBeDefined();
    // Both pub-1 (2) and priv-1 (1) should appear. ghost-1 (0) must NOT appear.
    expect(ranking.map((r: any) => r.username)).toContain("explorador_publico");
    expect(ranking.map((r: any) => r.username)).toContain("escalador_privado");
    expect(ranking.map((r: any) => r.username)).not.toContain("sin_registros");

    const privateEntry = (ranking as any[])?.find((r: any) => r.username === "escalador_privado");
    expect(privateEntry?.ascents_count).toBe(1);
  });

  it("should map synthetic ascents with date 1900-01-01 to Fecha desconocida", () => {
    function formatDate(date: string) {
      if (date === "1900-01-01") return "Fecha desconocida";
      return new Intl.DateTimeFormat("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(date + "T00:00:00"));
    }

    expect(formatDate("1900-01-01")).toBe("Fecha desconocida");
    expect(formatDate("2024-05-15")).toContain("2024");
  });

  it("should accurately partition followers into pending and accepted groups", () => {
    const followers = [
      { id: "f1", username: "usuario_pendiente" },
      { id: "f2", username: "amigo_aceptado" },
      { id: "f3", username: "otro_aceptado" },
    ];

    const followerStatuses: Record<string, "pending" | "accepted" | null> = {
      f1: "pending",
      f2: "accepted",
      f3: "accepted",
    };

    const acceptedFollowers = followers.filter((p) => followerStatuses[p.id] === "accepted");
    const pendingFollowers = followers.filter((p) => followerStatuses[p.id] === "pending");

    expect(acceptedFollowers.length).toBe(2);
    expect(acceptedFollowers.map((p) => p.username)).toEqual(["amigo_aceptado", "otro_aceptado"]);
    expect(pendingFollowers.length).toBe(1);
    expect(pendingFollowers[0].username).toBe("usuario_pendiente");
  });
});
