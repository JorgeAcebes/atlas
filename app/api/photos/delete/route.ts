import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { deleteR2Objects } from "@/lib/r2-storage";
import { filterSafeUserOwnedPaths } from "@/lib/photo-security";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
    }
    const { paths } = body || {};

    if (!Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json({ error: "Lista de rutas requerida" }, { status: 400 });
    }

    // Security: strictly verify user ownership and reject path traversal
    const safePaths = filterSafeUserOwnedPaths(paths, user.id);

    if (safePaths.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    await deleteR2Objects(safePaths);

    try {
      await supabaseAdmin.storage.from("summit-photos").remove(safePaths);
    } catch {
      // Ignore if not present in legacy Supabase Storage
    }

    return NextResponse.json({ success: true, count: safePaths.length });
  } catch (err: any) {
    console.error("Error en delete photos API:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
