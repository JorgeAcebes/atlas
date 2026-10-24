import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isR2Configured, checkStorageLimit, getR2Client, getSanitizedR2Credentials } from "@/lib/r2-storage";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    let supabaseAdmin = null;
    if (supabaseUrl && supabaseKey) {
      supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }

    const check = await checkStorageLimit(0, supabaseAdmin);
    const maxBytes = check.maxBytes;
    const currentBytes = check.currentBytes;
    const percentage = Number(((currentBytes / maxBytes) * 100).toFixed(2));
    const isBlocked = !check.allowed || currentBytes >= maxBytes;

    const toGB = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(3);

    const { accountId, accessKeyId, secretAccessKey, bucket } = getSanitizedR2Credentials();
    const endpointConfigured = process.env.CLOUDFLARE_R2_ENDPOINT?.trim();

    const probes: Record<string, any> = {};
    const endpointsToTest = Array.from(
      new Set(
        [
          endpointConfigured,
          accountId ? `https://${accountId}.r2.cloudflarestorage.com` : null,
          accountId ? `https://${accountId}.eu.r2.cloudflarestorage.com` : null,
          "https://478cb5bbfd1daa5fef25a4e947478ba3.r2.cloudflarestorage.com",
          `https://r2.cloudflarestorage.com`,
        ].filter(Boolean) as string[]
      )
    );

    for (const ep of endpointsToTest) {
      try {
        const res = await fetch(ep, { method: "HEAD", signal: AbortSignal.timeout(4000) });
        probes[ep] = { ok: true, status: res.status, statusText: res.statusText };
      } catch (err: any) {
        probes[ep] = {
          ok: false,
          error: err?.message,
          code: err?.code,
          cause: err?.cause?.message,
        };
      }
    }

    // Probar S3Client upload en vivo
    let liveS3Test: any = null;
    if (isR2Configured()) {
      try {
        const client = getR2Client();
        const testKey = `_diagnostic/ping-${Date.now()}.txt`;
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: testKey,
            Body: "ping",
            ContentType: "text/plain",
          })
        );
        await client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: testKey,
          })
        );
        liveS3Test = { ok: true, message: "PutObject and DeleteObject succeeded" };
      } catch (s3Err: any) {
        liveS3Test = {
          ok: false,
          error: s3Err?.message,
          code: s3Err?.code,
          name: s3Err?.name,
        };
      }
    }

    return NextResponse.json({
      currentBytes,
      maxBytes,
      remainingBytes: check.remainingBytes,
      currentGB: toGB(currentBytes),
      maxGB: toGB(maxBytes),
      percentage,
      isBlocked,
      r2Configured: isR2Configured(),
      diagnostics: {
        accountIdMasked: accountId ? `${accountId.slice(0, 4)}...${accountId.slice(-4)} (len ${accountId.length})` : null,
        accessKeyIdMasked: accessKeyId ? `${accessKeyId.slice(0, 4)}...${accessKeyId.slice(-4)} (len ${accessKeyId.length})` : null,
        secretLen: secretAccessKey.length,
        bucket,
        probes,
        liveS3Test,
      },
      statusText: isBlocked
        ? "BLOQUEADO (Se alcanzó el límite de 9,5 GB)"
        : `DISPONIBLE (${percentage}% utilizado de 9,5 GB)`,
    });
  } catch (err: any) {
    console.error("Error al consultar estado de almacenamiento:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
