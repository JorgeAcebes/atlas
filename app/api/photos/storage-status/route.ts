import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isR2Configured, checkStorageLimit, getMaxStorageBytes } from "@/lib/r2-storage";

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

    return NextResponse.json({
      currentBytes,
      maxBytes,
      remainingBytes: check.remainingBytes,
      currentGB: toGB(currentBytes),
      maxGB: toGB(maxBytes),
      percentage,
      isBlocked,
      r2Configured: isR2Configured(),
      statusText: isBlocked
        ? "BLOQUEADO (Se alcanzó el límite de 9,5 GB)"
        : `DISPONIBLE (${percentage}% utilizado de 9,5 GB)`,
    });
  } catch (err: any) {
    console.error("Error al consultar estado de almacenamiento:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
