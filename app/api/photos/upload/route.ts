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

    const cleanFileName = rawFileName.replace(/[^a-zA-Z0-9._-]/g, "-");
    const uniqueId = crypto.randomUUID();
    const folder = summitId ? String(summitId).replace(/[^a-zA-Z0-9._-]/g, "-") : "general";
    const storagePath = `${user.id}/${folder}/${uniqueId}-${cleanFileName}`;
    const contentType = file.type || "image/webp";

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Si Cloudflare R2 está configurado, subir directamente desde el servidor (sin bloqueos CORS del navegador)
    if (isR2Configured()) {
      try {
        const r2Result = await uploadR2Object({
          key: storagePath,
          buffer,
          contentType,
        });

        return NextResponse.json({
          provider: "r2",
          publicUrl: r2Result.publicUrl,
          storagePath: r2Result.storagePath,
          fileSize,
        });
      } catch (r2Err) {
        console.warn("Fallo al subir a Cloudflare R2 desde el servidor, usando fallback a Supabase Storage:", r2Err);
      }
    }

    // 2. Fallback garantizado: Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from("summit-photos")
      .upload(storagePath, buffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error("Error al subir a Supabase Storage:", uploadError);
      return NextResponse.json(
        { error: `Error al almacenar foto: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const { data: pubData } = supabaseAdmin.storage
      .from("summit-photos")
      .getPublicUrl(storagePath);

    return NextResponse.json({
      provider: "supabase",
      publicUrl: pubData.publicUrl,
      storagePath,
      fileSize,
    });
  } catch (err: any) {
    console.error("Error en upload photos API:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
