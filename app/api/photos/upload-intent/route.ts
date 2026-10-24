import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  isR2Configured,
  checkStorageLimit,
  createPresignedUploadUrl,
} from "@/lib/r2-storage";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Configuración del servidor incompleta" },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "Token inválido o expirado" }, { status: 401 });
    }

    const body = await request.json();
    const { fileName, contentType, size, summitId } = body;

    if (!fileName || typeof fileName !== "string") {
      return NextResponse.json({ error: "Nombre de archivo no válido" }, { status: 400 });
    }

    if (!contentType || typeof contentType !== "string" || !contentType.startsWith("image/")) {
      return NextResponse.json({ error: "El archivo debe ser una imagen válida" }, { status: 400 });
    }

    const parsedSize = Number(size);
    if (isNaN(parsedSize) || parsedSize <= 0 || parsedSize > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "Tamaño de archivo no válido (máx 25 MB)" }, { status: 400 });
    }

    // =========================================================================
    // BLOQUEO ESTRICTO A LOS 9.5 GB (VERIFICACIÓN FUNDAMENTAL)
    // =========================================================================
    const storageCheck = await checkStorageLimit(parsedSize, supabaseAdmin);

    if (!storageCheck.allowed) {
      return NextResponse.json(
        {
          error: "Límite de almacenamiento alcanzado (9,5 GB). Se han bloqueado nuevas subidas para evitar costes.",
          code: "STORAGE_LIMIT_EXCEEDED",
          currentBytes: storageCheck.currentBytes,
          maxBytes: storageCheck.maxBytes,
          remainingBytes: 0,
        },
        { status: 507 }
      );
    }

    // =========================================================================
    // EXCLUSIVIDAD CLOUDFLARE R2
    // =========================================================================
    if (!isR2Configured()) {
      return NextResponse.json(
        { error: "El almacenamiento Cloudflare R2 no está configurado en el servidor." },
        { status: 500 }
      );
    }

    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
    const uniqueId = crypto.randomUUID();
    const folder = summitId ? String(summitId).replace(/[^a-zA-Z0-9._-]/g, "-") : "general";
    const storagePath = `${user.id}/${folder}/${uniqueId}-${cleanFileName}`;

    const presigned = await createPresignedUploadUrl({
      key: storagePath,
      contentType,
      expiresInSeconds: 300,
    });

    return NextResponse.json({
      provider: "r2",
      uploadUrl: presigned.uploadUrl,
      publicUrl: presigned.publicUrl,
      storagePath: presigned.storagePath,
      currentBytes: storageCheck.currentBytes,
      maxBytes: storageCheck.maxBytes,
      remainingBytes: storageCheck.remainingBytes,
    });
  } catch (err: any) {
    console.error("Error en upload-intent API:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
