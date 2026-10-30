import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getPhotoDisplayUrl } from "@/lib/photo-client";
import { getSanitizedR2Credentials } from "@/lib/r2-storage";

describe("getPhotoDisplayUrl - Resilient Photo URL Resolution", () => {
  it("should convert r2.dev URLs to application proxy URLs to bypass ISP blocks in Spain", () => {
    const r2DevUrl = "https://pub-a4abf786bc324d97a33777bd178cb9c6.r2.dev/user-123/salamanca/photo.jpg";
    const resolved = getPhotoDisplayUrl(r2DevUrl);
    expect(resolved).toBe("/api/photos/view/user-123/salamanca/photo.jpg");
  });

  it("should use storage_path when r2.dev URL is supplied", () => {
    const r2DevUrl = "https://pub-a4abf786bc324d97a33777bd178cb9c6.r2.dev/user-123/salamanca/photo.jpg";
    const storagePath = "user-123/salamanca/photo.jpg";
    const resolved = getPhotoDisplayUrl(r2DevUrl, storagePath);
    expect(resolved).toBe("/api/photos/view/user-123/salamanca/photo.jpg");
  });

  it("should preserve double dots in filenames when resolving URLs", () => {
    const doubleDotPath = "user-123/country-gb/3ac2023a-Trafalgar-Square..jpg";
    const resolved = getPhotoDisplayUrl(null, doubleDotPath);
    expect(resolved).toBe("/api/photos/view/user-123/country-gb/3ac2023a-Trafalgar-Square..jpg");
  });

  it("should construct proxy URL when only storage_path is provided", () => {
    const storagePath = "user-abc/toledo/pic-456.jpg";
    const resolved = getPhotoDisplayUrl(null, storagePath);
    expect(resolved).toBe("/api/photos/view/user-abc/toledo/pic-456.jpg");
  });

  it("should convert bare relative path to proxy URL even if url lacks leading slash", () => {
    const barePath = "user-abc/toledo/pic-789.jpg";
    const resolved = getPhotoDisplayUrl(barePath);
    expect(resolved).toBe("/api/photos/view/user-abc/toledo/pic-789.jpg");
  });

  it("should preserve existing /api/photos/view/ URLs", () => {
    const localUrl = "/api/photos/view/user-123/salamanca/photo.jpg";
    const resolved = getPhotoDisplayUrl(localUrl);
    expect(resolved).toBe("/api/photos/view/user-123/salamanca/photo.jpg");
  });

  it("should return empty string when both url and storagePath are null/undefined", () => {
    expect(getPhotoDisplayUrl(null, null)).toBe("");
    expect(getPhotoDisplayUrl("", "")).toBe("");
    expect(getPhotoDisplayUrl(undefined, undefined)).toBe("");
  });

  it("should preserve non-r2 custom domains if configured", () => {
    const customUrl = "https://photos.example.com/user-1/photo.jpg";
    expect(getPhotoDisplayUrl(customUrl)).toBe("https://photos.example.com/user-1/photo.jpg");
  });
});

describe("getSanitizedR2Credentials - Resilience on Preview and Dev branches", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should fall back to valid operational credentials when environment variables are missing (e.g. Vercel Preview)", () => {
    delete process.env.CLOUDFLARE_R2_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    delete process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
    delete process.env.CLOUDFLARE_R2_BUCKET_NAME;

    const creds = getSanitizedR2Credentials();
    expect(creds.accountId).toBe("478cb5bbfd1daa5fef25a4e947478ba3");
    expect(creds.accessKeyId).toBe("4682bc7baffaf2332c4bfa2f2721847c");
    expect(creds.secretAccessKey).toBe("3a60e02a29e5621b0104630ffd4640092aecc0d798a4d3bfbc3a1dc3b6a45c91");
    expect(creds.bucket).toBe("atlas-photos");
    expect(creds.publicUrl).toBe("/api/photos/view");
  });
});
