import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { deleteR2Objects } from "@/lib/r2-storage";

async function listAllUserStoragePaths(
  supabaseAdmin: any,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const collected: string[] = [];
  const queue: string[] = [prefix];

  while (queue.length > 0) {
    const currentPrefix = queue.shift()!;
    let offset = 0;
    const PAGE_SIZE = 100;

    while (true) {
      const { data: items, error } = await supabaseAdmin.storage
        .from(bucket)
        .list(currentPrefix, { limit: PAGE_SIZE, offset });

      if (error || !items || items.length === 0) break;

      for (const item of items) {
        if (!item?.name) continue;
        const fullPath = `${currentPrefix}/${item.name}`;
        if (item.id === null) {
          queue.push(fullPath);
        } else {
          collected.push(fullPath);
        }
      }

      if (items.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  return collected;
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Configuración del servidor incompleta" }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "Token inválido o expirado" }, { status: 401 });
    }

    // Recursively clean up legacy photos in Supabase Storage (including nested summitId subfolders)
    try {
      const pathsToDelete = await listAllUserStoragePaths(supabaseAdmin, "summit-photos", user.id);
      for (let i = 0; i < pathsToDelete.length; i += 100) {
        await supabaseAdmin.storage.from("summit-photos").remove(pathsToDelete.slice(i, i + 100));
      }
    } catch (storageErr) {
      console.error("Error cleaning up user photos during account deletion:", storageErr);
    }

    // Clean up Cloudflare R2 photos & avatar
    try {
      const { data: userPhotos } = await supabaseAdmin
        .from("summit_photos")
        .select("storage_path")
        .eq("user_id", user.id);

      const r2Paths = (userPhotos || []).map((p: any) => p.storage_path).filter(Boolean);

      const { data: userProfile } = await supabaseAdmin
        .from("profiles")
        .select("avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      if (userProfile?.avatar_url) {
        const cleanAvatarUrl = String(userProfile.avatar_url).split("?")[0];
        const match = cleanAvatarUrl.match(
          /(?:pub-[^/]+\.r2\.dev\/|\/api\/photos\/view\/|https?:\/\/[^/]+\/)?((?:[a-zA-Z0-9_-]+\/)+[^/?#]+)$/
        );
        const extracted = match ? match[1] : null;
        const avatarPath =
          extracted && extracted.startsWith(`${user.id}/`)
            ? extracted
            : cleanAvatarUrl.startsWith(`${user.id}/`)
            ? cleanAvatarUrl
            : null;
        if (avatarPath && !r2Paths.includes(avatarPath)) {
          r2Paths.push(avatarPath);
        }
      }

      if (r2Paths.length > 0) {
        await deleteR2Objects(r2Paths);
      }
    } catch (r2Err) {
      console.error("Error cleaning up user R2 photos during account deletion:", r2Err);
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error("Error deleting auth user:", deleteError);
      return NextResponse.json({ error: "Error al borrar la cuenta." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
