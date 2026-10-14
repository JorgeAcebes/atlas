import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authRateLimiter, getClientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateCheck = authRateLimiter.check(ip);
    if (!rateCheck.success) {
      return NextResponse.json(
        { error: "Demasiados intentos de inicio de sesión. Por favor, inténtalo de nuevo más tarde." },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil(rateCheck.resetMs / 1000).toString(),
            "X-RateLimit-Limit": rateCheck.limit.toString(),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const body = await request.json();
    const { username, password } = body;

    if (!username || !password || typeof username !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { error: "Usuario y contraseña requeridos." },
        { status: 400 }
      );
    }

    const cleanUsername = username.replace(/^@/, "").trim().toLowerCase();
    if (!cleanUsername.match(/^[a-zA-Z0-9_]{3,20}$/)) {
      return NextResponse.json(
        { error: "Correo o contraseña incorrectos." },
        { status: 401 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return NextResponse.json(
        { error: "Configuración del servidor incompleta." },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Look up profile by username
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", cleanUsername)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json(
        { error: "Correo o contraseña incorrectos." },
        { status: 401 }
      );
    }

    // 2. Fetch user's email via admin API
    const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(profile.id);
    if (userErr || !userData?.user?.email) {
      return NextResponse.json(
        { error: "Correo o contraseña incorrectos." },
        { status: 401 }
      );
    }

    // 3. Attempt authentication with email and password without exposing email to client
    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authData, error: authError } = await anonClient.auth.signInWithPassword({
      email: userData.user.email,
      password,
    });

    if (authError || !authData.session) {
      return NextResponse.json(
        { error: "Correo o contraseña incorrectos." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      session: authData.session,
    });
  } catch (err) {
    console.error("Error in username-login API:", err);
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
