import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getAdminRole } from "@/lib/auth-roles";
import { FREE_TEXT_LIMIT, FREE_VISION_LIMIT, GUEST_LIMIT } from "@/lib/ai/rate-limit";
import pg from "pg";

async function getAuthClient() {
  const cookieStore = await cookies();
  let authHeader: string | null = null;
  try { const h = await headers(); authHeader = h.get("authorization") || h.get("Authorization"); } catch {}
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } } }) as unknown as ReturnType<typeof createServerClient>;
  }
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { get: async (name) => (await cookieStore).get(name)?.value },
  });
}

async function pgQuery<T=any>(sql: string, params: any[] = []): Promise<T[]> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL missing");
  const c = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }});
  await c.connect();
  try { const r = await c.query(sql, params); return r.rows as T[]; } finally { await c.end(); }
}

export async function POST(req: Request) {
  const supabaseAuth = await getAuthClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  const role = await getAdminRole(supabaseAuth, user?.id || null, user?.email);
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ ok: false, error: "غير مصرح", code: "FORBIDDEN" }, { status: 403 });
  }

  let body: any = null;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "JSON غير صالح", code: "INVALID_REQUEST" }, { status: 400 }); }
  const targetUserId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const targetEmail = typeof body?.email === "string" ? body.email.trim() : "";
  if (!targetUserId && !targetEmail) {
    return NextResponse.json({ ok: false, error: "أدخل userId أو email", code: "INVALID_REQUEST" }, { status: 400 });
  }

  let resolvedUserId = targetUserId;
  let resolvedEmail: string | null = null;
  let isAnonymous = false;

  if (!resolvedUserId && targetEmail) {
    // Try auth.users first via pg
    try {
      const rows = await pgQuery<{id:string, email:string, is_anonymous:boolean}>(`SELECT id, email, is_anonymous FROM auth.users WHERE lower(email)=lower($1) LIMIT 1`, [targetEmail]);
      if (rows[0]) { resolvedUserId = rows[0].id; resolvedEmail = rows[0].email; isAnonymous = rows[0].is_anonymous || false; }
    } catch {}
    if (!resolvedUserId) {
      try {
        const rows = await pgQuery<{id:string, email:string}>(`SELECT id, email FROM profiles WHERE lower(email)=lower($1) LIMIT 1`, [targetEmail]);
        if (rows[0]) { resolvedUserId = rows[0].id; resolvedEmail = rows[0].email; }
      } catch {}
    }
    if (!resolvedUserId) return NextResponse.json({ ok: false, error: "المستخدم غير موجود", code: "NOT_FOUND" }, { status: 404 });
  } else if (resolvedUserId) {
    try {
      const rows = await pgQuery<{email:string, is_anonymous:boolean}>(`SELECT email, is_anonymous FROM auth.users WHERE id=$1`, [resolvedUserId]);
      if (rows[0]) { resolvedEmail = rows[0].email; isAnonymous = rows[0].is_anonymous || false; }
    } catch {}
  }

  const now = Date.now();
  const since3h = new Date(now - 3*3600*1000).toISOString();
  const since5h = new Date(now - 5*3600*1000).toISOString();
  const since24h = new Date(now - 24*3600*1000).toISOString();

  let rows: any[] = [];
  try {
    rows = await pgQuery(`SELECT created_at, metadata, delta FROM ai_credit_ledger WHERE user_id=$1 AND reason='ai_reserve' ORDER BY created_at DESC LIMIT 200`, [resolvedUserId]);
  } catch {}

  const textUsed = rows.filter(r => {
    const kind = (r as any).metadata?.kind;
    return kind !== "vision" && kind !== "file" && kind !== "image" && kind !== "ocr" && new Date((r as any).created_at).toISOString() >= since3h;
  }).length;
  const visionUsed = rows.filter(r => {
    const kind = (r as any).metadata?.kind;
    return (kind === "vision" || kind === "file" || kind === "image" || kind === "ocr") && new Date((r as any).created_at).toISOString() >= since5h;
  }).length;
  const guestUsed = isAnonymous ? rows.filter(r => new Date((r as any).created_at).toISOString() >= since24h).length : null;

  let superUsed = 0, ultraUsed = 0;
  for (const r of rows) {
    if (new Date((r as any).created_at).toISOString() < since24h) continue;
    const m = (r as any).metadata?.model;
    if (m === "nvidia/nemotron-3-super-120b-a12b") superUsed++;
    if (m === "nvidia/nemotron-3-ultra-550b-a55b") ultraUsed++;
  }

  let balance = 0;
  try {
    const balRows = await pgQuery<{delta:number}>(`SELECT delta FROM ai_credit_ledger WHERE user_id=$1`, [resolvedUserId]);
    balance = balRows.reduce((s, r) => s + ((r as any).delta || 0), 0);
  } catch {}

  let entitlements: any[] = [];
  try {
    entitlements = await pgQuery(`SELECT kind, value, expires_at FROM entitlements WHERE user_id=$1`, [resolvedUserId]);
  } catch {}

  const hasAdvanced = entitlements.some((e:any) => e.kind === "feature" && e.value === "advanced-study" && (!e.expires_at || new Date(e.expires_at) > new Date()));
  const hasPremium = entitlements.some((e:any) => (e.kind === "plan" && e.value === "premium") || (e.kind === "feature" && e.value === "premium-ai"));

  return NextResponse.json({
    ok: true,
    user: { id: resolvedUserId, email: resolvedEmail, isAnonymous },
    rateLimits: {
      phaseA: {
        text: { limit: hasPremium ? 1000 : FREE_TEXT_LIMIT, used: textUsed, remaining: Math.max(0, (hasPremium ? 1000 : FREE_TEXT_LIMIT) - textUsed), windowHours: 3 },
        vision: { limit: hasPremium ? 1000 : FREE_VISION_LIMIT, used: visionUsed, remaining: Math.max(0, (hasPremium ? 1000 : FREE_VISION_LIMIT) - visionUsed), windowHours: 5 },
      },
      phaseB: {
        super: { model: "nvidia/nemotron-3-super-120b-a12b", limit: hasPremium ? 1000 : 5, used: superUsed, remaining: Math.max(0, (hasPremium ? 1000 : 5) - superUsed), windowHours: 24 },
        ultra: { model: "nvidia/nemotron-3-ultra-550b-a55b", limit: hasPremium ? 1000 : 3, used: ultraUsed, remaining: Math.max(0, (hasPremium ? 1000 : 3) - ultraUsed), windowHours: 24 },
      },
      phaseC: isAnonymous ? { guest: { limit: GUEST_LIMIT, used: guestUsed ?? 0, remaining: Math.max(0, GUEST_LIMIT - (guestUsed ?? 0)), windowHours: 24 } } : null,
    },
    credits: { balance, entitlements, hasAdvanced, hasPremium },
    recent: rows.slice(0, 10).map((r:any) => ({ created_at: r.created_at, metadata: r.metadata, delta: r.delta })),
  });
}
