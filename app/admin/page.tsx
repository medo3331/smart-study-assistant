import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminRole, isOwnerEmail } from "@/lib/auth-roles";
import { MODEL_REGISTRY } from "@/lib/ai/models";
import { GATED_MODELS } from "@/lib/ai/model-access";
import { ALL_AGENTS } from "@/lib/ai/agents/registry";
import { MODEL_LIMITS, AGENT_LIMITS, GUEST_LIMIT, GUEST_WINDOW_HOURS, FREE_TEXT_LIMIT, FREE_TEXT_WINDOW_HOURS, FREE_VISION_LIMIT, FREE_VISION_WINDOW_HOURS } from "@/lib/ai/rate-limit";
import UserAiLookup from "@/components/admin/UserAiLookup";
import pg from "pg";
import { 
  Shield, UserPlus, Zap, Users, Key, CheckCircle, AlertCircle, 
  Bot, BookOpen, ShoppingBag, Activity, Database, Cpu, Gauge, Eye, UserSearch, AlertTriangle, Server
} from "lucide-react";

async function pgQuery<T=any>(sql: string, params: any[] = []): Promise<T[]> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return [];
  const c = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }});
  await c.connect();
  try { const r = await c.query(sql, params); return r.rows as T[]; } finally { await c.end(); }
}

export default async function AdminControlCenter({
  searchParams,
}: {
  searchParams: { success?: string; error?: string };
}) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  // DEBUG server-only: auth/user presence for audit (no email/secret leaked)
  console.log("[admin-debug] user present:", !!user, "id present:", !!user?.id, "env OWNER present:", !!process.env.OWNER_EMAIL);

  // ── OWNER-ONLY: Server-side email allowlist — لا NEXT_PUBLIC، لا client check
  // 1) غير مسجل → /login (pattern موجود في المشروع)
  if (!user || user.is_anonymous) redirect("/login");
  // 2) مسجل لكن ليس Owner (مطابقة دقيقة عبر OWNER_EMAIL) → /dashboard
  // isOwnerEmail يقرأ OWNER_EMAIL Server-only فقط — لا يظهر في bundle/HTML
  if (!isOwnerEmail(user.email ?? null)) redirect("/dashboard");

  const role = await getAdminRole(supabase, user?.id || null, user?.email);
  const isOwner = role === "owner";

  // ── Existing stats ──
  const [{ count: usersCount }, { count: lessonsCount }, { data: recentAiLogs }, { data: adminsList }] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("study_days").select("*", { count: "exact", head: true }),
    supabase.from("ai_agent_generations").select("*").order("created_at", { ascending: false }).limit(5),
    isOwner ? supabase.from("site_admins").select("user_id, role, added_at") : Promise.resolve({ data: [] } as any)
  ]);

  // ── Phase D: AI Overview via pg (bypass RLS, works without SERVICE_ROLE_KEY) ──
  let aiOverview: any = null;
  let aiOverviewError: string | null = null;
  let economyOverview: any = null;
  let economyError: string | null = null;
  try {
    const since24h = new Date(Date.now() - 24*3600*1000).toISOString();
    const since3h = new Date(Date.now() - 3*3600*1000).toISOString();
    const [totalRes, last24Res, last3Res, entRes] = await Promise.all([
      pgQuery<{count:string}>(`SELECT count(*)::text as count FROM ai_credit_ledger WHERE reason='ai_reserve'`),
      pgQuery<{count:string}>(`SELECT count(*)::text as count FROM ai_credit_ledger WHERE reason='ai_reserve' AND created_at >= $1`, [since24h]),
      pgQuery<{count:string}>(`SELECT count(*)::text as count FROM ai_credit_ledger WHERE reason='ai_reserve' AND created_at >= $1`, [since3h]),
      pgQuery<{count:string}>(`SELECT count(*)::text as count FROM entitlements`),
    ]);
    let super24h = 0, ultra24h = 0;
    try {
      const rows = await pgQuery<{metadata:any}>(`SELECT metadata FROM ai_credit_ledger WHERE reason='ai_reserve' AND created_at >= $1 LIMIT 500`, [since24h]);
      for (const r of rows) {
        const m = (r as any)?.metadata?.model;
        if (m === "nvidia/nemotron-3-super-120b-a12b") super24h++;
        if (m === "nvidia/nemotron-3-ultra-550b-a55b") ultra24h++;
      }
    } catch {}
    aiOverview = {
      total: parseInt(totalRes[0]?.count || "0", 10),
      last24h: parseInt(last24Res[0]?.count || "0", 10),
      last3h: parseInt(last3Res[0]?.count || "0", 10),
      super24h, ultra24h,
      entitlements: parseInt(entRes[0]?.count || "0", 10),
    };
  } catch (e: any) {
    aiOverviewError = e.message || "تعذر جلب إحصائيات AI";
  }

  // ── Phase E: Economy Overview via pg ──
  try {
    const since24h = new Date(Date.now() - 24*3600*1000).toISOString();
    const [coinsTotalRes, coins24hRes, walletsRes, purchase24hRes, dailyLogin24hRes, streak24hRes, dayDone24hRes, wheelTotalRes, wheel24hRes] = await Promise.all([
      pgQuery<{count:string}>(`SELECT count(*)::text as count FROM coin_ledger WHERE source_type='earn'`),
      pgQuery<{count:string}>(`SELECT count(*)::text as count FROM coin_ledger WHERE source_type='earn' AND created_at >= $1`, [since24h]),
      pgQuery<{count:string}>(`SELECT count(*)::text as count FROM coin_wallets`),
      pgQuery<{count:string}>(`SELECT count(*)::text as count FROM coin_ledger WHERE source IN ('purchase','store_purchase') AND source_type='spend' AND created_at >= $1`, [since24h]),
      pgQuery<{count:string}>(`SELECT count(*)::text as count FROM coin_ledger WHERE source='daily_login' AND created_at >= $1`, [since24h]),
      pgQuery<{count:string}>(`SELECT count(*)::text as count FROM coin_ledger WHERE source='streak_day' AND created_at >= $1`, [since24h]),
      pgQuery<{count:string}>(`SELECT count(*)::text as count FROM coin_ledger WHERE source='day_done' AND created_at >= $1`, [since24h]),
      pgQuery<{count:string}>(`SELECT count(*)::text as count FROM coin_ledger WHERE source='wheel' AND source_type='earn'`),
      pgQuery<{count:string}>(`SELECT count(*)::text as count FROM coin_ledger WHERE source='wheel' AND created_at >= $1`, [since24h]),
    ]);
    const sumRows = await pgQuery<{sum:string}>(`SELECT coalesce(sum(amount),0)::text as sum FROM coin_ledger WHERE source_type='earn'`);
    const spendRows = await pgQuery<{sum:string}>(`SELECT coalesce(sum(amount),0)::text as sum FROM coin_ledger WHERE source_type='spend'`);
    const wheelSumRows = await pgQuery<{sum:string}>(`SELECT coalesce(sum(amount),0)::text as sum FROM coin_ledger WHERE source='wheel'`);
    economyOverview = {
      totalEarns: parseInt(coinsTotalRes[0]?.count || "0",10),
      earns24h: parseInt(coins24hRes[0]?.count || "0",10),
      wallets: parseInt(walletsRes[0]?.count || "0",10),
      purchases24h: parseInt(purchase24hRes[0]?.count || "0",10),
      dailyLogin24h: parseInt(dailyLogin24hRes[0]?.count || "0",10),
      streak24h: parseInt(streak24hRes[0]?.count || "0",10),
      dayDone24h: parseInt(dayDone24hRes[0]?.count || "0",10),
      totalCoinsIssued: parseInt(sumRows[0]?.sum || "0",10),
      totalCoinsSpent: Math.abs(parseInt(spendRows[0]?.sum || "0",10)),
      wheelTotal: parseInt(wheelTotalRes[0]?.count || "0",10),
      wheel24h: parseInt(wheel24hRes[0]?.count || "0",10),
      wheelCoins: parseInt(wheelSumRows[0]?.sum || "0",10),
    };
  } catch (e: any) {
    economyError = e.message || "تعذر جلب إحصائيات Economy";
  }

  const allModels = MODEL_REGISTRY;
  const gatedModels = Object.keys(GATED_MODELS);
  const agents = Object.values(ALL_AGENTS);

  return (
    <div className="p-6 md:p-10 dir-rtl max-w-7xl mx-auto space-y-8 bg-[var(--app-bg,#090d16)] text-white min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-6 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-3">
            <Shield className="text-amber-400" size={36} />
            مركز الإدارة الشامل (Owner & Admin Console)
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            متحكم النظام الحالي: <span className="text-amber-400 font-bold">{isOwner ? "المالك الرئيسي (Owner)" : "أدمن (Admin)"}</span> — AI Control Center (Phase D)
          </p>
        </div>
      </div>

      {/* التنبيهات */}
      {searchParams.success && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-2 text-sm">
          <CheckCircle size={18} /> تم تنفيذ العملية بنجاح!
        </div>
      )}
      {searchParams.error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center gap-2 text-sm">
          <AlertCircle size={18} /> {searchParams.error}
        </div>
      )}

      {/* 1. كروت الإحصائيات السريعة (Live Metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-blue-400">
            <Users size={22} />
            <span className="text-xs bg-blue-500/10 px-2 py-1 rounded">إجمالي الطلاب</span>
          </div>
          <p className="text-3xl font-bold">{usersCount || 0}</p>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-purple-400">
            <BookOpen size={22} />
            <span className="text-xs bg-purple-500/10 px-2 py-1 rounded">الدروس المتاحة</span>
          </div>
          <p className="text-3xl font-bold">{lessonsCount || 0}</p>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-emerald-400">
            <Bot size={22} />
            <span className="text-xs bg-emerald-500/10 px-2 py-1 rounded">محرك الذكاء الاصطناعي</span>
          </div>
          <p className="text-3xl font-bold">نشط 🟢</p>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-amber-400">
            <Database size={22} />
            <span className="text-xs bg-amber-500/10 px-2 py-1 rounded">الحالة الأمنية</span>
          </div>
          <p className="text-3xl font-bold">محمية 🛡️</p>
        </div>
      </div>

      {/* 1.1 AI Overview — Phase D */}
      <section className="bg-slate-900/80 border border-purple-500/30 rounded-2xl p-6 shadow-xl space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2 text-purple-300"><Activity size={20}/> AI Overview — مراقبة الذكاء الاصطناعي</h2>
        {aiOverviewError ? (
          <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">{aiOverviewError} — {process.env.SUPABASE_SERVICE_ROLE_KEY ? "تحقق من RLS" : "SUPABASE_SERVICE_ROLE_KEY مفقود"}</p>
        ) : aiOverview ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <p className="text-xs text-slate-400">إجمالي الطلبات</p>
              <p className="text-2xl font-bold">{aiOverview.total}</p>
              <p className="text-xs text-slate-500">reason=ai_reserve</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <p className="text-xs text-slate-400">آخر 24 ساعة</p>
              <p className="text-2xl font-bold">{aiOverview.last24h}</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <p className="text-xs text-slate-400">آخر 3 ساعات</p>
              <p className="text-2xl font-bold">{aiOverview.last3h}</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <p className="text-xs text-slate-400">Entitlements</p>
              <p className="text-2xl font-bold">{aiOverview.entitlements}</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <p className="text-xs text-slate-400">Super 5/24h (استخدام 24h)</p>
              <p className="text-lg font-bold">{aiOverview.super24h} / 5</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <p className="text-xs text-slate-400">Ultra 3/24h (استخدام 24h)</p>
              <p className="text-lg font-bold">{aiOverview.ultra24h} / 3</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 col-span-2">
              <p className="text-xs text-slate-400">Audit logging</p>
              <p className="text-sm font-bold text-amber-400">NOT AVAILABLE</p>
              <p className="text-xs text-slate-500">لا يوجد جدول audit مستقل — العمليات الحالية بلا سجل مركزي</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">جاري التحميل...</p>
        )}
      </section>

      {/* D4 Rate Limit Monitoring */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2 text-slate-200"><Gauge size={20} className="text-emerald-400"/> Rate Limit Monitoring — Phase A/B/C</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-2">
            <p className="text-sm font-bold text-emerald-400">Phase A — Per-User</p>
            <p className="text-xs text-slate-400">Text: <span className="text-white font-bold">{FREE_TEXT_LIMIT} / {FREE_TEXT_WINDOW_HOURS}h</span> — {FREE_TEXT_LIMIT} رسائل كل 3 ساعات</p>
            <p className="text-xs text-slate-400">Vision/File: <span className="text-white font-bold">{FREE_VISION_LIMIT} / {FREE_VISION_WINDOW_HOURS}h</span> — 6 صور/ملفات كل 5 ساعات</p>
            <p className="text-xs text-slate-500">Premium: 1000 / window (غير محدود)</p>
            <p className="text-xs text-slate-500">Fail-open عند خطأ DB</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-2">
            <p className="text-sm font-bold text-blue-400">Phase B — Per-Model</p>
            {Object.entries(MODEL_LIMITS).map(([m, cfg])=>(
              <p key={m} className="text-xs text-slate-300 font-mono">{m.split("/").pop()} — <span className="text-white">{cfg.limit} / {cfg.windowHours}h</span></p>
            ))}
            {gatedModels.length===0 && <p className="text-xs text-slate-500">لا يوجد حدود per-model</p>}
            <p className="text-xs text-slate-500">بدون entitlement → 403 قبل العد</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-2">
            <p className="text-sm font-bold text-purple-400">Phase C — Guest</p>
            <p className="text-xs text-slate-300">الزوار (anon): <span className="text-white font-bold">{GUEST_LIMIT} / {GUEST_WINDOW_HOURS}h</span></p>
            <p className="text-xs text-slate-500">مفتاح: Supabase Anonymous ID</p>
            <p className="text-xs text-slate-500">يُفحص قبل Phase A — 429 GUEST_RATE_LIMIT</p>
            <p className="text-xs text-amber-400">Abuse: anon جديد = هوية جديدة (موثق)</p>
          </div>
        </div>
        <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700">
          <p className="text-xs font-bold text-slate-300">Per-Agent Limits (Abstraction)</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
            {Object.entries(AGENT_LIMITS).map(([a, cfg])=>(
              <span key={a} className="text-xs bg-slate-700 px-2 py-1 rounded font-mono">{a}: {cfg.limit}/{cfg.windowHours}h</span>
            ))}
          </div>
          <p className="text-xs text-amber-400 mt-2">حالة: CONFIGURED — awaiting real agent execution (كل Agents حالياً STUB)</p>
        </div>
      </section>

      {/* D5 Model Management */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2 text-slate-200"><Cpu size={20} className="text-blue-400"/> Model Registry — {allModels.length} موديل</h2>
        <p className="text-xs text-slate-400">READ-ONLY — لا يوجد enable/disable من Admin (يتطلب تعديل الكود). العرض للمراقبة فقط.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-800 text-slate-300 border-b border-slate-700">
              <tr><th className="p-2">الموديل</th><th className="p-2">المزود</th><th className="p-2">الحالة</th><th className="p-2">الوصول</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {allModels.map(m=>(
                <tr key={m.id} className="hover:bg-slate-800/40">
                  <td className="p-2 font-mono text-slate-200">{m.id}</td>
                  <td className="p-2 text-slate-400">{m.provider}</td>
                  <td className="p-2">{m.enabled ? <span className="text-emerald-400">enabled</span> : <span className="text-rose-400">disabled</span>}</td>
                  <td className="p-2">{GATED_MODELS[m.id] ? <span className="text-amber-400">gated (advanced-study)</span> : <span className="text-emerald-400">free</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* D9 Agent Monitoring */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2 text-slate-200"><Bot size={20} className="text-purple-400"/> Agent Registry — {agents.length} agents</h2>
        <p className="text-xs text-amber-400">كل الـ Agents حالياً STUB — Per-Agent limits = CONFIGURED وليس WORKING LIVE</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map(a=>(
            <div key={a.id} className="bg-slate-800 rounded-xl p-3 border border-slate-700">
              <p className="text-sm font-bold text-slate-200">{a.label} <span className="text-xs font-mono text-slate-500">({a.id})</span></p>
              <p className="text-xs text-slate-400">{a.description}</p>
              <span className="inline-block mt-2 text-xs px-2 py-1 rounded bg-amber-500/20 text-amber-400">STUB</span>
            </div>
          ))}
        </div>
      </section>

      {/* Phase E: Economy / Coins / Rewards — Admin visibility */}
      <section className="bg-slate-900/80 border border-emerald-500/30 rounded-2xl p-6 shadow-xl space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2 text-emerald-300"><ShoppingBag size={20}/> Economy — Coins & Rewards (Phase E)</h2>
        {economyError ? (
          <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">{economyError}</p>
        ) : economyOverview ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <p className="text-xs text-slate-400">إجمالي منح Coins</p>
                <p className="text-2xl font-bold">{economyOverview.totalEarns}</p>
                <p className="text-xs text-slate-500">source_type=earn</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <p className="text-xs text-slate-400">منح 24h</p>
                <p className="text-2xl font-bold">{economyOverview.earns24h}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <p className="text-xs text-slate-400">المحافظ</p>
                <p className="text-2xl font-bold">{economyOverview.wallets}</p>
                <p className="text-xs text-slate-500">coin_wallets</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <p className="text-xs text-slate-400">المشتريات 24h</p>
                <p className="text-2xl font-bold">{economyOverview.purchases24h}</p>
                <p className="text-xs text-slate-500">purchase/store_purchase</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <p className="text-xs text-slate-400">إجمالي مصدر (sum earn)</p>
                <p className="text-lg font-bold">{economyOverview.totalCoinsIssued} 🪙</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <p className="text-xs text-slate-400">إجمالي إنفاق (sum spend)</p>
                <p className="text-lg font-bold">{economyOverview.totalCoinsSpent} 🪙</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <p className="text-xs text-slate-400">daily_login 24h</p>
                <p className="text-lg font-bold">{economyOverview.dailyLogin24h}</p>
                <p className="text-xs text-slate-500">5 🪙 (حالي) — spec 10 🪙 BLOCKED</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <p className="text-xs text-slate-400">مذاكرة (day_done 24h)</p>
                <p className="text-lg font-bold">{economyOverview.dayDone24h}</p>
                <p className="text-xs text-slate-500">+ streak {economyOverview.streak24h}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <p className="text-xs text-slate-400">عجلة الحظ (spins 24h)</p>
                <p className="text-lg font-bold">{economyOverview.wheel24h} / {economyOverview.wheelTotal}</p>
                <p className="text-xs text-slate-500">{economyOverview.wheelCoins} 🪙 إجمالي</p>
              </div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex gap-2">
              <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5"/>
              <div className="text-xs text-amber-300">
                <p className="font-bold">BLOCKED — Signup 20 Coins + Daily 10 Coins</p>
                <p className="text-amber-200/70">الحالي: daily_login=5 (live). المطلوب 10 → يحتاج UPDATE coin_source_rules. Signup 20 → يحتاج INSERT signup_reward + trigger. الملف: db/economy-phase-e-blocked-signup-daily.sql — لا تُشغّل بدون موافقة.</p>
              </div>
            </div>
            <p className="text-xs text-slate-500">Coins ↔ AI Credits مفصولان: AI يستخدم ai_credit_ledger (reserve_ai_credit), المتجر يستخدم coin_ledger (award_coins/purchase_item). شراء AI Credits بالـ Coins يتم فقط عبر useful.* (ذري: خصم + منح في نفس المعاملة). العجلة: Coins فقط — لا AI Credits.</p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">جاري التحميل...</p>
        )}
      </section>

      {/* 2. قسم المالك المباشر (Owner Exclusive) */}
      {isOwner && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section className="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-lg">
              <Key size={20} />
              <h2>تعيين أدمن جديد (Owner Only)</h2>
            </div>
            <p className="text-xs text-slate-400">
              أدخل البريد الإلكتروني للمستخدم لمنحه صلاحيات الأدمن على المنصة.
            </p>
            <form action="/api/admin/manage-roles" method="POST" className="space-y-3 pt-2">
              <input type="hidden" name="action" value="grant" />
              <input
                type="email"
                name="email"
                placeholder="email@example.com"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-400"
                required
              />
              <button
                type="submit"
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition"
              >
                <UserPlus size={16} /> منح صلاحية Admin
              </button>
            </form>
          </section>
          <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2 text-slate-200">
              <Users size={20} className="text-blue-400" /> فريق الأدمنز المعتمد
            </h2>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {adminsList && (adminsList as any[]).length > 0 ? (
                (adminsList as any[]).map((item: any) => (
                  <div key={item.user_id} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 text-xs">
                    <div>
                      <p className="font-mono text-slate-300">{item.user_id}</p>
                      <span className="text-[10px] text-amber-400 font-bold uppercase">{item.role || "admin"}</span>
                    </div>
                    {item.role !== "owner" && (
                      <form action="/api/admin/manage-roles" method="POST">
                        <input type="hidden" name="action" value="revoke" />
                        <input type="hidden" name="userId" value={item.user_id} />
                        <button type="submit" className="text-rose-400 hover:text-rose-300 font-bold px-2 py-1 rounded bg-rose-500/10">سحب</button>
                      </form>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">لا يوجد أدمنز آخرون مضافون حالياً.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {/* 3. شحن الرصيد الفوري للطلاب */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2 text-emerald-400 font-bold text-lg">
          <Zap size={22} />
          <h2>شحن AI Credits للطلاب يدويًا</h2>
        </div>
        <p className="text-xs text-slate-400">
          يمكنك إضافة رصيد مجاني لأي طالب فوراً عبر إضافة الـ User ID الخاص به. (Server-side, Admin-only, audited via ledger reason=admin_grant)
        </p>
        <form action="/api/admin/add-credits" method="POST" className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <input
            type="text"
            name="targetUserId"
            placeholder="User UUID (مثال: 6947e446-1a6a...)"
            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-400 font-mono"
            required
          />
          <input
            type="number"
            name="amount"
            placeholder="عدد الـ Credits (مثال: 50)"
            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-400"
            min="1"
            required
          />
          <button
            type="submit"
            className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition"
          >
            <Zap size={16} /> إرسال الرصيد
          </button>
        </form>
      </section>

      {/* D6 User AI Controls */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2 text-slate-200"><UserSearch size={20} className="text-purple-400"/> User AI Controls — بحث ومراقبة</h2>
        <p className="text-xs text-slate-400">أدخل User ID أو Email لعرض حالة الـ Rate Limit والرصيد والـ Entitlements. (Server-side, Admin-only)</p>
        <UserAiLookup />
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex gap-2">
          <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5"/>
          <div className="text-xs text-amber-300">
            <p className="font-bold"> NOT IMPLEMENTED — Disable AI / Bonus AI Credits per-user override</p>
            <p className="text-amber-200/70">لا يوجد persistence مخصص لـ disable AI أو temporary bonus limits. يتطلب تصميم جدول/حقل جديد (مثل user_ai_overrides) — موثق كـ FUTURE.</p>
          </div>
        </div>
      </section>

      {/* 4. متابعة سجلات الذكاء الاصطناعي الحية (AI Telemetry Logs) */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2 text-slate-200">
            <Activity size={20} className="text-purple-400" /> أحدث عمليات توليد الـ AI (Logs)
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs text-slate-400">
            <thead className="bg-slate-800/80 text-slate-300 font-bold border-b border-slate-700">
              <tr>
                <th className="p-3">المستخدم</th>
                <th className="p-3">الـ Agent المستعمل</th>
                <th className="p-3">المزود (Provider)</th>
                <th className="p-3">التاريخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {recentAiLogs && (recentAiLogs as any[]).length > 0 ? (
                (recentAiLogs as any[]).map((log: any) => (
                  <tr key={log.id} className="hover:bg-slate-800/40">
                    <td className="p-3 font-mono text-slate-300">{log.user_id?.substring(0, 8)}...</td>
                    <td className="p-3 text-emerald-400 font-bold">{log.agent || "Magic Tutor"}</td>
                    <td className="p-3 text-blue-400">{log.provider || "Groq"}</td>
                    <td className="p-3">{new Date(log.created_at).toLocaleString("ar-EG")}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-slate-500">لا توجد سجلات AI مسجلة حتى الآن.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* D10 System Status + D8 Guest + D12 Audit */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2 text-slate-200"><Server size={20} className="text-slate-400"/> System Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <p className="text-xs text-slate-400">Provider Routing</p>
            <p className="text-sm font-bold text-emerald-400">نشط — Groq / NVIDIA / OpenRouter / Gemini</p>
            <p className="text-xs text-slate-500">Health: via isModelSelectable + freeEndpoint</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <p className="text-xs text-slate-400">Guest Abuse Limitation</p>
            <p className="text-sm font-bold text-amber-400">معروف — anon جديد = هوية جديدة</p>
            <p className="text-xs text-slate-500">موثق في Phase C — لا IP tracking</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <p className="text-xs text-slate-400">Audit Logging</p>
            <p className="text-sm font-bold text-rose-400">NOT AVAILABLE</p>
            <p className="text-xs text-slate-500">لا جدول audit — نعتمد على ai_credit_ledger فقط</p>
          </div>
        </div>
        <p className="text-xs text-slate-500">لا يتم عرض API keys / secrets / tokens — Admin لا يعني كشف الأسرار.</p>
      </section>

      {/* Phase 4.9 / 4.10 — Plans & Billing Controls (functional, server-side) */}
      <section className="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-6 shadow-xl space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2 text-amber-200"><Shield size={20} className="text-amber-400"/> الخطط وال cobranة</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-800 rounded-xl p-4 border border-amber-700/30">
            <p className="text-xs text-slate-400">الفترة المجانية</p>
            <p className="text-sm font-bold text-amber-300">مفعّلة (من app_settings)</p>
            <p className="text-xs text-slate-500">Can toggle via server action — persisted</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-amber-700/30">
            <p className="text-xs text-slate-400">الدفع / الاشتراك</p>
            <p className="text-sm font-bold text-amber-300">معطّل (من app_settings)</p>
            <p className="text-xs text-slate-500">Manual activation only — no Stripe/checkout</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-amber-700/30">
            <p className="text-xs text-slate-400">الصلاحية (Premium)</p>
            <p className="text-sm font-bold text-emerald-400">نظام موجود — has_entitlement()</p>
            <p className="text-xs text-slate-500">Admin can grant via service-role (secure)</p>
          </div>
        </div>
      </section>
    </div>
  );
}
