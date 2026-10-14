import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
        persistSession: false
      }
    });

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      return NextResponse.json({ error: "Token inválido o expirado" }, { status: 401 });
    }

    // Clean up photos in summit-photos bucket to avoid orphaned storage objects
    try {
      const { data: files, error: listError } = await supabaseAdmin.storage
        .from("summit-photos")
        .list(user.id);

      if (!listError && files && files.length > 0) {
        const pathsToDelete = files.map((file) => `${user.id}/${file.name}`);
        await supabaseAdmin.storage.from("summit-photos").remove(pathsToDelete);
      }
    } catch (storageErr) {
      console.error("Error cleaning up user photos during account deletion:", storageErr);
      // Non-fatal, continue with user deletion
    }

    // Clean up Cloudflare R2 photos if configured
    try {
      const { data: userPhotos } = await supabaseAdmin
        .from("summit_photos")
        .select("storage_path")
        .eq("user_id", user.id);

      if (userPhotos && userPhotos.length > 0) {
        const { deleteR2Objects } = await import("@/lib/r2-storage");
        const r2Paths = userPhotos.map((p) => p.storage_path).filter(Boolean);
        await deleteR2Objects(r2Paths);
      }
    } catch (r2Err) {
      console.error("Error cleaning up user R2 photos during account deletion:", r2Err);
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    
    if (deleteError) {
      return NextResponse.json({ error: "Error al borrar la cuenta: " + deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
