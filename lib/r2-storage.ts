import { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";

/**
 * Strict free-tier storage cap (9.5 GiB = 10,200,547,328 bytes),
 * leaving a 500 MB safety buffer below Cloudflare R2's 10 GB free limit.
 */
export const DEFAULT_MAX_STORAGE_BYTES = 9.5 * 1024 * 1024 * 1024; // 10,200,547,328 bytes

export function getMaxStorageBytes(): number {
  if (process.env.MAX_STORAGE_BYTES) {
    const parsed = parseInt(process.env.MAX_STORAGE_BYTES, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_MAX_STORAGE_BYTES;
}

export function getSanitizedR2Credentials() {
  const accountId = (process.env.CLOUDFLARE_R2_ACCOUNT_ID || "").trim();
  const accessKeyId = (process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || "").trim();
  const bucket = (process.env.CLOUDFLARE_R2_BUCKET_NAME || "").trim() || "atlas-photos";

  const customDomain = (process.env.NEXT_PUBLIC_R2_CUSTOM_DOMAIN || "").trim().replace(/\/+$/, "");
  let publicUrl = (process.env.CLOUDFLARE_R2_PUBLIC_URL || "").trim().replace(/\/+$/, "");

  if (customDomain) {
    publicUrl = customDomain;
  } else if (!publicUrl || publicUrl.includes("r2.dev")) {
    publicUrl = "/api/photos/view";
  }

  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl };
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_R2_ACCOUNT_ID?.trim() &&
      process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim() &&
      process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim() &&
      process.env.CLOUDFLARE_R2_BUCKET_NAME?.trim()
  );
}

export function createR2Client(endpointUrl?: string): S3Client {
  const { accountId, accessKeyId, secretAccessKey } = getSanitizedR2Credentials();

  const endpoint =
    endpointUrl?.trim() ||
    process.env.CLOUDFLARE_R2_ENDPOINT?.trim() ||
    `https://${accountId}.r2.cloudflarestorage.com`;

  return new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

let cachedS3Client: S3Client | null = null;
let cachedCredsSignature = "";

export function getR2Client(endpointUrl?: string): S3Client {
  if (endpointUrl) return createR2Client(endpointUrl);
  const { accountId, accessKeyId, secretAccessKey } = getSanitizedR2Credentials();
  const sig = `${accountId}:${accessKeyId}:${secretAccessKey.length}`;
  if (cachedS3Client && cachedCredsSignature === sig) return cachedS3Client;
  cachedS3Client = createR2Client();
  cachedCredsSignature = sig;
  return cachedS3Client;
}

export interface StorageLimitCheckResult {
  allowed: boolean;
  currentBytes: number;
  maxBytes: number;
  remainingBytes: number;
  reason?: "STORAGE_LIMIT_EXCEEDED" | "OK";
}

function sumPhotoRows(photos: any[]): number {
  let total = 0;
  for (const photo of photos) {
    const photoSize = Number(photo.file_size);
    total += !isNaN(photoSize) && photoSize > 0 ? photoSize : 200 * 1024;
  }
  return total;
}

/**
 * Strictly verifies whether a new upload fits under the 9.5 GB threshold.
 * Fails closed when the database check errors so quotas cannot be bypassed silently.
 */
export async function checkStorageLimit(
  additionalBytes: number = 0,
  supabaseAdmin: any
): Promise<StorageLimitCheckResult> {
  const maxBytes = getMaxStorageBytes();
  let currentBytes = 0;

  if (supabaseAdmin) {
    let verified = false;
    try {
      const { data: rpcBytes, error: rpcError } = await supabaseAdmin.rpc(
        "get_total_photos_storage_bytes"
      );
      if (!rpcError && typeof rpcBytes === "number") {
        currentBytes = rpcBytes;
        verified = true;
      } else {
        // Fallback: sum file_size across all rows (paginated in 1,000-row pages when supported)
        const query = supabaseAdmin.from("summit_photos").select("file_size");
        if (typeof query?.range === "function") {
          const PAGE_SIZE = 1000;
          let offset = 0;
          let accumulated = 0;
          let pageError = false;
          while (true) {
            const { data: page, error: selectError } = await supabaseAdmin
              .from("summit_photos")
              .select("file_size")
              .range(offset, offset + PAGE_SIZE - 1);
            if (selectError || !Array.isArray(page)) {
              pageError = true;
              break;
            }
            accumulated += sumPhotoRows(page);
            if (page.length < PAGE_SIZE) break;
            offset += PAGE_SIZE;
          }
          if (!pageError) {
            currentBytes = accumulated;
            verified = true;
          }
        } else {
          const { data: photos, error: selectError } = await query;
          if (!selectError && Array.isArray(photos)) {
            currentBytes = sumPhotoRows(photos);
            verified = true;
          }
        }
      }
    } catch (err) {
      console.error("Failed to verify storage limit:", err);
    }

    if (!verified) {
      return {
        allowed: false,
        currentBytes: maxBytes,
        maxBytes,
        remainingBytes: 0,
        reason: "STORAGE_LIMIT_EXCEEDED",
      };
    }
  }

  const projectedBytes = currentBytes + Math.max(0, additionalBytes);
  const allowed = projectedBytes <= maxBytes;

  return {
    allowed,
    currentBytes,
    maxBytes,
    remainingBytes: Math.max(0, maxBytes - projectedBytes),
    reason: allowed ? "OK" : "STORAGE_LIMIT_EXCEEDED",
  };
}

/**
 * Uploads a buffer directly to Cloudflare R2 from the server.
 */
export async function uploadR2Object(options: {
  key: string;
  buffer: Buffer | Uint8Array;
  contentType: string;
}): Promise<{ publicUrl: string; storagePath: string }> {
  const { key, buffer, contentType } = options;
  const { accountId, publicUrl } = getSanitizedR2Credentials();
  const publicBase = publicUrl.replace(/\/$/, "");

  const endpointsToTry: string[] = [];
  if (process.env.CLOUDFLARE_R2_ENDPOINT?.trim()) {
    endpointsToTry.push(process.env.CLOUDFLARE_R2_ENDPOINT.trim());
  } else if (accountId) {
    endpointsToTry.push(`https://${accountId}.r2.cloudflarestorage.com`);
    endpointsToTry.push(`https://${accountId}.eu.r2.cloudflarestorage.com`);
  }

  if (endpointsToTry.length === 0) {
    throw new Error("Cloudflare R2 credentials are not configured.");
  }

  const { bucket } = getSanitizedR2Credentials();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  });

  let lastErr: any = null;
  for (const ep of endpointsToTry) {
    try {
      const client = createR2Client(ep);
      await client.send(command);
      return {
        publicUrl: `${publicBase}/${key}`,
        storagePath: key,
      };
    } catch (err: any) {
      lastErr = err;
      console.warn(`R2 upload attempt on ${ep} failed:`, err?.message || err);
      const isSslFailure =
        err?.message?.includes("SSL alert") ||
        err?.message?.includes("EPROTO") ||
        err?.message?.includes("handshake") ||
        err?.code === "EPROTO";
      if (!isSslFailure) {
        throw err;
      }
    }
  }

  throw lastErr || new Error("Unknown error uploading to Cloudflare R2");
}

/**
 * Deletes a single object from Cloudflare R2.
 */
export async function deleteR2Object(key: string): Promise<boolean> {
  if (!isR2Configured()) return false;
  try {
    const { bucket } = getSanitizedR2Credentials();
    const client = getR2Client();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    console.error(`Error deleting R2 object ${key}:`, err);
    return false;
  }
}

/**
 * Deletes multiple objects from Cloudflare R2 in batches of up to 1,000 keys.
 */
export async function deleteR2Objects(keys: string[]): Promise<boolean> {
  if (!isR2Configured() || keys.length === 0) return false;
  try {
    const { bucket } = getSanitizedR2Credentials();
    const client = getR2Client();
    const BATCH_SIZE = 1000;
    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      const chunk = keys.slice(i, i + BATCH_SIZE);
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: chunk.map((k) => ({ Key: k })),
            Quiet: true,
          },
        })
      );
    }
    return true;
  } catch (err) {
    console.error("Error batch deleting objects from Cloudflare R2:", err);
    return false;
  }
}
