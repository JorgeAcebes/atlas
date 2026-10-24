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

    const key = path.join("/").replace(/\.\./g, "");

    // 1. Intentar servir desde Cloudflare R2
    try {
      const { bucket } = getSanitizedR2Credentials();
      const client = getR2Client();
      const s3Res = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );

      if (s3Res.Body) {
        const bytes = await s3Res.Body.transformToByteArray();
        const contentType =
          s3Res.ContentType ||
          (key.endsWith(".png")
            ? "image/png"
            : key.endsWith(".webp")
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
    } catch {
      // Si no existe en R2 o hay fallo temporal, probar fallback a Supabase Storage
    }

    // 2. Fallback defensivo a Supabase Storage (fotos existentes en storage.objects)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: blob, error: sbError } = await supabase.storage
        .from("summit-photos")
        .download(key);

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

    return new NextResponse("Foto no encontrada", { status: 404 });
  } catch (err: any) {
    console.error("Error al servir foto:", err);
    return new NextResponse("Error interno al servir la foto", { status: 500 });
  }
}
