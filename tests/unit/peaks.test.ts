import { describe, it, expect } from "vitest";
import { peaks } from "@/data/peaks";

describe("Peaks Dataset Integrity (52 techos provinciales)", () => {
  it("should contain exactly 52 territorial high points (50 provinces + Ceuta + Melilla)", () => {
    expect(peaks).toHaveLength(52);
  });

  it("should have codes spanning from '01' to '52'", () => {
    const codes = peaks.map((p) => p.code).sort();
    const expectedCodes = Array.from({ length: 52 }, (_, i) => String(i + 1).padStart(2, "0"));
    expect(codes).toEqual(expectedCodes);
  });

  it("should contain exactly 47 unique physical peaks due to 5 shared summits", () => {
    const uniqueIds = new Set(peaks.map((p) => p.id));
    expect(uniqueIds.size).toBe(47);
  });

  it("should properly identify the 5 known shared summits across provincial boundaries", () => {
    const sharedIds = ["gorbea", "cerredo", "penalara", "trevinca", "moncayo"];
    for (const id of sharedIds) {
      const occurrences = peaks.filter((p) => p.id === id);
      expect(occurrences).toHaveLength(2);

      // Coordinates and altitude must match across both provincial entries
      expect(occurrences[0].altitude).toBe(occurrences[1].altitude);
      expect(occurrences[0].coordinates[0]).toBeCloseTo(occurrences[1].coordinates[0], 2);
      expect(occurrences[0].coordinates[1]).toBeCloseTo(occurrences[1].coordinates[1], 2);
    }
  });

  it("should validate that every peak has valid non-empty metadata", () => {
    for (const peak of peaks) {
      expect(peak.id).toBeTruthy();
      expect(peak.name).toBeTruthy();
      expect(peak.province).toBeTruthy();
      expect(peak.range).toBeTruthy();
      expect(peak.altitude).toBeGreaterThan(0);
      expect(peak.coordinates).toHaveLength(2);
      expect(typeof peak.coordinates[0]).toBe("number");
      expect(typeof peak.coordinates[1]).toBe("number");
    }
  });

  it("should validate geographic coordinates fall within Spain's territorial boundaries", () => {
    for (const peak of peaks) {
      const [lat, lng] = peak.coordinates;
      // Latitude between 27.5 (Canary Islands) and 44.0 (Northern Spain / Pyrenees)
      expect(lat).toBeGreaterThanOrEqual(27.0);
      expect(lat).toBeLessThanOrEqual(44.0);

      // Longitude between -19.0 (El Hierro/Canaries) and 5.0 (Balearic Islands)
      expect(lng).toBeGreaterThanOrEqual(-19.0);
      expect(lng).toBeLessThanOrEqual(5.0);
    }
  });

  it("should have correct summit coordinates for Cantabria (Torre Blanca)", () => {
    const cantabriaPeak = peaks.find((p) => p.id === "cantabria");
    expect(cantabriaPeak).toBeDefined();
    expect(cantabriaPeak?.name).toBe("Torre Blanca");
    expect(cantabriaPeak?.coordinates[0]).toBeCloseTo(43.1727, 3);
    expect(cantabriaPeak?.coordinates[1]).toBeCloseTo(-4.8516, 3);
  });

  it("should have correct summit coordinates for Murcia (Pico Obispo)", () => {
    const murciaPeak = peaks.find((p) => p.id === "murcia");
    expect(murciaPeak).toBeDefined();
    expect(murciaPeak?.name).toBe("Pico Obispo");
    expect(murciaPeak?.coordinates[0]).toBeCloseTo(38.0636, 3);
    expect(murciaPeak?.coordinates[1]).toBeCloseTo(-2.2652, 3);
  });

  it("should have correct summit coordinates for Albacete (Pico de La Atalaya / Las Cabras)", () => {
    const albacetePeak = peaks.find((p) => p.id === "albacete");
    expect(albacetePeak).toBeDefined();
    expect(albacetePeak?.name).toContain("La Atalaya");
    expect(albacetePeak?.coordinates[0]).toBeCloseTo(38.0606, 3);
    expect(albacetePeak?.coordinates[1]).toBeCloseTo(-2.3914, 3);
  });

  it("should have correct summit coordinates for Cáceres (Calvitero / El Torreón)", () => {
    const caceresPeak = peaks.find((p) => p.id === "caceres");
    expect(caceresPeak).toBeDefined();
    expect(caceresPeak?.name).toContain("Calvitero");
    expect(caceresPeak?.coordinates[0]).toBeCloseTo(40.2918, 3);
    expect(caceresPeak?.coordinates[1]).toBeCloseTo(-5.7390, 3);
  });

  it("should have correct summit coordinates for Salamanca (Canchal de la Ceja, not inside Ávila)", () => {
    const salamancaPeak = peaks.find((p) => p.id === "salamanca");
    expect(salamancaPeak).toBeDefined();
    expect(salamancaPeak?.name).toBe("Canchal de la Ceja");
    expect(salamancaPeak?.coordinates[0]).toBeCloseTo(40.3045, 3);
    expect(salamancaPeak?.coordinates[1]).toBeCloseTo(-5.7295, 3);
  });
});

