import { NextResponse } from "next/server";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkMagRateLimit, magRateLimitKey } from "@/lib/auth/mag-rate-limit";
import { normalizeMagId } from "@/lib/auth/mag-id";

export const runtime = "nodejs";

function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: Request) {
  let body: { magId?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
  }

  const magId = normalizeMagId(body.magId);
  if (!magId) {
    return NextResponse.json({ ok: false, error: "INVALID_MAG" }, { status: 400 });
  }

  const ip = clientIp(req);
  const rl = checkMagRateLimit(magRateLimitKey(ip, magId, "request"));
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED", retryAfter: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  // Generic response regardless of existence to avoid user enumeration.
  const genericOk = NextResponse.json({ ok: true });

  try {
    const service = createServiceClient();
    const { data: profile } = await service
      .from("profiles")
      .select("id")
      .eq("public_user_code", magId)
      .maybeSingle();

    if (!profile?.id) {
      console.warn("[mag-auth] request: profile not found");
      return genericOk;
    }

    const { data: userData, error: userErr } = await service.auth.admin.getUserById(profile.id);
    if (userErr || !userData?.user?.email) {
      console.warn("[mag-auth] request: no email for account");
      return genericOk;
    }

    const email = userData.user.email;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const anon = createAnonClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: otpErr } = await anon.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    if (otpErr) {
      console.warn("[mag-auth] request: signInWithOtp failed", otpErr.message);
    }
  } catch (e) {
    console.warn("[mag-auth] request: unexpected error", e instanceof Error ? e.message : "unknown");
  }

  return genericOk;
}