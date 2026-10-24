#!/usr/bin/env node
/**
 * Script de migración de fotos de Supabase Storage a Cloudflare R2
 * 
 * Uso:
 *   node scripts/migrate-photos-to-r2.mjs
 * 
 * Requiere que estén configuradas las variables de entorno en .env.local:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - CLOUDFLARE_R2_ACCOUNT_ID
 * - CLOUDFLARE_R2_ACCESS_KEY_ID
 * - CLOUDFLARE_R2_SECRET_ACCESS_KEY
 * - CLOUDFLARE_R2_BUCKET_NAME
 * - CLOUDFLARE_R2_PUBLIC_URL
 */

import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";

// 1. Cargar variables de entorno desde .env.local si no están definidas
function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;
const publicUrlBase = process.env.CLOUDFLARE_R2_PUBLIC_URL?.replace(/\/$/, "");

if (!supabaseUrl || !serviceKey) {
  console.error("❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrlBase) {
  console.error("❌ Faltan credenciales de Cloudflare R2 en el entorno (.env.local).");
  console.error("  Asegúrate de definir:");
  console.error("  - CLOUDFLARE_R2_ACCOUNT_ID");
  console.error("  - CLOUDFLARE_R2_ACCESS_KEY_ID");
  console.error("  - CLOUDFLARE_R2_SECRET_ACCESS_KEY");
  console.error("  - CLOUDFLARE_R2_BUCKET_NAME");
  console.error("  - CLOUDFLARE_R2_PUBLIC_URL");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT?.trim() || `https://${accountId}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

async function run() {
  console.log("====================================================");
  console.log("  MIGRACIÓN DE FOTOS: SUPABASE STORAGE ➔ CLOUDFLARE R2");
  console.log("====================================================");

  // 1. Obtener todas las fotos de la base de datos
  const { data: photos, error } = await supabase
    .from("summit_photos")
    .select("id, storage_path, public_url, file_size")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("❌ Error al consultar summit_photos:", error.message);
    process.exit(1);
  }

  console.log(`📸 Encontradas ${photos.length} fotos en la base de datos.`);

  let migratedCount = 0;
  let skippedCount = 0;
  let totalBytes = 0;

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const isAlreadyOnR2 = photo.public_url && photo.public_url.startsWith(publicUrlBase);

    if (isAlreadyOnR2 && photo.file_size && photo.file_size > 0) {
      skippedCount++;
      totalBytes += photo.file_size;
      continue;
    }

    console.log(`[${i + 1}/${photos.length}] Migrando: ${photo.storage_path}...`);

    try {
      // 2. Descargar de Supabase Storage
      const { data: fileBlob, error: downloadError } = await supabase.storage
        .from("summit-photos")
        .download(photo.storage_path);

      if (downloadError || !fileBlob) {
        console.warn(`  ⚠️ No se pudo descargar de Supabase Storage (${downloadError?.message || "vacío"}). Intentando vía public_url...`);
        const fallbackRes = await fetch(photo.public_url);
        if (!fallbackRes.ok) {
          console.error(`  ❌ Fallo total al descargar foto ${photo.id}`);
          continue;
        }
        const arrayBuf = await fallbackRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        const contentType = fallbackRes.headers.get("content-type") || "image/webp";

        // Subir a R2
        await s3.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: photo.storage_path,
            Body: buffer,
            ContentType: contentType,
          })
        );

        const newPublicUrl = `${publicUrlBase}/${photo.storage_path}`;
        await supabase
          .from("summit_photos")
          .update({ public_url: newPublicUrl, file_size: buffer.length })
          .eq("id", photo.id);

        migratedCount++;
        totalBytes += buffer.length;
        console.log(`  ✓ Subida a R2 y actualizada en DB (${(buffer.length / 1024).toFixed(1)} KB)`);
        continue;
      }

      const arrayBuf = await fileBlob.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const contentType = fileBlob.type || "image/webp";

      // 3. Subir a Cloudflare R2
      await s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: photo.storage_path,
          Body: buffer,
          ContentType: contentType,
        })
      );

      // 4. Actualizar registro en Postgres
      const newPublicUrl = `${publicUrlBase}/${photo.storage_path}`;
      await supabase
        .from("summit_photos")
        .update({ public_url: newPublicUrl, file_size: buffer.length })
        .eq("id", photo.id);

      migratedCount++;
      totalBytes += buffer.length;
      console.log(`  ✓ Migrada a R2: ${(buffer.length / 1024).toFixed(1)} KB`);
    } catch (err) {
      console.error(`  ❌ Error migrando ${photo.storage_path}:`, err.message);
    }
  }

  const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
  const totalGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(3);

  console.log("\n====================================================");
  console.log("  RESUMEN DE MIGRACIÓN");
  console.log("====================================================");
  console.log(`✓ Fotos migradas con éxito: ${migratedCount}`);
  console.log(`✓ Fotos ya en R2 (omitidas): ${skippedCount}`);
  console.log(`✓ Espacio total en R2: ${totalMB} MB (${totalGB} GB de 9.5 GB disponibles)`);
  console.log("====================================================\n");
}

run();
