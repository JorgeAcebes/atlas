import { timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = url && key ? createClient(url, key) : null;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("Authorization") || "";

  if (!secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const expected = `Bearer ${secret}`;
  const authBuf = Buffer.from(auth);
  const expectedBuf = Buffer.from(expected);
  if (authBuf.length !== expectedBuf.length || !timingSafeEqual(authBuf, expectedBuf)) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!supabase) {
    return Response.json({ ok: false, error: "Supabase not configured" }, { status: 500 });
  }

  const { error } = await supabase.from("ascents").select("id").limit(1);

  if (error) {
    console.error("Keepalive check failed:", error);
    return Response.json({ ok: false, error: "Keepalive check failed" }, { status: 500 });
  }

  return Response.json({
    ok: true,
    timestamp: new Date().toISOString(),
  });
}
