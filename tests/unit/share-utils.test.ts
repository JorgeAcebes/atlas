import { describe, it, expect } from "vitest";
import {
  sanitizeDateForShare,
  sanitizeTextForShare,
  buildRecordShareUrl,
  ZWNJ,
} from "@/lib/share-utils";
import { resolveRecordMetadata } from "@/lib/record-metadata";

describe("Share Utilities & WhatsApp Anti-Linkification", () => {
  describe("sanitizeDateForShare", () => {
    it("should insert ZWNJ into 4-digit years (e.g. 2026 -> 2‌0‌2‌6) to prevent WhatsApp green links", () => {
      const input = "10 oct 2026";
      const sanitized = sanitizeDateForShare(input);

      // Must break 4-digit year recognition
      expect(sanitized).toContain(`2${ZWNJ}0${ZWNJ}2${ZWNJ}6`);
      expect(/\b\d{4}\b/.test(sanitized)).toBe(false);
      expect(/\b(19|20)\d{2}\b/.test(sanitized)).toBe(false);

      // Visually identical when removing ZWNJ
      expect(sanitized.replace(new RegExp(ZWNJ, "g"), "")).toBe("10 oct 2026");
    });

    it("should sanitize multiple years in date ranges (e.g. 25 sep 2026 - 28 sep 2026)", () => {
      const range = "25 sep 2026 - 28 sep 2026";
      const sanitized = sanitizeDateForShare(range);

      expect(sanitized).toBe(`2${ZWNJ}5 s${ZWNJ}e${ZWNJ}p 2${ZWNJ}0${ZWNJ}2${ZWNJ}6 ${ZWNJ}-${ZWNJ} 2${ZWNJ}8 s${ZWNJ}e${ZWNJ}p 2${ZWNJ}0${ZWNJ}2${ZWNJ}6`);
      expect(/\b(19|20)\d{2}\b/.test(sanitized)).toBe(false);
      expect(sanitized.replace(new RegExp(ZWNJ, "g"), "")).toBe(range);
    });

    it("should insert ZWNJ into abbreviated Spanish months", () => {
      const input = "15 oct 2024";
      const sanitized = sanitizeDateForShare(input);

      expect(sanitized).toContain(ZWNJ);
      expect(sanitized).toBe(`1${ZWNJ}5 o${ZWNJ}c${ZWNJ}t 2${ZWNJ}0${ZWNJ}2${ZWNJ}4`);
      expect(sanitized.replace(new RegExp(ZWNJ, "g"), "")).toBe("15 oct 2024");
    });

    it("should prevent 26 - 17 or any sub-range from becoming a hyperlink in date ranges like '2026 - 17 sept'", () => {
      const input = "2026 - 17 sept";
      const sanitized = sanitizeDateForShare(input);

      // Must not contain plain "26 - 17" or valid digit range
      expect(sanitized).not.toContain("26 - 17");
      expect(/\b\d+\s*-\s*\d+\b/.test(sanitized)).toBe(false);
      expect(sanitized.replace(new RegExp(ZWNJ, "g"), "")).toBe("2026 - 17 sept");
    });

    it("should sanitize 'sept' (September) and prevent number-dash-number hyperlinks in full ranges", () => {
      const input = "10 sept 2026 - 17 sept 2026";
      const sanitized = sanitizeDateForShare(input);

      expect(sanitized).not.toContain("26 - 17");
      expect(sanitized).not.toContain("10 - 17");
      expect(/\b\d+\s*-\s*\d+\b/.test(sanitized)).toBe(false);
      expect(sanitized.replace(new RegExp(ZWNJ, "g"), "")).toBe(input);
    });

    it("should break Spanish date recognition across all 12 months", () => {
      const shortMonths = [
        "ene", "feb", "mar", "abr", "may", "jun",
        "jul", "ago", "sep", "oct", "nov", "dic",
      ];

      for (const m of shortMonths) {
        const rawDate = `10 ${m} 2025`;
        const sanitized = sanitizeDateForShare(rawDate);

        const standardDateRegex = /\b\d{1,2}\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\s+\d{4}\b/i;
        expect(standardDateRegex.test(rawDate)).toBe(true);
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

    it("should break numeric slashes to prevent phone or date detection in WhatsApp", () => {
      const numericDate = "15/10/2026";
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

  describe("sanitizeTextForShare", () => {
    it("should neutralize years in user notes so they don't become links", () => {
      const notes = "Viaje a los Alpes en 2026 con amigos.";
      const sanitized = sanitizeTextForShare(notes);

      expect(sanitized).toContain(`2${ZWNJ}0${ZWNJ}2${ZWNJ}6`);
      expect(/\b\d{4}\b/.test(sanitized)).toBe(false);
      expect(sanitized.replace(new RegExp(ZWNJ, "g"), "")).toBe(notes);
    });

    it("should strip http and https URLs from notes so WhatsApp link preview is not hijacked", () => {
      const notes = "Subida preciosa https://es.wikiloc.com/rutas-senderismo/mulhacen-12345 volveremos!";
      const sanitized = sanitizeTextForShare(notes);

      expect(sanitized).not.toContain("https://");
      expect(sanitized).not.toContain("wikiloc");
      expect(sanitized).toBe("Subida preciosa volveremos!");
    });

    it("should strip www URLs from notes", () => {
      const notes = "Más información en www.strava.com/activities/999 y disfrutando";
      const sanitized = sanitizeTextForShare(notes);

      expect(sanitized).not.toContain("www.strava.com");
      expect(sanitized).toBe("Más información en y disfrutando");
    });

    it("should return empty string if notes only contain a URL", () => {
      const notes = "https://es.wikiloc.com/12345";
      const sanitized = sanitizeTextForShare(notes);

      expect(sanitized).toBe("");
    });
  });

  describe("buildRecordShareUrl", () => {
    it("should construct valid URL with both ?record=, &t= and #panel=", () => {
      const url = buildRecordShareUrl({
        baseUrl: "https://atlas-log.vercel.app",
        username: "jorge",
        challenge: "peaks",
        recordId: "mulhacen",
        timestamp: 1700000000,
      });

      expect(url).toContain("https://atlas-log.vercel.app/perfil/jorge");
      expect(url).toContain("challenge=peaks");
      expect(url).toContain("record=mulhacen");
      expect(url).toContain("&t=1700000000");
      expect(url).toContain("#panel=mulhacen");
    });

    it("should encode special characters in recordId such as :: for sub-items", () => {
      const url = buildRecordShareUrl({
        baseUrl: "https://atlas-log.vercel.app",
        username: "ana",
        challenge: "experiences",
        recordId: "exp-7wonders::colosseum",
        timestamp: 1700000000,
      });

      expect(url).toContain("record=exp-7wonders%3A%3Acolosseum");
      expect(url).toContain("#panel=exp-7wonders%3A%3Acolosseum");
    });
  });

  describe("resolveRecordMetadata", () => {
    it("should resolve peak metadata even if user does not exist in DB (fallback with peak name)", async () => {
      const meta = await resolveRecordMetadata({
        username: "usuario-no-encontrado-999",
        challenge: "peaks",
        recordId: "ciudad-real",
      });

      expect(meta.title).toContain("Amor Oeste (1.375 m)");
      expect(meta.openGraph?.title).toContain("Amor Oeste (1.375 m)");
      expect(meta.openGraph?.images).toBeDefined();
    });

    it("should resolve country metadata (Finlandia) even without DB connection", async () => {
      const meta = await resolveRecordMetadata({
        username: "usuario-no-encontrado-999",
        challenge: "countries",
        recordId: "country-fi",
      });

      expect(meta.title).toContain("Finlandia");
      expect(meta.openGraph?.title).toContain("Finlandia");
    });
  });
});
