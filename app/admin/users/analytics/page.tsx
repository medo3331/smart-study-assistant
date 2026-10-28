import Link from "next/link";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import { createServiceClient } from "@/lib/supabase/admin";
import { AdminCard, AdminNotice, AdminPageHeader, AdminTableWrap } from "@/components/admin/ui";

export default async function AdminUsersAnalyticsPage() {
  await requireAdminPermission("users.read");
  const privileged = createServiceClient();

  const [{ data: profiles }, { data: ops }] = await Promise.all([
    privileged.from("profiles").select("id, display_name, email, public_user_code, created_at, entitlements(kind, value, metadata)").limit(100),
    privileged.from("ai_operations").select("user_id, status").limit(5000),
  ]);

  // enrich emails
  let emailMap: Record<string, string> = {};
  try {
    const { data: listData } = await privileged.auth.admin.listUsers();
    for (const u of listData?.users ?? []) if (u.email) emailMap[u.id] = u.email;
  } catch {}

  const counts: Record<string, { total: number; ok: number; fail: number }> = {};
  for (const o of ops ?? []) {
    const id = (o as any).user_id;
    if (!id) continue;
    if (!counts[id]) counts[id] = { total: 0, ok: 0, fail: 0 };
    counts[id].total++;
    if ((o as any).status === "completed") counts[id].ok++;
    else counts[id].fail++;
  }

  const rows = (profiles ?? []).map((p: any) => {
    const ents = p.entitlements as any[] | undefined;
    const isTrial = !!ents?.some?.((e) => e.kind === "plan" && e.metadata?.source === "premium_trial_0_5");
    const hasPremium = !!ents?.some?.((e) => e.kind === "plan" && e.value === "premium");
    const c = counts[p.id] ?? { total: 0, ok: 0, fail: 0 };
    return {
      id: p.id,
      name: p.display_name?.trim() || `مستخدم #${p.id.slice(0, 6)}`,
      email: p.email || emailMap[p.id] || "—",
      code: p.public_user_code || "—",
      plan: hasPremium ? (isTrial ? "تجربة" : "Premium") : "مجاني",
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
      <AdminNotice tone="default">
        <Link href="/admin/users" className="underline hover:text-amber-300">العودة إلى إدارة المستخدمين</Link>
      </AdminNotice>
    </div>
  );
}
