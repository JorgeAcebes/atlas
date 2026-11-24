import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  isR2Configured,
  checkStorageLimit,
  uploadR2Object,
} from "@/lib/r2-storage";
import { detectSafeImageMime } from "@/lib/photo-security";
import { uploadRateLimiter, getClientIp } from "@/lib/rate-limit";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_BATCH_FILES = 4;

async function uploadWithRetry(options: {
  key: string;
  buffer: Buffer;
  contentType: string;
}) {
  let lastError: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await uploadR2Object(options);
    } catch (r2Err: any) {
      lastError = r2Err;
      console.warn(`Intento ${attempt} de subida a R2 falló:`, r2Err?.message || r2Err);
      if (attempt < 3) {
        await new Promise((res) => setTimeout(res, 500 * attempt));
      }
    }
  }
  throw lastError || new Error("Error al subir la imagen a Cloudflare R2.");
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateCheck = uploadRateLimiter.check(ip);
    if (!rateCheck.success) {
      return NextResponse.json(
        { error: "Demasiadas subidas en poco tiempo. Espera unos segundos." },
        {
          status: 429,
          headers: {
            "Retry-After": Math.max(1, Math.ceil(rateCheck.resetMs / 1000)).toString(),
          },
        }
      );
    }

    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Configuración del servidor incompleta" },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const [authResult, formData] = await Promise.all([
      supabaseAdmin.auth.getUser(token),
      request.formData().catch(() => null),
    ]);

    const {
      data: { user },
      error: userError,
    } = authResult;

    if (userError || !user) {
      return NextResponse.json({ error: "Token inválido o expirado" }, { status: 401 });
    }

    if (!formData) {
      return NextResponse.json({ error: "Formulario inválido" }, { status: 400 });
    }

    const summitId = (formData.get("summitId") as string) || "general";
    const folder = summitId ? String(summitId).replace(/[^a-zA-Z0-9._-]/g, "-") : "general";

    const rawBatchFiles = formData
      .getAll("files")
      .filter(
        (v): v is File => Boolean(v && typeof v !== "string" && typeof v.arrayBuffer === "function")
      );
    const rawBatchNames = formData.getAll("fileNames");

    if (rawBatchFiles.length > 0) {
      if (rawBatchFiles.length > MAX_BATCH_FILES) {
        return NextResponse.json(
          { error: `Máximo ${MAX_BATCH_FILES} fotos por lote.` },
          { status: 400 }
        );
      }

      const prepared: Array<{
        buffer: Buffer;
        contentType: string;
        fileSize: number;
        cleanFileName: string;
        rawFileName: string;
      }> = [];

      let totalBytes = 0;
      for (let i = 0; i < rawBatchFiles.length; i++) {
        const batchFile = rawBatchFiles[i];
        const nameEntry = rawBatchNames[i];
        const rawFileName: string =
          (typeof nameEntry === "string" && nameEntry) ||
          batchFile.name ||
          `photo-${i + 1}.webp`;

        if (batchFile.size <= 0) {
          return NextResponse.json({ error: "Archivo vacío" }, { status: 400 });
        }
        if (batchFile.size > MAX_UPLOAD_BYTES) {
          return NextResponse.json(
            { error: "La imagen supera el tamaño máximo permitido (15 MB)." },
            { status: 413 }
          );
        }

        const buffer = Buffer.from(await batchFile.arrayBuffer());
        const detectedMime = detectSafeImageMime(buffer);
        if (!detectedMime) {
          return NextResponse.json(
            { error: "Formato de imagen no permitido. Solo se aceptan JPEG, PNG, WebP, GIF o AVIF." },
            { status: 400 }
          );
        }

        totalBytes += batchFile.size;
        prepared.push({
          buffer,
          contentType: detectedMime,
          fileSize: batchFile.size,
          cleanFileName: rawFileName.replace(/[^a-zA-Z0-9._-]/g, "-"),
          rawFileName,
        });
      }

      const storageCheck = await checkStorageLimit(totalBytes, supabaseAdmin);
      if (!storageCheck.allowed) {
        return NextResponse.json(
          {
            error:
              "Límite de almacenamiento alcanzado (9,5 GB). Se han bloqueado nuevas subidas para evitar costes.",
            code: "STORAGE_LIMIT_EXCEEDED",
            currentBytes: storageCheck.currentBytes,
            maxBytes: storageCheck.maxBytes,
            remainingBytes: 0,
          },
          { status: 507 }
        );
      }

      if (!isR2Configured()) {
        return NextResponse.json(
          { error: "El almacenamiento Cloudflare R2 no está configurado en las variables de entorno." },
          { status: 500 }
        );
      }

      const uploads = await Promise.all(
        prepared.map(async (item) => {
          const storagePath = `${user.id}/${folder}/${crypto.randomUUID()}-${item.cleanFileName}`;
          const r2Result = await uploadWithRetry({
            key: storagePath,
            buffer: item.buffer,
            contentType: item.contentType,
          });
          return {
            publicUrl: r2Result.publicUrl,
            storagePath: r2Result.storagePath,
            fileSize: item.fileSize,
            fileName: item.rawFileName,
          };
        })
      );

      return NextResponse.json({
        provider: "r2",
        uploads,
      });
    }

    // Legacy single-file flow
    const file = formData.get("file") as File | Blob | null;
    const rawFileName = (formData.get("fileName") as string) || "photo.webp";

    if (!file) {
      return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
    }

    const fileSize = file.size;
    if (fileSize <= 0) {
      return NextResponse.json({ error: "Archivo vacío" }, { status: 400 });
    }
    if (fileSize > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "La imagen supera el tamaño máximo permitido (15 MB)." },
        { status: 413 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const detectedMime = detectSafeImageMime(buffer);
    if (!detectedMime) {
      return NextResponse.json(
        { error: "Formato de imagen no permitido. Solo se aceptan JPEG, PNG, WebP, GIF o AVIF." },
        { status: 400 }
      );
    }

    // Strict 9.5 GB cap verification
    const storageCheck = await checkStorageLimit(fileSize, supabaseAdmin);

    if (!storageCheck.allowed) {
      return NextResponse.json(
        {
          error:
            "Límite de almacenamiento alcanzado (9,5 GB). Se han bloqueado nuevas subidas para evitar costes.",
          code: "STORAGE_LIMIT_EXCEEDED",
          currentBytes: storageCheck.currentBytes,
          maxBytes: storageCheck.maxBytes,
          remainingBytes: 0,
        },
        { status: 507 }
      );
    }

    if (!isR2Configured()) {
      return NextResponse.json(
        { error: "El almacenamiento Cloudflare R2 no está configurado en las variables de entorno." },
        { status: 500 }
      );
    }

    const cleanFileName = rawFileName.replace(/[^a-zA-Z0-9._-]/g, "-");
    const uniqueId = crypto.randomUUID();
    const storagePath = `${user.id}/${folder}/${uniqueId}-${cleanFileName}`;

    let r2Result = null;
    try {
      r2Result = await uploadWithRetry({
        key: storagePath,
        buffer,
        contentType: detectedMime,
      });
    } catch (lastError) {
      console.error("Error al subir imagen a Cloudflare R2 tras 3 intentos:", lastError);
      return NextResponse.json(
        { error: "Error al subir la imagen a Cloudflare R2." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      provider: "r2",
      publicUrl: r2Result.publicUrl,
      storagePath: r2Result.storagePath,
      fileSize,
    });
  } catch (err: any) {
    console.error("Error en upload photos API:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
