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

    const key = path.join("/").replace(/\.\./g, "");

    // Servir única y exclusivamente desde Cloudflare R2
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

    return new NextResponse("Foto no encontrada", { status: 404 });
  } catch (err: any) {
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
      return new NextResponse("Foto no encontrada", { status: 404 });
    }
    console.error("Error al servir foto desde Cloudflare R2:", err);
    return new NextResponse("Error al servir la foto", { status: 500 });
  }
}
