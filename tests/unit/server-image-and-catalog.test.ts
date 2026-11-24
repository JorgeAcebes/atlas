import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  ImageValidationError,
  MAX_PHOTO_UPLOAD_BYTES,
  parseBase64Image,
  validateAndOptimizeImageBuffer,
} from "@/lib/server-image";
import {
  resolveTargetItem,
  searchCountries,
  searchExperiences,
  searchPeaks,
} from "@/lib/atlas-service";

describe("Server Image Validation/Optimization & Atlas Catalog Service", () => {
  describe("parseBase64Image & validateAndOptimizeImageBuffer", () => {
    it("parses raw base64 and data URL strings while rejecting malformed inputs", () => {
      const rawBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const b64 = rawBytes.toString("base64");

      const parsedRaw = parseBase64Image(b64);
      expect(parsedRaw?.buffer.equals(rawBytes)).toBe(true);

      const parsedDataUrl = parseBase64Image(`data:image/png;base64,${b64}`);
      expect(parsedDataUrl?.declaredMime).toBe("image/png");
      expect(parsedDataUrl?.buffer.equals(rawBytes)).toBe(true);

      expect(parseBase64Image("")).toBeNull();
      expect(parseBase64Image("not!valid@base64")).toBeNull();
      expect(parseBase64Image("data:text/plain,hello")).toBeNull();
    });

    it("resizes >1600px images and optimizes to WebP using Sharp", async () => {
      const hugePng = await sharp({
        create: {
          width: 2400,
          height: 1800,
          channels: 3,
          background: { r: 36, g: 95, b: 82 },
        },
      })
        .png()
        .toBuffer();

      const result = await validateAndOptimizeImageBuffer(hugePng, "my photo/raw.PNG");
      expect(result.optimized).toBe(true);
      expect(result.contentType).toBe("image/webp");
      expect(result.width).toBe(1600);
      expect(result.height).toBe(1200);
      expect(result.cleanFileName.endsWith(".webp")).toBe(true);
      expect(result.fileSize).toBeLessThan(hugePng.length);
    });

    it("rejects SVG, HTML, empty buffers, and >15 MB payloads", async () => {
      await expect(
        validateAndOptimizeImageBuffer(Buffer.alloc(0), "empty.png")
      ).rejects.toThrowError(ImageValidationError);

      await expect(
        validateAndOptimizeImageBuffer(
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
          "xss.svg"
        )
      ).rejects.toThrowError(ImageValidationError);

      await expect(
        validateAndOptimizeImageBuffer(
          Buffer.from("<html><body>hello</body></html>"),
          "page.jpg"
        )
      ).rejects.toThrowError(ImageValidationError);

      const oversized = Buffer.alloc(MAX_PHOTO_UPLOAD_BYTES + 10);
      oversized[0] = 0xff;
      oversized[1] = 0xd8;
      oversized[2] = 0xff;
      await expect(
        validateAndOptimizeImageBuffer(oversized, "huge.jpg")
      ).rejects.toThrowError(ImageValidationError);
    });
  });

  describe("Catalog Search & Target Resolution", () => {
    it("searches 196 world countries diacritic-insensitively", () => {
      const all = searchCountries({ limit: 250 });
      expect(all.total_countries).toBe(196);
      expect(all.count).toBe(196);

      const japan = searchCountries({ q: "japon" });
      expect(japan.items.some((c) => c.id === "country-jp")).toBe(true);
    });

    it("returns 47 unique physical peaks (combining shared provinces like Gorbea)", () => {
      const all = searchPeaks({ limit: 100 });
      expect(all.total_physical_peaks).toBe(47);
      expect(all.total_demarcations).toBe(52);
      expect(all.count).toBe(47);

      const gorbea = all.items.find((p) => p.id === "gorbea");
      expect(gorbea?.shared).toBe(true);
      expect(gorbea?.provinces).toEqual(["Álava", "Vizcaya"]);

      const byAccentFree = searchPeaks({ q: "penalara" });
      expect(byAccentFree.items.some((p) => p.id === "penalara")).toBe(true);
    });

    it("searches experiences and resolves country, peak, and experience::sub_item targets", async () => {
      const expSearch = await searchExperiences({ q: "aurora" });
      expect(expSearch.items.some((e) => e.id === "exp-aurora")).toBe(true);

      const countryTarget = await resolveTargetItem({ summit_id: "country-jp" });
      expect(countryTarget.itemType).toBe("country");
      expect(countryTarget.expectedSummitId).toBe("country-jp");

      const peakTarget = await resolveTargetItem({ summit_id: "granada" });
      expect(peakTarget.itemType).toBe("peak");

      const subTarget = await resolveTargetItem({
        summit_id: "exp-big-five-land::lion",
      });
      expect(subTarget.itemType).toBe("experience");
      expect(subTarget.baseId).toBe("exp-big-five-land");
      expect(subTarget.subItemId).toBe("lion");
      expect(subTarget.expectedSummitId).toBe("exp-big-five-land::lion");

      await expect(
        resolveTargetItem({ summit_id: "does-not-exist" })
      ).rejects.toThrowError(/No se reconoce el summit_id/);
    });
  });
});
