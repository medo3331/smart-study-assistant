import Link from "next/link";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import { isPgConfigured, pgQuery } from "@/lib/admin/pg";
import { AdminCard, AdminNotice, AdminPageHeader, AdminTableWrap } from "@/components/admin/ui";

type ProfileRow = { id: string; display_name: string | null; email: string | null; public_user_code: string | null; created_at: string | null; is_premium: boolean; is_trial: boolean };
type CountRow = { user_id: string; total: string; ok: string; fail: string };

export default async function AdminUsersAnalyticsPage() {
  await requireAdminPermission("users.read");

  let profiles: ProfileRow[] = [];
  let counts: Record<string, { total: number; ok: number; fail: number }> = {};

  if (isPgConfigured()) {
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
    } catch {}
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
    } catch {}
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
        {rows.length === 0 ? (
          <AdminNotice>لا توجد بيانات.</AdminNotice>
        ) : (
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
        )}
      </AdminCard>
      {!isPgConfigured() ? <AdminNotice tone="amber">DATABASE_URL غير متاح — لا توجد بيانات.</AdminNotice> : null}
      <AdminNotice tone="default">
        <Link href="/admin/users" className="underline hover:text-amber-300">العودة إلى إدارة المستخدمين</Link>
      </AdminNotice>
    </div>
  );
}

