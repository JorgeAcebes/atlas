export const SAFE_RASTER_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

export type SafeImageMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "image/avif";

/**
 * Inspects file magic bytes to validate that an uploaded buffer is a genuine
 * safe raster image (never HTML, SVG, scripts, or arbitrary binaries).
 */
export function detectSafeImageMime(bytes: Uint8Array): SafeImageMime | null {
  if (!bytes || bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // GIF: GIF87a or GIF89a
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }

  // WebP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  // AVIF / ISOBMFF (ftypavif / ftypavis)
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === "avif" || brand === "avis") {
      return "image/avif";
    }
  }

  return null;
}

/**
 * Sanitizes Content-Type returned from storage so executable types like
 * text/html or image/svg+xml can never be served from the application origin.
 */
export function resolveSafeImageContentType(
  rawContentType: string | null | undefined,
  key: string
): string {
  const normalized = (rawContentType || "").split(";")[0].trim().toLowerCase();
  if (SAFE_RASTER_IMAGE_MIMES.has(normalized)) {
    return normalized;
  }

  const lowerKey = key.toLowerCase();
  if (lowerKey.endsWith(".png")) return "image/png";
  if (lowerKey.endsWith(".webp")) return "image/webp";
  if (lowerKey.endsWith(".gif")) return "image/gif";
  if (lowerKey.endsWith(".avif")) return "image/avif";
  if (lowerKey.endsWith(".jpg") || lowerKey.endsWith(".jpeg") || lowerKey.endsWith(".jfif")) {
    return "image/jpeg";
  }

  return "application/octet-stream";
}

/**
 * Checks whether a single storage path segment or full storage path is safe
 * against path traversal, null bytes, or backslash injection.
 */
export function hasUnsafePathTraversal(value: string): boolean {
  if (!value || value.includes("\0") || value.includes("\\")) return true;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return true;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return true;

  const checkSegments = (s: string) =>
    s.split("/").some((seg) => seg === ".." || seg === ".");

  return checkSegments(value) || checkSegments(decoded);
}

/**
 * Validates and normalizes user-owned deletion paths.
 */
export function filterSafeUserOwnedPaths(paths: unknown[], userId: string): string[] {
  if (!Array.isArray(paths) || !userId) return [];
  return paths.filter((p): p is string => {
    if (typeof p !== "string") return false;
    if (hasUnsafePathTraversal(p)) return false;
    return p.startsWith(`${userId}/`) && p.length > userId.length + 1;
  });
}
