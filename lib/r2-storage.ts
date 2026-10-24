import { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Límite estricto de almacenamiento gratuito (9.5 GB en bytes).
 * 9.5 GiB = 9.5 * 1024 * 1024 * 1024 = 10,200,547,328 bytes.
 * Garantiza un margen de seguridad de 500 MB antes del límite de 10 GB de Cloudflare R2
 * para asegurar que NUNCA se produzca ningún cobro.
 */
export const DEFAULT_MAX_STORAGE_BYTES = 9.5 * 1024 * 1024 * 1024; // 10,200,547,328 bytes

export function getMaxStorageBytes(): number {
  if (process.env.MAX_STORAGE_BYTES) {
    const parsed = parseInt(process.env.MAX_STORAGE_BYTES, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_MAX_STORAGE_BYTES;
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_R2_ACCOUNT_ID &&
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
    process.env.CLOUDFLARE_R2_BUCKET_NAME &&
    process.env.CLOUDFLARE_R2_PUBLIC_URL
  );
}

let cachedS3Client: S3Client | null = null;

export function getR2Client(): S3Client {
  if (cachedS3Client) return cachedS3Client;

  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Credenciales de Cloudflare R2 incompletas en variables de entorno.");
  }

  cachedS3Client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return cachedS3Client;
}

export interface StorageLimitCheckResult {
  allowed: boolean;
  currentBytes: number;
  maxBytes: number;
  remainingBytes: number;
  reason?: "STORAGE_LIMIT_EXCEEDED" | "OK";
}

/**
 * Verifica de forma estricta si una nueva subida cabe dentro del umbral de 9.5 GB.
 * Si se alcanza o supera el límite, bloquea inmediatamente la subida devolviendo allowed: false.
 */
export async function checkStorageLimit(
  additionalBytes: number = 0,
  supabaseAdmin: any
): Promise<StorageLimitCheckResult> {
  const maxBytes = getMaxStorageBytes();
  let currentBytes = 0;

  if (supabaseAdmin) {
    try {
      // 1. Intentar llamar a la función RPC dedicada
      const { data: rpcBytes, error: rpcError } = await supabaseAdmin.rpc("get_total_photos_storage_bytes");
      if (!rpcError && typeof rpcBytes === "number") {
        currentBytes = rpcBytes;
      } else {
        // 2. Fallback: sumar file_size de la tabla summit_photos
        const { data: photos, error: selectError } = await supabaseAdmin
          .from("summit_photos")
          .select("file_size");

        if (!selectError && Array.isArray(photos)) {
          for (const photo of photos) {
            // Si la foto no tiene tamaño registrado (foto heredada), estimamos 200 KB de margen
            const photoSize = Number(photo.file_size);
            currentBytes += (!isNaN(photoSize) && photoSize > 0) ? photoSize : (200 * 1024);
          }
        }
      }
    } catch (err) {
      console.warn("No se pudo obtener el tamaño exacto de almacenamiento, usando comprobación defensiva:", err);
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
 * Genera una URL prefirmada (Presigned URL) para que el navegador suba la foto directamente a Cloudflare R2
 */
export async function createPresignedUploadUrl(options: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<{ uploadUrl: string; publicUrl: string; storagePath: string }> {
  const { key, contentType, expiresInSeconds = 300 } = options;
  const client = getR2Client();
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME!;
  const publicBase = process.env.CLOUDFLARE_R2_PUBLIC_URL!.replace(/\/$/, "");

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  const publicUrl = `${publicBase}/${key}`;

  return {
    uploadUrl,
    publicUrl,
    storagePath: key,
  };
}

/**
 * Sube directamente un buffer a Cloudflare R2 desde el servidor (evita problemas de CORS en navegador)
 */
export async function uploadR2Object(options: {
  key: string;
  buffer: Buffer | Uint8Array;
  contentType: string;
}): Promise<{ publicUrl: string; storagePath: string }> {
  const { key, buffer, contentType } = options;
  const client = getR2Client();
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME!;
  const publicBase = process.env.CLOUDFLARE_R2_PUBLIC_URL!.replace(/\/$/, "");

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  });

  await client.send(command);

  return {
    publicUrl: `${publicBase}/${key}`,
    storagePath: key,
  };
}

/**
 * Elimina un objeto de Cloudflare R2
 */
export async function deleteR2Object(key: string): Promise<boolean> {
  if (!isR2Configured()) return false;
  try {
    const client = getR2Client();
    const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME!;
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    console.error(`Error al eliminar objeto ${key} de Cloudflare R2:`, err);
    return false;
  }
}

/**
 * Elimina múltiples objetos de Cloudflare R2 en lote
 */
export async function deleteR2Objects(keys: string[]): Promise<boolean> {
  if (!isR2Configured() || keys.length === 0) return false;
  try {
    const client = getR2Client();
    const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME!;
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: keys.map((k) => ({ Key: k })),
          Quiet: true,
        },
      })
    );
    return true;
  } catch (err) {
    console.error("Error al eliminar objetos en lote de Cloudflare R2:", err);
    return false;
  }
}
