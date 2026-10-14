import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { deleteR2Objects } from "@/lib/r2-storage";

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

    const body = await request.json();
    const { paths } = body;

    if (!Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json({ error: "Lista de rutas requerida" }, { status: 400 });
    }

    // Seguridad: verificar que todas las rutas pertenecen al usuario autenticado
    const safePaths = paths.filter(
      (p): p is string => typeof p === "string" && p.startsWith(`${user.id}/`)
    );

    if (safePaths.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    // 1. Eliminar de Cloudflare R2 si aplica
    await deleteR2Objects(safePaths);

    // 2. Eliminar también de Supabase Storage por si eran fotos anteriores
    try {
      await supabaseAdmin.storage.from("summit-photos").remove(safePaths);
    } catch (e) {
      // Ignorar si no existía en Supabase
    }

    return NextResponse.json({ success: true, count: safePaths.length });
  } catch (err: any) {
    console.error("Error en delete photos API:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
