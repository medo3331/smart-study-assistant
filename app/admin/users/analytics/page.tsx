import Link from "next/link";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import { isPgConfigured, pgQuery } from "@/lib/admin/pg";
import { createServiceClient } from "@/lib/supabase/admin";
import { AdminCard, AdminNotice, AdminPageHeader, AdminTableWrap } from "@/components/admin/ui";

type ProfileRow = { id: string; display_name: string | null; email: string | null; public_user_code: string | null; created_at: string | null; is_premium: boolean; is_trial: boolean };
type CountRow = { user_id: string; total: string; ok: string; fail: string };

export default async function AdminUsersAnalyticsPage() {
  await requireAdminPermission("users.read");

  let profiles: ProfileRow[] = [];
  let counts: Record<string, { total: number; ok: number; fail: number }> = {};
  let dbError: string | null = null;

  const hasPg = isPgConfigured();
  const hasService = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
  if (!hasPg && !hasService) {
    dbError = "No database access (set SUPABASE_SECRET_KEY or DATABASE_URL in Vercel)";
  } else if (hasPg) {
    try {
      profiles = await pgQuery<ProfileRow>(`
        SELECT p.id::text AS id,
               p.display_name,
               p.email,
               p.public_user_code,
               p.created_at::text AS created_at,
               EXISTS (SELECT 1 FROM public.entitlements e WHERE e.user_id=p.id AND e.kind='plan' AND e.value='premium' AND (e.expires_at IS NULL OR e.expires_at > now())) AS is_premium,
               EXISTS (SELECT 1 FROM public.entitlements e WHERE e.user_id=p.id AND e.kind='plan' AND e.metadata->>'source'='premium_trial_0_5' AND (e.expires_at IS NULL OR e.expires_at > now())) AS is_trial
        FROM public.profiles p
        ORDER BY p.created_at DESC NULLS LAST
        LIMIT 100
      `);
    } catch (e: any) {
      dbError = e?.message || "profiles query failed";
    }
    if (!dbError) {
      try {
        const c = await pgQuery<CountRow>(`
          SELECT user_id::text AS user_id,
                 count(*)::text AS total,
                 count(*) FILTER (WHERE status='completed')::text AS ok,
                 count(*) FILTER (WHERE status IS DISTINCT FROM 'completed')::text AS fail
          FROM public.ai_operations
          WHERE user_id IS NOT NULL
          GROUP BY user_id
        `);
        for (const row of c) {
          counts[row.user_id] = { total: parseInt(row.total, 10), ok: parseInt(row.ok, 10), fail: parseInt(row.fail, 10) };
        }
      } catch (e: any) {
        if (!dbError) dbError = e?.message || "ai_operations query failed";
      }
    }
  } else {
    try {
      const supabase = createServiceClient();
      const { data: profData, error: profErr } = await supabase
        .from("profiles")
        .select("id, display_name, email, public_user_code, created_at")
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(100);
      if (profErr) throw profErr;
      const ids = (profData ?? []).map((p: any) => p.id);
      let ents: any[] = [];
      if (ids.length) {
        const { data: entData, error: entErr } = await supabase
          .from("entitlements")
          .select("user_id, kind, value, expires_at, metadata")
          .in("user_id", ids);
        if (entErr) throw entErr;
        ents = entData ?? [];
      }
      const now = Date.now();
      const premiumSet = new Set<string>();
      const trialSet = new Set<string>();
      for (const e of ents) {
        if (e.kind !== "plan") continue;
        if (e.expires_at && new Date(e.expires_at).getTime() <= now) continue;
        if (e.value === "premium") premiumSet.add(String(e.user_id));
        if (e.value === "premium" && (e.metadata?.source === "premium_trial_0_5")) trialSet.add(String(e.user_id));
      }
      profiles = (profData ?? []).map((p: any) => ({
        id: String(p.id),
        display_name: p.display_name ?? null,
        email: p.email ?? null,
        public_user_code: p.public_user_code ?? null,
        created_at: p.created_at ?? null,
        is_premium: premiumSet.has(String(p.id)),
        is_trial: trialSet.has(String(p.id)),
      }));
      const { data: opsData, error: opsErr } = await supabase
        .from("ai_operations")
        .select("user_id, status")
        .not("user_id", "is", null)
        .limit(100000);
      if (opsErr) throw opsErr;
      for (const r of opsData ?? []) {
        const uid = String(r.user_id);
        if (!counts[uid]) counts[uid] = { total: 0, ok: 0, fail: 0 };
        counts[uid].total++;
        if (r.status === "completed") counts[uid].ok++;
        else counts[uid].fail++;
      }
    } catch (e: any) {
      dbError = e?.message || "service client query failed";
    }
  }

  const rows = profiles.map((p) => {
    const c = counts[p.id] ?? { total: 0, ok: 0, fail: 0 };
    return {
      id: p.id,
      name: p.display_name?.trim() || `مستخدم #${p.id.slice(0, 6)}`,
      email: p.email || "—",
      code: p.public_user_code || "—",
      plan: p.is_premium ? (p.is_trial ? "تجربة" : "Premium") : "مجاني",
      aiTotal: c.total,
      aiOk: c.ok,
      aiFail: c.fail,
      created: p.created_at ? new Date(p.created_at).toLocaleDateString("ar-EG") : "—",
    };
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader title="تحليلات المستخدمين" subtitle="اسم، إيميل، حالة الاشتراك، وعدد عمليات AI (من ai_operations)." badge="users.read" />
      <AdminCard title="جميع المستخدمين (حتى 100)" tone="purple">
        {dbError ? <AdminNotice tone="rose">خطأ في جلب البيانات: {dbError}</AdminNotice> : null}
        {rows.length === 0 && !dbError ? (
          <AdminNotice>لا توجد بيانات.</AdminNotice>
        ) : rows.length > 0 ? (
          <AdminTableWrap>
            <thead>
              <tr className="bg-slate-950/60 text-slate-400 text-[11px]">
                <th className="p-3 text-right">المستخدم</th>
                <th className="p-3 text-right">البريد</th>
                <th className="p-3 text-right">الكود</th>
                <th className="p-3 text-right">الباقة</th>
                <th className="p-3 text-right">عمليات AI</th>
                <th className="p-3 text-right">ناجحة</th>
                <th className="p-3 text-right">فاشلة</th>
                <th className="p-3 text-right">التسجيل</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                  <td className="p-3 font-semibold text-slate-200">{r.name}</td>
                  <td className="p-3 text-slate-400" dir="ltr">{r.email}</td>
                  <td className="p-3 text-slate-500 text-[11px]" dir="ltr">{r.code}</td>
                  <td className="p-3">
                    <span className={"px-2 py-1 rounded-lg text-[11px] font-bold " + (r.plan === "مجاني" ? "bg-slate-800 text-slate-400" : "bg-purple-500/10 text-purple-300")}>{r.plan}</span>
                  </td>
                  <td className="p-3 text-slate-300">{r.aiTotal}</td>
                  <td className="p-3 text-emerald-300">{r.aiOk}</td>
                  <td className="p-3 text-rose-300">{r.aiFail}</td>
                  <td className="p-3 text-slate-500 text-[11px]">{r.created}</td>
                </tr>
              ))}
            </tbody>
          </AdminTableWrap>
        ) : null}
      </AdminCard>
      {!hasPg && !hasService ? <AdminNotice tone="amber">DATABASE_URL غير متاح — لا توجد بيانات.</AdminNotice> : null}
      <AdminNotice tone="default">
        <Link href="/admin/users" className="underline hover:text-amber-300">العودة إلى إدارة المستخدمين</Link>
      </AdminNotice>
    </div>
  );
}

