import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import fs from "fs";
import path from "path";

// Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Fetching objects from bucket 'summit-photos'...");

  // Fetch list of objects directly from public storage URL endpoint or Supabase
  // We can query Supabase storage list
  let allFiles = [];

  // Recursive fetcher for Supabase storage
  async function listAll(folder = "") {
    const { data, error } = await supabase.storage.from("summit-photos").list(folder, {
      limit: 1000,
    });
    if (error) {
      console.error(`Error listing folder ${folder}:`, error);
      return;
    }
    for (const item of data) {
      const fullPath = folder ? `${folder}/${item.name}` : item.name;
      if (item.id === null) {
        // It's a folder
        await listAll(fullPath);
      } else {
        allFiles.push({
          name: fullPath,
          size: item.metadata?.size || 0,
          mime: item.metadata?.mimetype || "image/jpeg",
        });
      }
    }
  }

  await listAll("");
  console.log(`Found ${allFiles.length} files in total.`);

  // Filter for files larger than 250 KB and image types (exclude avatars if already tiny)
  const toProcess = allFiles.filter(
    (f) => f.size > 250 * 1024 && !f.name.includes("avatar")
  );

  console.log(`Found ${toProcess.length} images to compress (> 250 KB).`);

  let totalOriginalSize = 0;
  let totalNewSize = 0;
  let count = 0;

  for (const file of toProcess) {
    count++;
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/summit-photos/${file.name}`;
    try {
      const res = await fetch(publicUrl);
      if (!res.ok) {
        console.warn(`[${count}/${toProcess.length}] Failed to download: ${file.name} (${res.status})`);
        continue;
      }
      const originalBuffer = Buffer.from(await res.arrayBuffer());
      const origSize = originalBuffer.length;
      totalOriginalSize += origSize;

      // Compress with sharp
      const compressedBuffer = await sharp(originalBuffer)
        .rotate() // auto-orient based on EXIF
        .resize({
          width: 1200,
          height: 1200,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 80, effort: 4 })
        .toBuffer();

      const newSize = compressedBuffer.length;
      totalNewSize += newSize;

      // Overwrite the file in Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("summit-photos")
        .upload(file.name, compressedBuffer, {
          contentType: "image/webp",
          upsert: true,
        });

      if (uploadError) {
        console.error(`[${count}/${toProcess.length}] Upload error for ${file.name}:`, uploadError.message);
      } else {
        const savedPercent = Math.round(((origSize - newSize) / origSize) * 100);
        console.log(
          `[${count}/${toProcess.length}] ${file.name}: ${(origSize / 1024).toFixed(0)}KB -> ${(newSize / 1024).toFixed(0)}KB (-${savedPercent}%)`
        );
      }
    } catch (err) {
      console.error(`[${count}/${toProcess.length}] Error processing ${file.name}:`, err.message);
    }
  }

  console.log("\n=== COMPRESSION FINISHED ===");
  console.log(`Original total: ${(totalOriginalSize / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`New total: ${(totalNewSize / (1024 * 1024)).toFixed(2)} MB`);
  console.log(
    `Saved: ${((totalOriginalSize - totalNewSize) / (1024 * 1024)).toFixed(2)} MB (-${Math.round(
      ((totalOriginalSize - totalNewSize) / totalOriginalSize) * 100
    )}%)`
  );
}

run();
