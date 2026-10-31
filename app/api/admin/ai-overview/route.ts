import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getAdminRole } from "@/lib/auth-roles";
import { MODEL_REGISTRY } from "@/lib/ai/models";
import { GATED_MODELS } from "@/lib/ai/model-access";
import { ALL_AGENTS } from "@/lib/ai/agents/registry";
import { MODEL_LIMITS, AGENT_LIMITS, GUEST_LIMIT, GUEST_WINDOW_HOURS, FREE_TEXT_LIMIT, FREE_TEXT_WINDOW_HOURS, FREE_VISION_LIMIT, FREE_VISION_WINDOW_HOURS } from "@/lib/ai/rate-limit";
import pg from "pg";
import { createServiceClient } from "@/lib/supabase/admin";

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

export async function GET() {
  const supabase = await getAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = await getAdminRole(supabase, user?.id || null, user?.email);
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ ok: false, error: "غير مصرح", code: "FORBIDDEN" }, { status: 403 });
  }

  // ── Live stats via pg (bypasses RLS, works without SERVICE_ROLE_KEY) ──
  const since24h = new Date(Date.now() - 24*3600*1000).toISOString();
  const since3h = new Date(Date.now() - 3*3600*1000).toISOString();

  let total = 0, last24h = 0, last3h = 0, entitlements = 0, super24h = 0, ultra24h = 0, recentLogs: any[] = [];
  let guest24h: number | null = null;
  let dbError: string | null = null;
  let loaded = false;

  // ── Attempt 1: Supabase service client (works if SUPABASE_SECRET_KEY present) ──
  try {
    const svc = createServiceClient();
    const [tRes, r24, r3, eRes] = await Promise.all([
      svc.from("ai_credit_ledger").select("*", { count: "exact", head: true }).eq("reason", "ai_reserve"),
      svc.from("ai_credit_ledger").select("*", { count: "exact", head: true }).eq("reason", "ai_reserve").gte("created_at", since24h),
      svc.from("ai_credit_ledger").select("*", { count: "exact", head: true }).eq("reason", "ai_reserve").gte("created_at", since3h),
      svc.from("entitlements").select("*", { count: "exact", head: true }),
    ]);
    if (tRes.error) throw new Error(tRes.error.message);
    if (r24.error) throw new Error(r24.error.message);
    if (r3.error) throw new Error(r3.error.message);
    if (eRes.error) throw new Error(eRes.error.message);
    total = tRes.count ?? 0;
    last24h = r24.count ?? 0;
    last3h = r3.count ?? 0;
    entitlements = eRes.count ?? 0;

    const { data: rows, error: rowsErr } = await svc
      .from("ai_credit_ledger")
      .select("metadata")
      .eq("reason", "ai_reserve")
      .gte("created_at", since24h)
      .limit(500);
    if (rowsErr) throw new Error(rowsErr.message);
    for (const r of rows ?? []) {
      const m = (r as any)?.metadata?.model;
      if (m === "nvidia/nemotron-3-super-120b-a12b") super24h++;
      if (m === "nvidia/nemotron-3-ultra-550b-a55b") ultra24h++;
    }
    try {
      const { data: logs, error: logsErr } = await svc
        .from("ai_agent_generations")
        .select("id, user_id, agent, provider, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (!logsErr) recentLogs = logs ?? [];
    } catch { recentLogs = []; }

    try {
      const { data: listData } = await svc.auth.admin.listUsers({ perPage: 200 });
      const anonSet = new Set((listData?.users ?? []).filter((u: any) => u.is_anonymous).map((u: any) => u.id));
      if (anonSet.size > 0) {
        const { data: guestRows } = await svc
          .from("ai_credit_ledger")
          .select("user_id")
          .eq("reason", "ai_reserve")
          .gte("created_at", since24h)
          .limit(500);
        guest24h = (guestRows ?? []).filter((r: any) => anonSet.has(r.user_id)).length;
      } else {
        guest24h = 0;
      }
    } catch { guest24h = null; }

    loaded = true;
  } catch (e: any) {
    dbError = e?.message || "service client failed";
  }

  // ── Attempt 2: pg / DATABASE_URL fallback ──
  if (!loaded) {
    try {
      const [tRes, r24, r3, eRes] = await Promise.all([
        pgQuery<{count:string}>(`SELECT count(*)::text as count FROM ai_credit_ledger WHERE reason='ai_reserve'`),
        pgQuery<{count:string}>(`SELECT count(*)::text as count FROM ai_credit_ledger WHERE reason='ai_reserve' AND created_at >= $1`, [since24h]),
        pgQuery<{count:string}>(`SELECT count(*)::text as count FROM ai_credit_ledger WHERE reason='ai_reserve' AND created_at >= $1`, [since3h]),
        pgQuery<{count:string}>(`SELECT count(*)::text as count FROM entitlements`),
      ]);
      total = parseInt(tRes[0]?.count || "0", 10);
      last24h = parseInt(r24[0]?.count || "0", 10);
      last3h = parseInt(r3[0]?.count || "0", 10);
      entitlements = parseInt(eRes[0]?.count || "0", 10);

      const rows = await pgQuery<{metadata:any}>(`SELECT metadata FROM ai_credit_ledger WHERE reason='ai_reserve' AND created_at >= $1 LIMIT 500`, [since24h]);
      for (const r of rows) {
        const m = (r as any)?.metadata?.model;
        if (m === "nvidia/nemotron-3-super-120b-a12b") super24h++;
        if (m === "nvidia/nemotron-3-ultra-550b-a55b") ultra24h++;
      }
      try {
        const logs = await pgQuery<any>(`SELECT id, user_id, agent, provider, created_at FROM ai_agent_generations ORDER BY created_at DESC LIMIT 10`);
        recentLogs = logs;
      } catch { recentLogs = []; }

      try {
        const anonIds = await pgQuery<{id:string}>(`SELECT id FROM auth.users WHERE is_anonymous = true LIMIT 200`);
        const anonSet = new Set(anonIds.map(r=>r.id));
        if (anonSet.size>0) {
          const guestRows = await pgQuery<{user_id:string}>(`SELECT user_id FROM ai_credit_ledger WHERE reason='ai_reserve' AND created_at >= $1 LIMIT 500`, [since24h]);
          guest24h = guestRows.filter(r=> anonSet.has((r as any).user_id)).length;
        } else guest24h = 0;
      } catch { guest24h = null; }

      loaded = true;
      dbError = null;
    } catch (e: any) {
      dbError = e?.message || "pg failed";
    }
  }

  if (!loaded) {
    return NextResponse.json({ ok: false, error: dbError || "No database access (set SUPABASE_SECRET_KEY or DATABASE_URL in Vercel)", code: "DB_UNAVAILABLE" }, { status: 503 });
  }

  const allModels = MODEL_REGISTRY.map(m => ({
    id: m.id, provider: m.provider, displayName: m.displayName, enabled: m.enabled, freeEndpoint: m.freeEndpoint, capabilities: m.capabilities,
    gated: !!GATED_MODELS[m.id], entitlement: GATED_MODELS[m.id] || null,
  }));
  const agents = Object.values(ALL_AGENTS).map(a => ({ id: a.id, label: a.label, status: a.status, priority: a.priority, capabilities: a.capabilities }));

  return NextResponse.json({
    ok: true,
    overview: {
      totalRequests: total,
      last24h,
      last3h,
      super24h,
      ultra24h,
      guest24h,
      entitlements,
      recentLogs,
    },
    limits: {
      phaseA: { text: { limit: FREE_TEXT_LIMIT, windowHours: FREE_TEXT_WINDOW_HOURS }, vision: { limit: FREE_VISION_LIMIT, windowHours: FREE_VISION_WINDOW_HOURS } },
      phaseB: { models: MODEL_LIMITS, agents: AGENT_LIMITS },
      phaseC: { guest: { limit: GUEST_LIMIT, windowHours: GUEST_WINDOW_HOURS } },
    },
    models: allModels,
    agents,
    dbError,
    system: {
      modelRegistrySize: MODEL_REGISTRY.length,
      enabledModels: MODEL_REGISTRY.filter(m => m.enabled).length,
      gatedCount: Object.keys(GATED_MODELS).length,
      agentCount: agents.length,
      auditLogging: "NOT AVAILABLE" as const,
    },
  });
}
