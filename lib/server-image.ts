import { detectSafeImageMime, type SafeImageMime } from "@/lib/photo-security";

export const MAX_PHOTO_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_DIRECT_BASE64_BYTES = Math.floor(3.2 * 1024 * 1024); // ~3.2 MB raw inside JSON body
export const MAX_IMAGE_DIMENSION = 1600;

export interface ValidatedOptimizedImage {
  buffer: Buffer;
  contentType: SafeImageMime;
  fileSize: number;
  cleanFileName: string;
  width: number | null;
  height: number | null;
  optimized: boolean;
  originalBytes: number;
}

/**
 * Parses either a raw base64 string or a `data:image/...;base64,...` data URL.
 */
export function parseBase64Image(
  raw: string
): { buffer: Buffer; declaredMime?: string } | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let declaredMime: string | undefined;
  let base64Body = trimmed;

  if (trimmed.startsWith("data:")) {
    const commaIdx = trimmed.indexOf(",");
    if (commaIdx === -1) return null;
    const header = trimmed.slice(5, commaIdx);
    if (!header.toLowerCase().includes(";base64")) return null;
    declaredMime = header.split(";")[0].trim().toLowerCase() || undefined;
    base64Body = trimmed.slice(commaIdx + 1).trim();
  }

  const normalized = base64Body.replace(/\s+/g, "");
  if (!normalized || normalized.length % 4 === 1) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return null;

  try {
    const buffer = Buffer.from(normalized, "base64");
    if (buffer.length === 0) return null;
    return { buffer, declaredMime };
  } catch {
    return null;
  }
}

export function sanitizeUploadFileName(rawFileName: string, extensionOverride?: string): string {
  const fallback = extensionOverride ? `photo.${extensionOverride}` : "photo.webp";
  const baseInput = (rawFileName || fallback).trim() || fallback;
  const strippedPath = baseInput.split(/[\\/]/).pop() || fallback;
  let clean = strippedPath.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^\.+/, "");
  if (!clean) clean = fallback;

  if (extensionOverride) {
    const dotIdx = clean.lastIndexOf(".");
    const stem = dotIdx > 0 ? clean.slice(0, dotIdx) : clean;
    clean = `${stem}.${extensionOverride}`;
  }

  return clean.slice(0, 120);
}

/**
 * Validates image magic bytes and optimizes raster photos with Sharp (max 1600px, WebP q82, EXIF stripped)
 * while preserving animated GIFs untouched.
 */
export async function validateAndOptimizeImageBuffer(
  rawBuffer: Buffer,
  fileName: string
): Promise<ValidatedOptimizedImage> {
  if (!rawBuffer || rawBuffer.length <= 0) {
    throw new ImageValidationError("empty_file", "El archivo de imagen está vacío.", 400);
  }
  if (rawBuffer.length > MAX_PHOTO_UPLOAD_BYTES) {
    throw new ImageValidationError(
      "payload_too_large",
      "La imagen supera el tamaño máximo permitido (15 MB).",
      413
    );
  }

  const detectedMime = detectSafeImageMime(rawBuffer);
  if (!detectedMime) {
    throw new ImageValidationError(
      "unsupported_image_format",
      "Formato de imagen no permitido. Solo se aceptan JPEG, PNG, WebP, GIF o AVIF.",
      400
    );
  }

  const sharp = (await import("sharp")).default;
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(rawBuffer, { animated: true, limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw new ImageValidationError(
      "corrupt_image",
      "No se pudo decodificar la imagen proporcionada.",
      400
    );
  }

  const origWidth = typeof meta.width === "number" ? meta.width : null;
  const origHeight = typeof meta.height === "number" ? meta.height : null;

  // Keep multi-frame animated GIFs untouched
  if (detectedMime === "image/gif" && (meta.pages ?? 1) > 1) {
    return {
      buffer: rawBuffer,
      contentType: "image/gif",
      fileSize: rawBuffer.length,
      cleanFileName: sanitizeUploadFileName(fileName, "gif"),
      width: origWidth,
      height: origHeight,
      optimized: false,
      originalBytes: rawBuffer.length,
    };
  }

  const needsResize =
    (origWidth !== null && origWidth > MAX_IMAGE_DIMENSION) ||
    (origHeight !== null && origHeight > MAX_IMAGE_DIMENSION);

  try {
    const { data: webpBuffer, info } = await sharp(rawBuffer, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

    if ((needsResize || webpBuffer.length < rawBuffer.length) && detectSafeImageMime(webpBuffer) === "image/webp") {
      return {
        buffer: webpBuffer,
        contentType: "image/webp",
        fileSize: webpBuffer.length,
        cleanFileName: sanitizeUploadFileName(fileName, "webp"),
        width: info.width || origWidth,
        height: info.height || origHeight,
        optimized: true,
        originalBytes: rawBuffer.length,
      };
    }
  } catch {
    // Fall back to original buffer if WebP conversion encounters an edge-case image
  }

  const extMap: Record<SafeImageMime, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
  };

  return {
    buffer: rawBuffer,
    contentType: detectedMime,
    fileSize: rawBuffer.length,
    cleanFileName: sanitizeUploadFileName(fileName, extMap[detectedMime]),
    width: origWidth,
    height: origHeight,
    optimized: false,
    originalBytes: rawBuffer.length,
  };
}

export class ImageValidationError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ImageValidationError";
    this.code = code;
    this.status = status;
  }
}
