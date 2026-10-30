import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
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
  let body: { magId?: unknown; token?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
  }

  const magId = normalizeMagId(body.magId);
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!magId || !/^\d{4,10}$/.test(token)) {
    return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });
  }

  const ip = clientIp(req);
  const rl = checkMagRateLimit(magRateLimitKey(ip, magId, "verify"));
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED", retryAfter: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  // Resolve MAG -> expected account (server-side, service role).
  let expectedUserId: string | null = null;
  let email: string | null = null;
  try {
    const service = createServiceClient();
    const { data: profile } = await service
      .from("profiles")
      .select("id")
      .eq("public_user_code", magId)
      .maybeSingle();
    if (!profile?.id) {
      console.warn("[mag-auth] verify: profile not found");
      return NextResponse.json({ ok: false, error: "INVALID_CREDENTIALS" }, { status: 401 });
    }
    expectedUserId = profile.id;
    const { data: userData } = await service.auth.admin.getUserById(profile.id);
    email = userData?.user?.email ?? null;
    if (!email) {
      console.warn("[mag-auth] verify: no email for account");
      return NextResponse.json({ ok: false, error: "INVALID_CREDENTIALS" }, { status: 401 });
    }
  } catch (e) {
    console.warn("[mag-auth] verify: resolve failed", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const cookieStore = await cookies();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options as { path?: string; maxAge?: number; domain?: string; secure?: boolean; httpOnly?: boolean; sameSite?: "lax" | "strict" | "none" } | undefined);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  async function clearSession() {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {}
    // Belt-and-braces: remove any sb-* auth cookies even if signOut did not.
    try {
      for (const c of cookieStore.getAll()) {
        if (c.name.startsWith("sb-")) cookieStore.delete(c.name);
      }
    } catch {}
  }

  if (error || !data?.user) {
    console.warn("[mag-auth] verify: otp failed");
    await clearSession();
    return NextResponse.json({ ok: false, error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  if (data.user.id !== expectedUserId) {
    console.warn("[mag-auth] verify: user mismatch");
    await clearSession();
    return NextResponse.json({ ok: false, error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, userId: data.user.id });
}