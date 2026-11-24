import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { getR2Client, getSanitizedR2Credentials, isR2Configured } from "@/lib/r2-storage";
import { hasUnsafePathTraversal, resolveSafeImageContentType } from "@/lib/photo-security";

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await context.params;
    if (!path || path.length === 0) {
      return new NextResponse("Not Found", { status: 404 });
    }

    // Reject path traversal before decoding or joining segments
    for (const seg of path) {
      if (hasUnsafePathTraversal(seg)) {
        return new NextResponse("Invalid path", { status: 400 });
      }
    }

    const keysToTry: string[] = [];
    try {
      const decodedKey = path.map((seg) => decodeURIComponent(seg)).join("/");
      if (decodedKey && !hasUnsafePathTraversal(decodedKey)) {
        keysToTry.push(decodedKey);
      }
    } catch {
      return new NextResponse("Invalid path", { status: 400 });
    }

    const directKey = path.join("/");
    if (directKey && !hasUnsafePathTraversal(directKey) && !keysToTry.includes(directKey)) {
      keysToTry.push(directKey);
    }

    if (keysToTry.length === 0) {
      return new NextResponse("Invalid path", { status: 400 });
    }

    // 1. Serve primarily from Cloudflare R2 (streamed without full-buffer RAM allocation)
    if (isR2Configured()) {
      let s3Res: any = null;
      let finalKey = keysToTry[0];

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
              console.warn(`[Photos Proxy] Error fetching '${testKey}' from R2:`, keyErr?.message || keyErr);
            }
          }
        }

        if (s3Res && s3Res.Body) {
          const contentType = resolveSafeImageContentType(s3Res.ContentType, finalKey);
          const headers: Record<string, string> = {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
            "CDN-Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
          };
          if (typeof s3Res.ContentLength === "number" && s3Res.ContentLength >= 0) {
            headers["Content-Length"] = String(s3Res.ContentLength);
          }
          if (s3Res.ETag) {
            headers["ETag"] = s3Res.ETag;
          }

          if (typeof s3Res.Body.transformToWebStream === "function") {
            return new NextResponse(s3Res.Body.transformToWebStream(), {
              status: 200,
              headers,
            });
          }

          const bytes = await s3Res.Body.transformToByteArray();
          headers["Content-Length"] = String(bytes.byteLength);
          return new NextResponse(Buffer.from(bytes), {
            status: 200,
            headers,
          });
        }
      } catch (r2Err) {
        console.warn("[Photos Proxy] Cloudflare R2 error, falling back to Supabase Storage:", r2Err);
      }
    }

    // 2. Defensive fallback to Supabase Storage (legacy photos)
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
            const contentType = resolveSafeImageContentType(blob.type, testKey);
            return new NextResponse(blob.stream(), {
              status: 200,
              headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=31536000, immutable",
                "CDN-Cache-Control": "public, max-age=31536000, immutable",
                "Content-Length": String(blob.size),
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "default-src 'none'; sandbox",
              },
            });
          }
        }
      } catch (sbErr) {
        console.warn("[Photos Proxy] Supabase Storage fallback unavailable:", sbErr);
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
