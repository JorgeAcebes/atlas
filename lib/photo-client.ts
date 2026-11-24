/**
 * Unified client for photo URL resolution, upload, and deletion.
 */

export interface UploadPhotoResult {
  publicUrl: string;
  storagePath: string;
  fileSize: number;
}

function getPhotoBasePrefix(): string {
  const customDomain = (process.env.NEXT_PUBLIC_R2_CUSTOM_DOMAIN || "")
    .trim()
    .replace(/\/+$/, "");
  return customDomain || "/api/photos/view";
}

/**
 * Resolves the optimal display URL for a photo or avatar.
 * - Preserves `blob:` and `data:` previews untouched.
 * - Routes `.r2.dev` (blocked by some ISPs), Supabase Storage URLs, and raw `storagePath`
 *   through `NEXT_PUBLIC_R2_CUSTOM_DOMAIN` (when set) or `/api/photos/view/<path>`.
 */
export function getPhotoDisplayUrl(
  url?: string | null,
  storagePath?: string | null
): string {
  if (!url && !storagePath) return "";

  if (url && (url.startsWith("blob:") || url.startsWith("data:"))) {
    return url;
  }

  const basePrefix = getPhotoBasePrefix();
  const customDomain = (process.env.NEXT_PUBLIC_R2_CUSTOM_DOMAIN || "")
    .trim()
    .replace(/\/+$/, "");

  if (storagePath) {
    const cleanPath = storagePath.replace(/^\/+/, "");
    if (
      !url ||
      url.includes(".r2.dev") ||
      url.includes("supabase.co/storage/") ||
      url.startsWith("/api/photos/view/") ||
      (!url.startsWith("http") && !url.startsWith("/"))
    ) {
      return `${basePrefix}/${cleanPath}`;
    }
  }

  if (url) {
    if (url.includes(".r2.dev/")) {
      const match = url.match(/https?:\/\/[^/]+\.r2\.dev\/(.+)$/);
      if (match && match[1]) {
        return `${basePrefix}/${match[1]}`;
      }
    }
    if (url.includes("supabase.co/storage/v1/object/public/summit-photos/")) {
      const match = url.match(
        /supabase\.co\/storage\/v1\/object\/public\/summit-photos\/(.+)$/
      );
      if (match && match[1]) {
        return `${basePrefix}/${match[1]}`;
      }
    }
    if (customDomain && url.startsWith("/api/photos/view/")) {
      return `${customDomain}/${url.slice("/api/photos/view/".length)}`;
    }
    if (!url.startsWith("http") && !url.startsWith("/")) {
      return `${basePrefix}/${url.replace(/^\/+/, "")}`;
    }
    return url;
  }

  return "";
}

export async function uploadPhotoBlob(options: {
  blob: Blob;
  fileName: string;
  summitId?: string;
  session: any;
  supabase?: any;
}): Promise<UploadPhotoResult> {
  const { blob, fileName, summitId, session } = options;

  if (!session?.access_token) {
    throw new Error("Sesión no disponible para subir la foto.");
  }

  const formData = new FormData();
  formData.append("file", blob, fileName);
  formData.append("fileName", fileName);
  if (summitId) formData.append("summitId", summitId);

  const res = await fetch("/api/photos/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: formData,
  });

  const rawBody = await res.text();
  let data: any = null;
  try {
    data = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    data = null;
  }

  if (res.ok && data?.publicUrl && data?.storagePath) {
    return {
      publicUrl: getPhotoDisplayUrl(data.publicUrl, data.storagePath),
      storagePath: data.storagePath,
      fileSize: data.fileSize || blob.size,
    };
  }

  if (res.status === 413) {
    throw new Error("La imagen es demasiado grande para subirla (máximo 15 MB).");
  }

  const errorMsg =
    data?.error ||
    (data?.code === "STORAGE_LIMIT_EXCEEDED"
      ? "Límite de almacenamiento alcanzado (9,5 GB). Se han bloqueado nuevas subidas para evitar costes."
      : "Error al subir la imagen a Cloudflare R2.");

  throw new Error(errorMsg);
}

/**
 * Deletes photos from Cloudflare R2 and cleans up legacy Supabase Storage references.
 */
export async function deleteStoragePhotos(options: {
  paths: string[];
  session: any;
  supabase: any;
}): Promise<void> {
  const { paths, session, supabase } = options;
  if (!paths || paths.length === 0) return;

  if (session?.access_token) {
    try {
      await fetch("/api/photos/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ paths }),
      });
    } catch (err) {
      console.warn("Fallo en /api/photos/delete:", err);
    }
  }

  try {
    await supabase.storage.from("summit-photos").remove(paths);
  } catch {
    // Ignore if not present in Supabase Storage
  }
}
