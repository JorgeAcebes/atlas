import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { getR2Client, getSanitizedR2Credentials } from "@/lib/r2-storage";

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await context.params;
    if (!path || path.length === 0) {
      return new NextResponse("Not Found", { status: 404 });
    }

    // Probar tanto la clave decodificada como la directa (conservando puntos dobles en nombres de archivo)
    const keysToTry: string[] = [];
    try {
      const decodedKey = path
        .map((seg) => decodeURIComponent(seg))
        .filter((seg) => seg !== ".." && seg !== ".")
        .join("/");
      if (decodedKey) keysToTry.push(decodedKey);
    } catch {
      // Ignorar error de decodificación
    }

    const directKey = path.filter((seg) => seg !== ".." && seg !== ".").join("/");
    if (directKey && !keysToTry.includes(directKey)) {
      keysToTry.push(directKey);
    }

    // 1. Intentar servir primariamente desde Cloudflare R2
    let s3Res = null;
    let finalKey = keysToTry[0] || directKey;

    try {
      const { bucket } = getSanitizedR2Credentials();
      const client = getR2Client();

      for (const testKey of keysToTry) {
        try {
          const res = await client.send(
            new GetObjectCommand({
              Bucket: bucket,
              Key: testKey,
            })
          );
          if (res.Body) {
            s3Res = res;
            finalKey = testKey;
            break;
          }
        } catch (keyErr: any) {
          if (keyErr?.name !== "NoSuchKey" && keyErr?.$metadata?.httpStatusCode !== 404) {
            console.warn(`[Photos Proxy] Fallo al consultar clave '${testKey}' en Cloudflare R2:`, keyErr?.message || keyErr);
          }
        }
      }

      if (s3Res && s3Res.Body) {
        const bytes = await s3Res.Body.transformToByteArray();
        const contentType =
          s3Res.ContentType ||
          (finalKey.endsWith(".png")
            ? "image/png"
            : finalKey.endsWith(".webp")
            ? "image/webp"
            : "image/jpeg");

        return new NextResponse(Buffer.from(bytes), {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
            "Content-Length": String(bytes.byteLength),
            ...(s3Res.ETag ? { ETag: s3Res.ETag } : {}),
          },
        });
      }
    } catch (r2Err) {
      console.warn("[Photos Proxy] Error general en Cloudflare R2, recurriendo a fallback:", r2Err);
    }

    // 2. Fallback defensivo a Supabase Storage (fotos existentes en storage.objects)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        for (const testKey of keysToTry) {
          const { data: blob, error: sbError } = await supabase.storage
            .from("summit-photos")
            .download(testKey);

          if (!sbError && blob) {
            const arrayBuf = await blob.arrayBuffer();
            return new NextResponse(Buffer.from(arrayBuf), {
              status: 200,
              headers: {
                "Content-Type": blob.type || "image/jpeg",
                "Cache-Control": "public, max-age=31536000, immutable",
                "Content-Length": String(blob.size),
              },
            });
          }
        }
      } catch (sbErr) {
        console.warn("[Photos Proxy] Fallback de Supabase Storage no disponible:", sbErr);
      }
    }

    return new NextResponse("Foto no encontrada", { status: 404 });
  } catch (err: any) {
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
      return new NextResponse("Foto no encontrada", { status: 404 });
    }
    console.error("Error al servir foto:", err);
    return new NextResponse("Error al servir la foto", { status: 500 });
  }
}
