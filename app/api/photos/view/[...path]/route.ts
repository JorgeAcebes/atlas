import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
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

    // Servir única y exclusivamente desde Cloudflare R2
    const { bucket } = getSanitizedR2Credentials();
    const client = getR2Client();

    let s3Res = null;
    let finalKey = keysToTry[0] || directKey;

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
          throw keyErr;
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

    return new NextResponse("Foto no encontrada", { status: 404 });
  } catch (err: any) {
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
      return new NextResponse("Foto no encontrada", { status: 404 });
    }
    console.error("Error al servir foto desde Cloudflare R2:", err);
    return new NextResponse("Error al servir la foto", { status: 500 });
  }
}
