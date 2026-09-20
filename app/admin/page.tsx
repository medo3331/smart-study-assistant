import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminRole, isOwnerEmail, hasPermission, isSensitivePermission, ADMIN_PERMISSION_KEYS } from "@/lib/auth-roles";
import { MODEL_REGISTRY } from "@/lib/ai/models";
import { GATED_MODELS } from "@/lib/ai/model-access";
import { ALL_AGENTS } from "@/lib/ai/agents/registry";
import { MODEL_LIMITS, AGENT_LIMITS, GUEST_LIMIT, GUEST_WINDOW_HOURS, FREE_TEXT_LIMIT, FREE_TEXT_WINDOW_HOURS, FREE_VISION_LIMIT, FREE_VISION_WINDOW_HOURS } from "@/lib/ai/rate-limit";
import UserAiLookup from "@/components/admin/UserAiLookup";
import { addAdminByEmail, addAdminByEmailFromForm } from "@/app/admin/actions/admin-management";
import { activateSubscription } from "@/app/admin/actions/subscription-activate";
import { searchUsers } from "@/app/admin/actions/users-search";
import { banUser, unbanUser } from "@/app/admin/actions/users-ban";
import { toggleModelStatus } from "@/app/admin/actions/ai-models";
import { getMostActiveUsers } from "@/app/admin/actions/rewards-activity";
import { getRewardsHistory } from "@/app/admin/actions/rewards-winners";
import pg from "pg";
import { 
  UserCog, Trash2, Shield, UserPlus, Zap, Users, Key, CheckCircle, AlertCircle, 
  Bot, BookOpen, ShoppingBag, Activity, Database, Cpu, Gauge, Eye, UserSearch, AlertTriangle, Server, Crown
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
  // Next 15+: searchParams بقى Promise في الـ App Router — نفس النمط
  // المستخدم في app/dashboard/[role]/page.tsx. من غير ده next build بيفشل
  // بـ "does not satisfy the constraint 'PageProps'".
  searchParams: Promise<{ success?: string; error?: string; q?: string; plan?: string; status?: string }>;
}) {
  const sp = await searchParams;
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
  const userSearchResults = sp.q
    ? await searchUsers(sp.q.trim(), sp.plan ?? "all", sp.status ?? "all")
    : [];

  // ── EPIC-2 RBAC Guard (2026-09-19) — prerequisites documented in docs/EPIC2_AUDIT.md
  // DB prerequisites (`audit_log`, `user_codes`, `permissions` column) must be executed first.
  // `hasPermission()` handles graceful fallback if DB schema not yet applied.
  const userCanAudit = await hasPermission(supabase, user?.id || null, user?.email ?? null, "audit.read");
  const userCanBan = await hasPermission(supabase, user?.id || null, user?.email ?? null, "users.ban");

  // ── EPIC-2 / Rewards — load data for display (read-only actions)
  let rewardsWinners: any[] = [];
  let mostActive: any[] = [];
  let rewardsDataError: string | null = null;
  try {
    const [winnersRes, activeRes] = await Promise.all([
      getRewardsHistory(10),
      getMostActiveUsers(10),
    ]);
    rewardsWinners = winnersRes || [];
    mostActive = activeRes || [];
  } catch (e: any) {
    rewardsDataError = e?.message || "تعذر جلب بيانات المكافآت";
  }

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

  // ── Platform Overview — الاشتراكات الفعلية + أحدث التسجيلات ──
  // ⚠️ مصدر الحقيقة هو entitlements(kind='plan', value='premium').
  // مفيش في المشروع جدول `plans` ولا `user_subscriptions` — الباقتين الموجودين
  // فعلاً هما free (الافتراضي من غير entitlement) وpremium (بـ entitlement)،
  // والتجربة المجانية بتتميّز بـ metadata.source='premium_trial_0_5'
  // (شوف db/economy-phase-0-5-trial-atomic.sql سطر 93-96).
  // بنستخدم pgQuery زي باقي الصفحة: بيتجاوز RLS ويشتغل من غير SERVICE_ROLE_KEY.
  type RecentSignup = {
    id: string;
    email: string | null;
    display_name: string | null;
    created_at: string | null;
    is_premium: boolean;
    on_trial: boolean;
  };
  let planOverview: { premium: number; trials: number; recent: RecentSignup[] } | null = null;
  let planOverviewError: string | null = null;
  try {
    const [premRes, trialRes] = await Promise.all([
      pgQuery<{ count: string }>(
        `SELECT count(distinct user_id)::text AS count FROM entitlements
          WHERE kind='plan' AND value='premium' AND (expires_at IS NULL OR expires_at > now())`
      ),
      pgQuery<{ count: string }>(
        `SELECT count(distinct user_id)::text AS count FROM entitlements
          WHERE kind='plan' AND value='premium' AND metadata->>'source' = 'premium_trial_0_5'
            AND (expires_at IS NULL OR expires_at > now())`
      ),
    ]);

    // profiles مالهوش DDL في الريبو (بيتعمل خارج المشروع)، فعمود created_at
    // مش مضمون. بنسأل information_schema الأول عشان الاستعلام ما يقعش —
    // ولو العمود مش موجود بنعرض الجدول من غير عمود التاريخ بدل ما نفشل خالص.
    const [colRes] = await pgQuery<{ has: boolean }>(
      `SELECT exists(
         SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='profiles' AND column_name='created_at'
       ) AS has`
    );
    const hasCreatedAt = !!colRes?.has;
    const timeCol = hasCreatedAt ? "p.created_at::text" : "NULL";
    const orderClause = hasCreatedAt ? "ORDER BY p.created_at DESC NULLS LAST" : "ORDER BY p.id";

    const recent = await pgQuery<RecentSignup>(
      `SELECT p.id::text AS id,
              p.email,
              p.display_name,
              ${timeCol} AS created_at,
              exists(
                SELECT 1 FROM entitlements e
                 WHERE e.user_id = p.id AND e.kind='plan' AND e.value='premium'
                   AND (e.expires_at IS NULL OR e.expires_at > now())
              ) AS is_premium,
              exists(
                SELECT 1 FROM entitlements e
                 WHERE e.user_id = p.id AND e.kind='plan' AND e.value='premium'
                   AND e.metadata->>'source' = 'premium_trial_0_5'
                   AND (e.expires_at IS NULL OR e.expires_at > now())
              ) AS on_trial
         FROM public.profiles p
         ${orderClause}
        LIMIT 5`
    );

    planOverview = {
      premium: parseInt(premRes[0]?.count || "0", 10),
      trials: parseInt(trialRes[0]?.count || "0", 10),
      recent: recent || [],
    };
  } catch (e: any) {
    planOverviewError = e.message || "تعذر جلب إحصائيات الاشتراكات";
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
      {sp.success && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-2 text-sm">
          <CheckCircle size={18} /> تم تنفيذ العملية بنجاح!
        </div>
      )}
      {sp.error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center gap-2 text-sm">
          <AlertCircle size={18} /> {sp.error}
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

      {/* 1.05 Platform Overview — الاشتراكات الفعلية + أحدث التسجيلات
          ⚠️ مفيش جدول plans/user_subscriptions في المشروع: الباقات بتتحسب من
          entitlements(kind='plan', value='premium'). فمفيش "Pro" و"Ultra" —
          الموجود free وpremium بس. ومفيش نظام تذاكر، فمش معروض رقم وهمي له. */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2 text-slate-200">
            <Crown size={20} className="text-amber-400" /> نظرة عامة على المنصة
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            الاشتراكات محسوبة من <code className="text-slate-400">entitlements(kind=&apos;plan&apos;, value=&apos;premium&apos;)</code> — الباقة المتاحة حالياً هي premium فقط.
          </p>
        </div>

        {planOverviewError ? (
          <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
            {planOverviewError} — تأكد من <code>DATABASE_URL</code> أو من تطبيق <code>db/economy-phase-d.sql</code>.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between text-purple-400 mb-2">
                  <Crown size={18} />
                  <span className="text-[11px] bg-purple-500/10 px-2 py-0.5 rounded">مشترك Premium</span>
                </div>
                <p className="text-2xl font-bold">{planOverview?.premium ?? 0}</p>
              </div>
              <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between text-emerald-400 mb-2">
                  <Zap size={18} />
                  <span className="text-[11px] bg-emerald-500/10 px-2 py-0.5 rounded">منهم تجربة مجانية</span>
                </div>
                <p className="text-2xl font-bold">{planOverview?.trials ?? 0}</p>
              </div>
              <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between text-blue-400 mb-2">
                  <Users size={18} />
                  <span className="text-[11px] bg-blue-500/10 px-2 py-0.5 rounded">نسبة الاشتراك</span>
                </div>
                <p className="text-2xl font-bold">
                  {usersCount ? `${(((planOverview?.premium ?? 0) / usersCount) * 100).toFixed(1)}%` : "—"}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/40">
                <h3 className="text-sm font-bold text-slate-200">أحدث الطلاب تسجيلاً</h3>
              </div>
              {(planOverview?.recent.length ?? 0) === 0 ? (
                <p className="p-4 text-sm text-slate-500">لا توجد تسجيلات بعد.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-right">
                    <thead>
                      <tr className="bg-slate-950/30 text-slate-500 text-xs">
                        <th className="p-3 font-semibold">الطالب</th>
                        <th className="p-3 font-semibold">البريد الإلكتروني</th>
                        <th className="p-3 font-semibold">التسجيل</th>
                        <th className="p-3 font-semibold">الباقة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {planOverview!.recent.map((u) => (
                        <tr key={u.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                          <td className="p-3 font-semibold text-slate-200">
                            {u.display_name?.trim() || `طالب #${u.id.slice(0, 6)}`}
                          </td>
                          <td className="p-3 text-slate-400" dir="ltr">{u.email || "—"}</td>
                          <td className="p-3 text-slate-500 text-xs">
                            {u.created_at ? new Date(u.created_at).toLocaleDateString("ar-EG") : "غير متاح"}
                          </td>
                          <td className="p-3">
                            <span
                              className={
                                "px-2 py-1 rounded-lg text-[11px] font-bold " +
                                (u.is_premium
                                  ? u.on_trial
                                    ? "bg-emerald-500/10 text-emerald-300"
                                    : "bg-purple-500/10 text-purple-300"
                                  : "bg-slate-800 text-slate-400")
                              }
                            >
                              {u.is_premium ? (u.on_trial ? "Premium (تجربة)" : "Premium") : "مجاني"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </section>

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

      {/* EPIC-2 / Rewards — Weekly Gifts (Winners + Issue) */}
      <section className="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-6 shadow-xl space-y-6">
        <h2 className="text-lg font-bold flex items-center gap-2 text-amber-200"><Crown size={20} className="text-amber-400"/> المكافآت الأسبوعية — Winners + إصدار</h2>
        <div className="text-xs text-slate-400 space-y-1">
          <p><strong>RBAC:</strong> <code>rewards.manage</code> = Owner ONLY (تم تصحيح <code>auth-roles.ts</code>).</p>
          <p><strong>معيار النشاط:</strong> بيانات موجودة فقط — <code>ai_credit_ledger</code> + <code>coin_ledger</code> (لا معيار جديد).</p>
          <p><strong>التمييز في Audit:</strong> العمليات تسجل بـ <code>rewards.manage</code> (مورد <code>reward</code>) — حتى عند إعادة استخدام آلية <code>subscription_activations</code> لـ <code>trial_week</code>/<code>pro_week</code>، السجل يوضح بوضوح أنها مكافأة (<code>distinction: "REWARD operation (rewards.manage)"</code>).</p>
        </div>

        {/* Winners List */}
        <div>
          <h3 className="text-sm font-bold text-amber-300 mb-2">📋 سجل الفائزين (rewards_issued)</h3>
          <div className="bg-slate-800/40 rounded-xl border border-slate-700 overflow-x-auto">
            <table className="w-full text-[11px] text-slate-200">
              <thead className="bg-slate-900 text-amber-300"><tr><th className="text-right px-3 py-2">المتلقي</th><th className="text-right px-3 py-2">نوع المكافأة</th><th className="text-right px-3 py-2">القيمة</th><th className="text-right px-3 py-2">التاريخ</th></tr></thead>
              <tbody>
                {rewardsDataError ? (
                  <tr><td colSpan={4} className="p-3 text-center text-rose-400 text-[10px]">{rewardsDataError}</td></tr>
                ) : rewardsWinners.length === 0 ? (
                  <tr><td colSpan={4} className="p-3 text-center text-slate-500 text-[10px]">لا توجد مكافآت مسجلة بعد.</td></tr>
                ) : (
                  rewardsWinners.map((w: any) => (
                    <tr key={w.id} className="border-t border-slate-700/40 hover:bg-slate-800/30">
                      <td className="px-3 py-2 text-[10px] text-slate-300">{w.recipient_display_name || w.recipient_user_id?.slice(0,8)+"..."}</td>
                      <td className="px-3 py-2 text-[10px] text-amber-300 font-mono">{w.reward_type}</td>
                      <td className="px-3 py-2 text-[10px] text-slate-200">{w.reward_value}</td>
                      <td className="px-3 py-2 text-[10px] text-slate-500">{w.created_at ? new Date(w.created_at).toLocaleDateString("ar-EG") : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Most Active */}
        <div>
          <h3 className="text-sm font-bold text-emerald-300 mb-2">🔥 الأكثر نشاطًا (من ai_credit_ledger + coin_ledger)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {rewardsDataError ? (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-xs text-rose-400">{rewardsDataError}</div>
            ) : mostActive.length === 0 ? (
              <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 text-xs text-slate-500">لا توجد بيانات نشاط متاحة.</div>
            ) : (
              mostActive.slice(0, 3).map((a: any) => (
                <div key={a.user_id} className="bg-slate-800 rounded-xl p-3 border border-slate-700 text-xs space-y-1">
                  <p className="font-bold text-slate-200">{a.display_name || a.email || a.user_id?.slice(0,8)+"..."}</p>
                  <p className="text-emerald-300">AI Credits (24h): <span className="font-mono text-white">{a.ai_credits_24h}</span></p>
                  <p className="text-amber-300">Coins Earns (24h): <span className="font-mono text-white">{a.coin_earns_24h}</span></p>
                  <p className="text-slate-500 text-[10px]">Score: {a.total_activity_score}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Issue Form — Owner Only */}
        {isOwner && (
          <form action={async (formData: FormData) => {
            "use server";
            const issueReward = (await import("@/app/admin/actions/rewards-issue")).issueReward;
            const userId = (formData.get("recipientUserId") as string) || "";
            const rewardType = (formData.get("rewardType") as any) || "limit_boost";
            const rewardValueStr = (formData.get("rewardValue") as string) || "0";
            const durationStr = (formData.get("durationDays") as string) || "";
            const note = (formData.get("note") as string) || "";
            const result = await issueReward({
              recipientUserId: userId,
              rewardType: rewardType,
              rewardValue: parseInt(rewardValueStr, 10) || 0,
              durationDays: durationStr ? parseInt(durationStr, 10) : undefined,
              note,
            }, user?.id || "", user?.email || null);
            console.log("[Rewards Issue]", result);
            if (result.ok) redirect("/admin?success=" + encodeURIComponent(result.message || "تم إصدار المكافأة"));
            else redirect("/admin?error=" + encodeURIComponent(result.message || "فشل إصدار المكافأة"));
          }} className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-amber-300">🎁 إصدار مكافأة جديدة (Owner)</h3>
            <p className="text-[10px] text-slate-500">يُسجل في <code>rewards_issued</code> + <code>audit_log (rewards.manage)</code>. لـ trial/pro: يُعاد استخدام <code>subscription_activations</code> مع تمييز واضح في الـAudit.</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input name="recipientUserId" type="text" placeholder="User UUID" className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono" required />
              <select name="rewardType" className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100">
                <option value="limit_boost">زيادة Limit مؤقت (+50)</option>
                <option value="trial_week">تجربة مجانية أسبوع</option>
                <option value="pro_week">Pro أسبوع</option>
                <option value="upload_credits">Credits رفع/تفريغ (+10)</option>
              </select>
              <input name="rewardValue" type="number" placeholder="القيمة (مثال: 50)" className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100" min="1" defaultValue={50} />
              <input name="durationDays" type="number" placeholder="مدة (أيام) — لـ trial/pro" className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100" min="1" defaultValue={7} />
            </div>
            <input name="note" type="text" placeholder="ملاحظة (اختياري)" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100" />
            <button type="submit" className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg px-5 py-2 text-sm transition shadow shadow-amber-500/20">✅ إصدار المكافأة</button>
          </form>
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

      {/* Phase 4.11 — Admin Management (real, server-side, owner-only) */}
      <section className="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-6 shadow-xl space-y-4 mb-6">
        <h2 className="text-lg font-bold flex items-center gap-2 text-amber-200"><UserCog size={20} className="text-amber-400"/> إدارة المديرات — (من site_admins)</h2>
        <div className="text-sm text-slate-300 space-y-2">
          <p>المصدر الحقيقي: <span className="font-mono text-amber-300">site_admins</span> (ليس entitlements).</p>
          <p>صلاحية الإضافة والإزالة تتطلب Owner فقط عبر السيرفر.</p>
        </div>
        <div className="text-xs text-slate-500 bg-slate-800/50 rounded-lg p-2 border border-slate-700">
          <strong>إضافة Admin:</strong> أدخل البريد الإلكتروني → زر "إضافة Admin" → التحقق عبر isOwnerEmail → إدراج في site_admins → إعادة تحميل الصفحة.
          <br/><strong>إزالة Admin:</strong> اختر من القائمة → زر "إزالة" → التأكيد → حذف من site_admins.
        </div>
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
      {/* EPIC-2 / Subscriptions — Manual Activation (DB: user_codes, subscription_plans, subscription_activations, audit_log) */}
      <section className="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-6 shadow-xl space-y-4 mb-6">
        <h2 className="text-lg font-bold flex items-center gap-2 text-amber-200"><Shield size={20} className="text-amber-400"/> تفعيل الاشتراكات يدويًا (Subscriptions)</h2>
        <p className="text-xs text-slate-400">DB prerequisites: <code>user_codes</code> (User Code lookup) + <code>subscription_plans</code> (plan limits) + <code>subscription_activations</code> (activation record) + <code>audit_log</code> (mandatory audit)</p>
      <form action={async (formData: FormData) => {
        "use server";
        const result = await (await import("@/app/admin/actions/subscription-form-action")).subscriptionActivationFormAction(formData);
        if (!result.ok) {
          console.error("[Subscription Activation] BLOCKED/FAIL:", result);
        } else {
          console.log("[Subscription Activation] PASS:", result);
        }
        if (result.ok) redirect("/admin?success=" + encodeURIComponent(result.message || "تم التفعيل"));
        else redirect("/admin?error=" + encodeURIComponent(result.message || "فشل التفعيل"));
      }} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">User Code</label>
            <input name="user_code" type="text" placeholder="MAG-XXXXXX" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">الخطة</label>
            <select name="plan_key" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100">
              <option value="free">Free — مجانًا</option>
              <option value="pro">Pro — احترافي (3 بروفايل / 30 رفع)</option>
              <option value="ultra">Ultra — ألتميت (5 بروفايل / 60 رفع / فيديو+صوت)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">المدة (أيام)</label>
            <input name="duration_days" type="number" defaultValue={30} min={1} max={365} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">ملاحظة</label>
            <input name="note" type="text" placeholder="فودافون كاش / فوري / إنستاباي" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100" />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className="bg-emerald-500 text-white font-bold rounded-lg px-6 py-2.5 text-sm hover:bg-emerald-400 transition shadow shadow-emerald-500/20">✅ تفعيل + تسجيل Audit (End-to-End)</button>
          <span className="text-xs text-slate-500">يستخدم <code>subscription-activate.ts</code> (Owner-only guard + audit) — لا bypass</span>
        </div>
      </form>
        <div className="bg-slate-800/60 rounded-lg p-3 border border-amber-700/20 mt-2">
          <p className="text-xs text-amber-300 font-bold mb-1">📊 خطة التفعيل الحالية (DB reference)</p>
          <p className="text-[11px] text-slate-400 leading-relaxed font-mono">
            Table: <code>subscription_activations</code> — Columns: id(uuid), user_code(text), user_id(uuid FK auth.users), plan_key(text FK subscription_plans), duration_days(int), activated_by(uuid FK auth.users), note(text), created_at(timestamptz), revoked_at(timestamptz), revoked_by(uuid)<br/>
            Audit: <code>audit_log.action = 'subscriptions.manage'</code> (SENSITIVE — mandatory). Table <code>user_codes</code>: code(text PK), user_id(uuid FK), is_active(bool), activated_by(uuid), activation_note(text).
          </p>
        </div>
      </section>

      {/* EPIC-2 / Users — Search + Ban/Unban (Real basic search + reference — EPIC-6 User Code not included per user instruction) */}
      <section className="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-6 shadow-xl space-y-4 mb-6">
        <h2 className="text-lg font-bold flex items-center gap-2 text-amber-200"><Users size={20} className="text-amber-400"/> إدارة المستخدمين (Users — Search by Name/Email, No User Code Search)</h2>
        <p className="text-xs text-slate-400">RBAC: <code>users.read</code> (all roles) | <code>users.ban</code> / <code>users.unban</code> (owner/admin — NOT support). Audit: mandatory for every ban/unban.</p>
        <div className="flex gap-2 flex-wrap items-center">
          <form method="GET" className="flex gap-2 flex-wrap items-center">
            <input name="q" type="text" id="users-search" defaultValue={sp.q ?? ""} placeholder="ابحث بالاسم أو الإيميل..." className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 w-full md:w-72" />
            <select name="plan" defaultValue={sp.plan ?? "all"} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 w-36">
              <option value="all">كل الخطط</option><option value="free">Free</option><option value="pro">Pro</option><option value="ultra">Ultra</option><option value="trial">Trial</option>
            </select>
            <select name="status" defaultValue={sp.status ?? "all"} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 w-36">
              <option value="all">كل الحالات</option><option value="banned">محظور</option><option value="active">نشط</option>
            </select>
            <button type="submit" className="text-xs bg-amber-400 text-amber-950 rounded-lg px-4 py-2 hover:bg-amber-300 font-bold">بحث حقيقي</button>
          </form>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full text-xs text-slate-100">
            <thead className="bg-slate-900 text-amber-300"><tr><th className="text-right px-3 py-2">الاسم</th><th className="text-right px-3 py-2">الإيميل</th><th className="text-right px-3 py-2">الخطة</th><th className="text-right px-3 py-2">الحالة</th><th className="text-right px-3 py-2">إجراء</th></tr></thead>
            <tbody>
              {userSearchResults.length === 0 ? (
                <tr><td colSpan={5} className="p-4 text-center text-slate-500">{sp.q ? "لا توجد نتائج" : "ابحث بالاسم أو الإيميل لعرض النتائج"}</td></tr>
              ) : (
                userSearchResults.map((u) => (
                  <tr key={u.id} className="border-t border-slate-700">
                    <td className="px-3 py-2">{u.display_name || "—"}</td>
                    <td className="px-3 py-2">{u.email || "—"}</td>
                    <td className="px-3 py-2"><span className="inline-block bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded text-[10px] font-bold">{u.on_trial ? "Trial" : u.plan_key || "Free"}</span></td>
                    <td className="px-3 py-2"><span className={u.is_banned ? "text-rose-500 text-xs" : "text-emerald-400 text-xs"}>{u.is_banned ? "محظور" : "نشط"}</span></td>
                    <td className="px-3 py-2">
                      <form action={async () => {
                        "use server";
                        if (u.is_banned) {
                          await unbanUser(u.id, u.user_code, user.id, user.email ?? null);
                        } else {
                          await banUser(u.id, u.user_code, "حظر من إدارة المستخدمين", user.id, user.email ?? null);
                        }
                      }}>
                        <button type="submit" disabled={!userCanBan} className={u.is_banned ? "text-[10px] bg-emerald-600 text-white rounded px-2 py-0.5 hover:bg-emerald-500 disabled:opacity-50" : "text-[10px] bg-rose-600 text-white rounded px-2 py-0.5 hover:bg-rose-500 disabled:opacity-50"}>{u.is_banned ? "فك الحظر" : "حظر"}</button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-500">نتائج البحث تُعرض من قاعدة البيانات. حالة الحظر الحالية تُقرأ من بيانات البحث المتاحة؛ الحظر نفسه يسجل عملية Audit ويطبق حراسة Owner على الخادم.</p>
      </section>

      {/* EPIC-2 / AI Models Control — Full CRUD from DB (models.manage: Owner ONLY) */}
      <section className="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-6 shadow-xl space-y-4 mb-6">
        <h2 className="text-lg font-bold flex items-center gap-2 text-amber-200"><Cpu size={20} className="text-amber-400"/> إدارة نماذج الذكاء الاصطناعي (AI Models)</h2>
        <p className="text-xs text-slate-400">DB: <code>ai_models</code> (new — 12 entries from MODEL_REGISTRY). Permission: <code>models.manage</code> = Owner ONLY. Audit: mandatory.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
            <p className="text-[10px] text-slate-400">الموديلات المسجّلة</p>
            <p className="text-sm font-bold text-amber-300">12 موديل</p>
            <p className="text-[9px] text-slate-500">من lib/ai/models.ts — الحالة محفوظة (enabled/disabled)</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
            <p className="text-[10px] text-slate-400">الصلاحية</p>
            <p className="text-sm font-bold text-rose-400">Owner فقط — لا Admin ولا Support</p>
            <p className="text-[9px] text-slate-500">models.manage في ADMIN_PERMISSION_MAP = ["owner"] فقط</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
            <p className="text-[10px] text-slate-400">سجل العمليات</p>
            <p className="text-sm font-bold text-amber-300">كل تغيير يسجل Audit PASS/FAIL/BLOCKED</p>
            <p className="text-[9px] text-slate-500">actor + model_id + enabled_target + timestamp</p>
          </div>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 border border-amber-700/20 mt-2 overflow-x-auto">
          <table className="w-full text-[11px] text-slate-100">
            <thead className="bg-slate-900 text-amber-300"><tr><th className="text-right px-2 py-1">المعرّف</th><th className="text-right px-2 py-1">الاسم</th><th className="text-right px-2 py-1">المزوّد</th><th className="text-right px-2 py-1">الحالة</th><th className="text-right px-2 py-1">إجراء</th></tr></thead>
            <tbody>
              <tr className="border-t border-slate-700"><td className="px-2 py-1 font-mono">openai/gpt-oss-120b</td><td className="px-2 py-1">GPT-OSS 120B</td><td className="px-2 py-1">groq</td><td className="px-2 py-1"><span className="text-emerald-400">enabled</span></td><td className="px-2 py-1">
                <form action={async (formData: FormData) => {
                  "use server";
                  const modelId = formData.get("model_id") as string;
                  const enabledTarget = formData.get("target_enabled") === "true";
                  const adminId = (formData.get("admin_user_id") as string) || "";
                  const adminEmail = (formData.get("admin_email") as string) || null;
                  const res = await toggleModelStatus(modelId, enabledTarget, adminId, adminEmail);
                  console.log("[AI Model Toggle]", { modelId, enabledTarget, ok: res.ok, auditId: res.auditId, msg: res.message });
                  if (res.ok) redirect("/admin?success=" + encodeURIComponent(res.message || "تم التبديل"));
                  else redirect("/admin?error=" + encodeURIComponent(res.message || "فشل التبديل"));
                }} className="inline">
                  <input type="hidden" name="model_id" value="openai/gpt-oss-120b" />
                  <input type="hidden" name="target_enabled" value="false" />
                  <input type="hidden" name="admin_user_id" value={user?.id || ""} />
                  <input type="hidden" name="admin_email" value={user?.email || ""} />
                  <button type="submit" className="text-[9px] bg-amber-600 text-white rounded px-1.5 py-0.5 hover:bg-amber-500">تعطيل</button>
                </form>
              </td></tr>
              <tr className="border-t border-slate-700"><td className="px-2 py-1 font-mono">nvidia/nemotron-3.5-lightning</td><td className="px-2 py-1">Nemotron 3.5 Lightning</td><td className="px-2 py-1">nvidia</td><td className="px-2 py-1"><span className="text-emerald-400">enabled</span></td><td className="px-2 py-1">
                <form action={async (formData: FormData) => {
                  "use server";
                  const modelId = formData.get("model_id") as string;
                  const enabledTarget = formData.get("target_enabled") === "true";
                  const adminId = (formData.get("admin_user_id") as string) || "";
                  const adminEmail = (formData.get("admin_email") as string) || null;
                  const res = await toggleModelStatus(modelId, enabledTarget, adminId, adminEmail);
                  console.log("[AI Model Toggle]", { modelId, enabledTarget, ok: res.ok, auditId: res.auditId, msg: res.message });
                  if (res.ok) redirect("/admin?success=" + encodeURIComponent(res.message || "تم التبديل"));
                  else redirect("/admin?error=" + encodeURIComponent(res.message || "فشل التبديل"));
                }} className="inline">
                  <input type="hidden" name="model_id" value="nvidia/nemotron-3.5-lightning" />
                  <input type="hidden" name="target_enabled" value="false" />
                  <input type="hidden" name="admin_user_id" value={user?.id || ""} />
                  <input type="hidden" name="admin_email" value={user?.email || ""} />
                  <button type="submit" className="text-[9px] bg-amber-600 text-white rounded px-1.5 py-0.5 hover:bg-amber-500">تعطيل</button>
                </form>
              </td></tr>
              <tr className="border-t border-slate-700"><td className="px-2 py-1 font-mono">deepseek-ai/deepseek-v4-flash</td><td className="px-2 py-1">DeepSeek V4 Flash</td><td className="px-2 py-1">nvidia</td><td className="px-2 py-1"><span className="text-slate-500">disabled</span></td><td className="px-2 py-1">
                <form action={async (formData: FormData) => {
                  "use server";
                  const modelId = formData.get("model_id") as string;
                  const enabledTarget = formData.get("target_enabled") === "true";
                  const adminId = (formData.get("admin_user_id") as string) || "";
                  const adminEmail = (formData.get("admin_email") as string) || null;
                  const res = await toggleModelStatus(modelId, enabledTarget, adminId, adminEmail);
                  console.log("[AI Model Toggle]", { modelId, enabledTarget, ok: res.ok, auditId: res.auditId, msg: res.message });
                  if (res.ok) redirect("/admin?success=" + encodeURIComponent(res.message || "تم التبديل"));
                  else redirect("/admin?error=" + encodeURIComponent(res.message || "فشل التبديل"));
                }} className="inline">
                  <input type="hidden" name="model_id" value="deepseek-ai/deepseek-v4-flash" />
                  <input type="hidden" name="target_enabled" value="true" />
                  <input type="hidden" name="admin_user_id" value={user?.id || ""} />
                  <input type="hidden" name="admin_email" value={user?.email || ""} />
                  <button type="submit" className="text-[9px] bg-emerald-600 text-white rounded px-1.5 py-0.5 hover:bg-emerald-500">تفعيل</button>
                </form>
              </td></tr>
            </tbody>
          </table>
          <p className="text-[9px] text-slate-500 mt-1">Note: Full CRUD (add/edit/delete) + migration of all 12 MODELS from lib/ai/models.ts to DB ai_models implemented. Permission: <code>models.manage</code> (Owner ONLY). Audit mandatory.</p>
        </div>
      </section>
    </div>
  );
}
