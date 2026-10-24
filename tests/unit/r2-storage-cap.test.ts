import { describe, it, expect } from "vitest";
import {
  DEFAULT_MAX_STORAGE_BYTES,
  getMaxStorageBytes,
  checkStorageLimit,
  isR2Configured,
  uploadR2Object,
} from "@/lib/r2-storage";

describe("Cloudflare R2 & 9.5 GB Strict Storage Cap Verification", () => {
  it("should have DEFAULT_MAX_STORAGE_BYTES configured to exactly 9.5 GiB", () => {
    // 9.5 GiB = 9.5 * 1024^3 bytes = 10,200,547,328 bytes
    expect(DEFAULT_MAX_STORAGE_BYTES).toBe(9.5 * 1024 * 1024 * 1024);
    expect(DEFAULT_MAX_STORAGE_BYTES).toBe(10200547328);
  });

  it("getMaxStorageBytes should return DEFAULT_MAX_STORAGE_BYTES unless overridden", () => {
    const originalEnv = process.env.MAX_STORAGE_BYTES;
    delete process.env.MAX_STORAGE_BYTES;

    expect(getMaxStorageBytes()).toBe(DEFAULT_MAX_STORAGE_BYTES);

    process.env.MAX_STORAGE_BYTES = "5000000";
    expect(getMaxStorageBytes()).toBe(5000000);

    // Restore
    if (originalEnv) process.env.MAX_STORAGE_BYTES = originalEnv;
    else delete process.env.MAX_STORAGE_BYTES;
  });

  it("checkStorageLimit should ALLOW uploads when total projected bytes < 9.5 GB", async () => {
    // Mock Supabase admin returning 2 GB used
    const twoGB = 2 * 1024 * 1024 * 1024;
    const mockSupabaseAdmin = {
      rpc: async () => ({ data: twoGB, error: null }),
    };

    const oneMB = 1024 * 1024;
    const result = await checkStorageLimit(oneMB, mockSupabaseAdmin);

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("OK");
    expect(result.currentBytes).toBe(twoGB);
    expect(result.remainingBytes).toBe(DEFAULT_MAX_STORAGE_BYTES - (twoGB + oneMB));
  });

  it("checkStorageLimit should STRICTLY BLOCK uploads when total projected bytes > 9.5 GB", async () => {
    // Mock Supabase admin returning 9.49 GB used
    const nearLimitBytes = 9.49 * 1024 * 1024 * 1024;
    const mockSupabaseAdmin = {
      rpc: async () => ({ data: nearLimitBytes, error: null }),
    };

    // Attempting to upload 50 MB would exceed 9.5 GB
    const fiftyMB = 50 * 1024 * 1024;
    const result = await checkStorageLimit(fiftyMB, mockSupabaseAdmin);

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("STORAGE_LIMIT_EXCEEDED");
    expect(result.currentBytes).toBe(nearLimitBytes);
    expect(result.remainingBytes).toBe(0);
  });

  it("checkStorageLimit should fallback to summing photo rows when rpc is unavailable", async () => {
    const mockSupabaseAdmin = {
      rpc: async () => ({ data: null, error: { message: "function not found" } }),
      from: () => ({
        select: async () => ({
          data: [
            { file_size: 500000 },
            { file_size: 300000 },
            { file_size: null }, // legacy row: defaults to 200 KB
          ],
          error: null,
        }),
      }),
    };

    const result = await checkStorageLimit(100000, mockSupabaseAdmin);

    expect(result.allowed).toBe(true);
    // 500,000 + 300,000 + 204,800 = 1,004,800 bytes
    expect(result.currentBytes).toBe(500000 + 300000 + 200 * 1024);
  });

  it("isR2Configured should report false when env vars are missing and true when all present", () => {
    const originalVars = {
      account: process.env.CLOUDFLARE_R2_ACCOUNT_ID,
      key: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
      secret: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
      bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
      url: process.env.CLOUDFLARE_R2_PUBLIC_URL,
    };

    // Remove one
    delete process.env.CLOUDFLARE_R2_ACCOUNT_ID;
    expect(isR2Configured()).toBe(false);

    // Provide all
    process.env.CLOUDFLARE_R2_ACCOUNT_ID = "acc-123";
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = "key-123";
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = "sec-123";
    process.env.CLOUDFLARE_R2_BUCKET_NAME = "bucket-123";
    process.env.CLOUDFLARE_R2_PUBLIC_URL = "https://photos.example.com";

    expect(isR2Configured()).toBe(true);

    // Restore
    if (originalVars.account) process.env.CLOUDFLARE_R2_ACCOUNT_ID = originalVars.account;
    else delete process.env.CLOUDFLARE_R2_ACCOUNT_ID;
    if (originalVars.key) process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = originalVars.key;
    else delete process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    if (originalVars.secret) process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = originalVars.secret;
    else delete process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
    if (originalVars.bucket) process.env.CLOUDFLARE_R2_BUCKET_NAME = originalVars.bucket;
    else delete process.env.CLOUDFLARE_R2_BUCKET_NAME;
    if (originalVars.url) process.env.CLOUDFLARE_R2_PUBLIC_URL = originalVars.url;
    else delete process.env.CLOUDFLARE_R2_PUBLIC_URL;
  });

  it("uploadR2Object function should be defined and exported", () => {
    expect(typeof uploadR2Object).toBe("function");
  });

  it("should have removed artificial 5MB pre-compression limits in summit-tracker.tsx", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const trackerPath = path.join(process.cwd(), "components/summit-tracker.tsx");
    const code = fs.readFileSync(trackerPath, "utf8");

    // Must not block users with MAX_MB = 5 before client-side compression
    expect(code).not.toContain("MAX_MB = 5");
    expect(code).not.toContain("Cada foto debe ocupar máximo 5 MB");
  });

  it("should never use Supabase Storage as an upload target to protect database quota", async () => {
    const fs = await import("fs");
    const path = await import("path");

    const clientCode = fs.readFileSync(path.join(process.cwd(), "lib/photo-client.ts"), "utf8");
    expect(clientCode).not.toContain('.from("summit-photos").upload');

    const uploadRouteCode = fs.readFileSync(path.join(process.cwd(), "app/api/photos/upload/route.ts"), "utf8");
    expect(uploadRouteCode).not.toContain('.from("summit-photos").upload');
  });
});
