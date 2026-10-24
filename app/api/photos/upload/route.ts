import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  isR2Configured,
  checkStorageLimit,
  uploadR2Object,
} from "@/lib/r2-storage";

export async function POST(request: Request) {
  try {
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

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "Token inválido o expirado" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | Blob | null;
    const rawFileName = (formData.get("fileName") as string) || "photo.webp";
    const summitId = (formData.get("summitId") as string) || "general";

    if (!file) {
      return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
    }

    const fileSize = file.size;
    if (fileSize <= 0) {
      return NextResponse.json({ error: "Archivo vacío" }, { status: 400 });
    }

    // =========================================================================
    // BLOQUEO ESTRICTO A LOS 9.5 GB (VERIFICACIÓN FUNDAMENTAL)
    // =========================================================================
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

    // =========================================================================
    // EXCLUSIVIDAD CLOUDFLARE R2 (NUNCA USAR SUPABASE STORAGE PARA SUBIDAS)
    // =========================================================================
    if (!isR2Configured()) {
      return NextResponse.json(
        { error: "El almacenamiento Cloudflare R2 no está configurado en las variables de entorno." },
        { status: 500 }
      );
    }

    const cleanFileName = rawFileName.replace(/[^a-zA-Z0-9._-]/g, "-");
    const uniqueId = crypto.randomUUID();
    const folder = summitId ? String(summitId).replace(/[^a-zA-Z0-9._-]/g, "-") : "general";
    const storagePath = `${user.id}/${folder}/${uniqueId}-${cleanFileName}`;
    const contentType = file.type || "image/webp";

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let uploadSuccess = false;
    let r2Result = null;
    let lastError = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        r2Result = await uploadR2Object({
          key: storagePath,
          buffer,
          contentType,
        });
        uploadSuccess = true;
        break;
      } catch (r2Err: any) {
        lastError = r2Err;
        console.warn(`Intento ${attempt} de subida a R2 falló:`, r2Err?.message || r2Err);
        if (attempt < 3) {
          await new Promise((res) => setTimeout(res, 500 * attempt));
        }
      }
    }

    if (!uploadSuccess || !r2Result) {
      console.error("Error al subir imagen a Cloudflare R2 tras 3 intentos:", lastError);
      return NextResponse.json(
        { error: `Error al subir la imagen a Cloudflare R2: ${lastError?.message || "Fallo en el servicio"}` },
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
