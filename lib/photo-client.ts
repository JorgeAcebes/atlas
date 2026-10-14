/**
 * Cliente unificado de subida y eliminación de fotos.
 * Gestiona la verificación del límite estricto de 9.5 GB en el backend,
 * y la subida directa a Cloudflare R2 (o Supabase Storage como fallback).
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

  // 1. Solicitar intención de subida y comprobar límite de 9.5 GB en el backend
  const intentRes = await fetch("/api/photos/upload-intent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      fileName,
      contentType: blob.type || "image/webp",
      size: blob.size,
      summitId,
    }),
  });

  const intentData = await intentRes.json();

  if (!intentRes.ok || intentData.code === "STORAGE_LIMIT_EXCEEDED") {
    const errorMsg =
      intentData.error ||
      "Límite de almacenamiento alcanzado (9,5 GB). Se han bloqueado nuevas subidas para evitar costes.";
    throw new Error(errorMsg);
  }

  // 2. Si el proveedor es Cloudflare R2: subida directa mediante URL prefirmada
  if (intentData.provider === "r2" && intentData.uploadUrl) {
    const r2Res = await fetch(intentData.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": blob.type || "image/webp",
      },
      body: blob,
    });

    if (!r2Res.ok) {
      throw new Error(`Error al subir la imagen a Cloudflare R2 (${r2Res.statusText})`);
    }

    return {
      publicUrl: intentData.publicUrl,
      storagePath: intentData.storagePath,
      fileSize: blob.size,
    };
  }

  // 3. Fallback: Supabase Storage
  const upload = await supabase.storage
    .from("summit-photos")
    .upload(intentData.storagePath, blob, {
      contentType: blob.type || "image/webp",
      upsert: false,
    });

  if (upload.error) {
    throw new Error(`Error al subir imagen: ${upload.error.message}`);
  }

  const { data: pubData } = supabase.storage
    .from("summit-photos")
    .getPublicUrl(intentData.storagePath);

  return {
    publicUrl: pubData.publicUrl,
    storagePath: intentData.storagePath,
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
