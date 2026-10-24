import { describe, it, expect } from "vitest";
import {
  sanitizeDateForShare,
  buildRecordShareUrl,
  ZWNJ,
} from "@/lib/share-utils";
import { resolveRecordMetadata } from "@/lib/record-metadata";

describe("Share Utilities & WhatsApp Anti-Linkification", () => {
  describe("sanitizeDateForShare", () => {
    it("should insert ZWNJ into abbreviated Spanish months", () => {
      const input = "15 oct 2024";
      const sanitized = sanitizeDateForShare(input);

      // Must contain ZWNJ character
      expect(sanitized).toContain(ZWNJ);
      expect(sanitized).toBe(`15 o${ZWNJ}ct 2024`);

      // Visually clean when removing zero-width characters
      expect(sanitized.replace(new RegExp(ZWNJ, "g"), "")).toBe("15 oct 2024");
    });

    it("should break Spanish date recognition across all 12 months", () => {
      const shortMonths = [
        "ene", "feb", "mar", "abr", "may", "jun",
        "jul", "ago", "sep", "oct", "nov", "dic",
      ];

      for (const m of shortMonths) {
        const rawDate = `10 ${m} 2025`;
        const sanitized = sanitizeDateForShare(rawDate);

        // Raw date matches standard date regex
        const standardDateRegex = /\b\d{1,2}\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\s+\d{4}\b/i;
        expect(standardDateRegex.test(rawDate)).toBe(true);

        // Sanitized date MUST NOT match the standard date regex
        expect(standardDateRegex.test(sanitized)).toBe(false);
      }
    });

    it("should break full Spanish month names from Apple Calendar detectors", () => {
      const fullMonths = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
      ];

      for (const m of fullMonths) {
        const rawDate = `15 de ${m} de 2024`;
        const sanitized = sanitizeDateForShare(rawDate);

        const standardFullRegex = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i;
        expect(standardFullRegex.test(rawDate)).toBe(true);
        expect(standardFullRegex.test(sanitized)).toBe(false);
      }
    });

    it("should sanitize date ranges without altering readability", () => {
      const range = "12 may 2024 - 18 may 2024";
      const sanitized = sanitizeDateForShare(range);

      expect(sanitized).toBe(`12 m${ZWNJ}ay 2024 - 18 m${ZWNJ}ay 2024`);
      expect(sanitized.replace(new RegExp(ZWNJ, "g"), "")).toBe(range);
    });

    it("should break numeric slashes to prevent phone or date detection in WhatsApp", () => {
      const numericDate = "15/10/2024";
      const sanitized = sanitizeDateForShare(numericDate);

      expect(sanitized).toContain(ZWNJ);
      expect(sanitized.replace(new RegExp(ZWNJ, "g"), "")).toBe(numericDate);
    });

    it("should gracefully handle empty or null values", () => {
      expect(sanitizeDateForShare("")).toBe("");
      expect(sanitizeDateForShare(null)).toBe("");
      expect(sanitizeDateForShare(undefined)).toBe("");
    });
  });

  describe("buildRecordShareUrl", () => {
    it("should construct valid URL with both ?record= and #panel=", () => {
      const url = buildRecordShareUrl({
        baseUrl: "https://atlas-log.vercel.app",
        username: "jorge",
        challenge: "peaks",
        recordId: "mulhacen",
      });

      expect(url).toContain("https://atlas-log.vercel.app/perfil/jorge");
      expect(url).toContain("challenge=peaks");
      expect(url).toContain("record=mulhacen");
      expect(url).toContain("#panel=mulhacen");
    });

    it("should encode special characters in recordId such as :: for sub-items", () => {
      const url = buildRecordShareUrl({
        baseUrl: "https://atlas-log.vercel.app",
        username: "ana",
        challenge: "experiences",
        recordId: "exp-7wonders::colosseum",
      });

      expect(url).toContain("record=exp-7wonders%3A%3Acolosseum");
      expect(url).toContain("#panel=exp-7wonders%3A%3Acolosseum");
    });
  });

  describe("resolveRecordMetadata", () => {
    it("should return fallback metadata for unknown users without crashing", async () => {
      const meta = await resolveRecordMetadata({
        username: "usuario-fantasma-inexistente-12345",
        challenge: "peaks",
        recordId: "mulhacen",
      });

      expect(meta.title).toBe("Atlas");
      expect(meta.openGraph?.images).toBeDefined();
    });
  });
});
