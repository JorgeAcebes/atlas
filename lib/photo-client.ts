/**
 * Cliente unificado de subida y eliminación de fotos.
 * Gestiona la verificación del límite estricto de 9.5 GB en el backend,
 * y la subida directa a Cloudflare R2 (o Supabase Storage como fallback garantizado).
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
  supabase: any;
}): Promise<UploadPhotoResult> {
  const { blob, fileName, summitId, session, supabase } = options;

  if (!session?.access_token) {
    throw new Error("Sesión no disponible para subir la foto.");
  }

  // 1. Intentar subida mediante la API del servidor /api/photos/upload
  // (Maneja Cloudflare R2 sin bloqueos de CORS del navegador y valida el límite de 9.5 GB)
  try {
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

    if (data.code === "STORAGE_LIMIT_EXCEEDED") {
      throw new Error(
        data.error ||
          "Límite de almacenamiento alcanzado (9,5 GB). Se han bloqueado nuevas subidas para evitar costes."
      );
    }

    console.warn("API /api/photos/upload devolvió error, pasando a fallback:", data.error);
  } catch (apiErr: any) {
    // Si fue el bloqueo de cuota estricto de 9.5 GB, propagarlo inmediatamente
    if (apiErr?.message?.includes("Límite de almacenamiento")) {
      throw apiErr;
    }
    console.warn("Fallo al contactar /api/photos/upload, usando fallback:", apiErr);
  }

  // 2. Fallback de alta resiliencia: subida directa a Supabase Storage
  // (Garantiza que la foto siempre se sube aunque falle la infraestructura externa)
  const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  const folder = summitId ? String(summitId).replace(/[^a-zA-Z0-9._-]/g, "-") : "general";
  const uniqueId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
  const fallbackPath = `${session.user?.id || "anonymous"}/${folder}/${uniqueId}-${cleanFileName}`;

  const upload = await supabase.storage
    .from("summit-photos")
    .upload(fallbackPath, blob, {
      contentType: blob.type || "image/webp",
      upsert: false,
    });

  if (upload.error) {
    throw new Error(`Error al subir imagen: ${upload.error.message}`);
  }

  const { data: pubData } = supabase.storage
    .from("summit-photos")
    .getPublicUrl(fallbackPath);

  return {
    publicUrl: pubData.publicUrl,
    storagePath: fallbackPath,
    fileSize: blob.size,
  };
}

/**
 * Elimina fotos de Cloudflare R2 y de Supabase Storage
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

  // Limpieza redundante en Supabase Storage
  try {
    await supabase.storage.from("summit-photos").remove(paths);
  } catch (err) {
    // Ignorar si ya no existía
  }
}
