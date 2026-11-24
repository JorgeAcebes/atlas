import { describe, it, expect, afterEach } from "vitest";
import { getPhotoDisplayUrl } from "@/lib/photo-client";
import { getSanitizedR2Credentials } from "@/lib/r2-storage";

describe("getPhotoDisplayUrl - Resilient Photo and Avatar URL Resolution", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should convert r2.dev URLs to application proxy URLs when custom domain is unset", () => {
    delete process.env.NEXT_PUBLIC_R2_CUSTOM_DOMAIN;
    const r2DevUrl = "https://pub-a4abf786bc324d97a33777bd178cb9c6.r2.dev/user-123/salamanca/photo.jpg";
    expect(getPhotoDisplayUrl(r2DevUrl)).toBe("/api/photos/view/user-123/salamanca/photo.jpg");
  });

  it("should convert avatar r2.dev URLs to application proxy URLs", () => {
    delete process.env.NEXT_PUBLIC_R2_CUSTOM_DOMAIN;
    const avatarR2Url = "https://pub-a4abf786bc324d97a33777bd178cb9c6.r2.dev/952a91e9-c387-45b8-b153-5b348337fcd6/avatar_1785613160837.jfif";
    expect(getPhotoDisplayUrl(avatarR2Url)).toBe("/api/photos/view/952a91e9-c387-45b8-b153-5b348337fcd6/avatar_1785613160837.jfif");
  });

  it("should convert legacy Supabase Storage avatar URLs to application proxy URLs", () => {
    delete process.env.NEXT_PUBLIC_R2_CUSTOM_DOMAIN;
    const legacySbUrl = "https://jgwyrnvmeuxhivferaht.supabase.co/storage/v1/object/public/summit-photos/user-123/avatar_12345.jpg";
    expect(getPhotoDisplayUrl(legacySbUrl)).toBe("/api/photos/view/user-123/avatar_12345.jpg");
  });

  it("should use storage_path when r2.dev URL is supplied", () => {
    delete process.env.NEXT_PUBLIC_R2_CUSTOM_DOMAIN;
    const r2DevUrl = "https://pub-a4abf786bc324d97a33777bd178cb9c6.r2.dev/user-123/salamanca/photo.jpg";
    const storagePath = "user-123/salamanca/photo.jpg";
    expect(getPhotoDisplayUrl(r2DevUrl, storagePath)).toBe("/api/photos/view/user-123/salamanca/photo.jpg");
  });

  it("should preserve double dots in filenames when resolving URLs", () => {
    delete process.env.NEXT_PUBLIC_R2_CUSTOM_DOMAIN;
    const doubleDotPath = "user-123/country-gb/3ac2023a-Trafalgar-Square..jpg";
    expect(getPhotoDisplayUrl(null, doubleDotPath)).toBe("/api/photos/view/user-123/country-gb/3ac2023a-Trafalgar-Square..jpg");
  });

  it("should construct proxy URL when only storage_path is provided", () => {
    delete process.env.NEXT_PUBLIC_R2_CUSTOM_DOMAIN;
    const storagePath = "user-abc/toledo/pic-456.jpg";
    expect(getPhotoDisplayUrl(null, storagePath)).toBe("/api/photos/view/user-abc/toledo/pic-456.jpg");
  });

  it("should convert bare relative path to proxy URL even if url lacks leading slash", () => {
    delete process.env.NEXT_PUBLIC_R2_CUSTOM_DOMAIN;
    const barePath = "user-abc/toledo/pic-789.jpg";
    expect(getPhotoDisplayUrl(barePath)).toBe("/api/photos/view/user-abc/toledo/pic-789.jpg");
  });

  it("should preserve existing /api/photos/view/ URLs when custom domain is unset", () => {
    delete process.env.NEXT_PUBLIC_R2_CUSTOM_DOMAIN;
    const localUrl = "/api/photos/view/user-123/salamanca/photo.jpg";
    expect(getPhotoDisplayUrl(localUrl)).toBe("/api/photos/view/user-123/salamanca/photo.jpg");
  });

  it("should preserve blob: and data: preview URLs untouched", () => {
    const blobUrl = "blob:https://atlas-log.vercel.app/1234-5678";
    const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
    expect(getPhotoDisplayUrl(blobUrl)).toBe(blobUrl);
    expect(getPhotoDisplayUrl(dataUrl)).toBe(dataUrl);
  });

  it("should route photos directly through NEXT_PUBLIC_R2_CUSTOM_DOMAIN when configured", () => {
    process.env.NEXT_PUBLIC_R2_CUSTOM_DOMAIN = "https://photos.atlas.example.com/";
    expect(getPhotoDisplayUrl("/api/photos/view/user-123/salamanca/photo.jpg")).toBe(
      "https://photos.atlas.example.com/user-123/salamanca/photo.jpg"
    );
    expect(getPhotoDisplayUrl(null, "user-123/salamanca/photo.jpg")).toBe(
      "https://photos.atlas.example.com/user-123/salamanca/photo.jpg"
    );
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

describe("getSanitizedR2Credentials - Environment-only R2 configuration", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("never falls back to hardcoded secrets when env vars are missing", () => {
    delete process.env.CLOUDFLARE_R2_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    delete process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
    delete process.env.CLOUDFLARE_R2_BUCKET_NAME;
    delete process.env.CLOUDFLARE_R2_PUBLIC_URL;
    delete process.env.NEXT_PUBLIC_R2_CUSTOM_DOMAIN;

    const creds = getSanitizedR2Credentials();
    expect(creds.accountId).toBe("");
    expect(creds.accessKeyId).toBe("");
    expect(creds.secretAccessKey).toBe("");
    expect(creds.bucket).toBe("atlas-photos");
    expect(creds.publicUrl).toBe("/api/photos/view");
  });

  it("reads trimmed credentials from env vars and prefers NEXT_PUBLIC_R2_CUSTOM_DOMAIN", () => {
    process.env.CLOUDFLARE_R2_ACCOUNT_ID = "  acc-env-1  ";
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = "  key-env-1  ";
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = "  secret-env-1  ";
    process.env.CLOUDFLARE_R2_BUCKET_NAME = "  atlas-photos  ";
    process.env.NEXT_PUBLIC_R2_CUSTOM_DOMAIN = "https://cdn.atlas.example.com/";

    const creds = getSanitizedR2Credentials();
    expect(creds.accountId).toBe("acc-env-1");
    expect(creds.accessKeyId).toBe("key-env-1");
    expect(creds.secretAccessKey).toBe("secret-env-1");
    expect(creds.bucket).toBe("atlas-photos");
    expect(creds.publicUrl).toBe("https://cdn.atlas.example.com");
  });
});
