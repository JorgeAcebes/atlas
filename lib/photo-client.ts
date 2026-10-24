/**
 * Cliente unificado de subida y eliminación de fotos.
 * Gestiona la verificación del límite estricto de 9.5 GB en el backend,
 * y la subida directa y exclusiva a Cloudflare R2 (protegiendo íntegramente la cuota de Supabase).
 */

export interface UploadPhotoResult {
  publicUrl: string;
  storagePath: string;
  fileSize: number;
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

  // Subida exclusiva a Cloudflare R2 a través de /api/photos/upload
  // (Petición same-origin en el servidor, sin problemas de preflight CORS de navegador)
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

  const data = await res.json();

  if (res.ok && data.publicUrl && data.storagePath) {
    return {
      publicUrl: data.publicUrl,
      storagePath: data.storagePath,
      fileSize: data.fileSize || blob.size,
    };
  }

  const errorMsg =
    data.error ||
    (data.code === "STORAGE_LIMIT_EXCEEDED"
      ? "Límite de almacenamiento alcanzado (9,5 GB). Se han bloqueado nuevas subidas para evitar costes."
      : "Error al subir la imagen a Cloudflare R2.");

  throw new Error(errorMsg);
}

/**
 * Elimina fotos de Cloudflare R2 (y limpia referencias históricas de Supabase Storage si existían)
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

  // Limpieza redundante de fotos antiguas que pudieran quedar en Supabase Storage
  try {
    await supabase.storage.from("summit-photos").remove(paths);
  } catch (err) {
    // Ignorar si ya no existía
  }
}
