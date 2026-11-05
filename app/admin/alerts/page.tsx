import { requireAdminPermission } from "@/lib/admin/auth-check";
import { createServiceClient } from "@/lib/supabase/admin";
import { AdminCard, AdminNotice, AdminPageHeader, AdminTableWrap } from "@/components/admin/ui";

export default async function AdminAlertsPage() {
  await requireAdminPermission("users.read");
  let alerts: any[] = [];
  try {
    const service = createServiceClient();
    const { data } = await service.from("admin_alerts").select("*").order("last_seen_at", { ascending: false }).limit(100);
    alerts = data || [];
  } catch {}
  return (
    <div className="space-y-6">
      <AdminPageHeader title="التنبيهات" subtitle="مراقبة تلقائية (تتطلب scheduler لـ /api/admin/alerts/evaluate)" badge="alerts" permissionKey="users.read" />
      <AdminCard title="التنبيهات" tone="default">
        <AdminTableWrap>
          <table className="w-full text-sm">
            <thead><tr><th>عنوان</th><th>التصنيف</th><th>الشدّة</th><th>المزود</th><th>الحالة</th><th>آخر ظهور</th></tr></thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td>{a.title}</td>
                  <td>{a.category}</td>
                  <td>{a.severity}</td>
                  <td>{a.provider || "-"}</td>
                  <td>{a.status}</td>
                  <td>{new Date(a.last_seen_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableWrap>
        {alerts.length === 0 ? <p className="text-sm text-slate-500 mt-2">لا توجد تنبيهات.</p> : null}
      </AdminCard>
      <AdminNotice tone="amber">Scheduler غير مُعد — استدعِ POST /api/admin/alerts/evaluate مع x-alert-secret يدويًا أو عبر cron.</AdminNotice>
    </div>
  );
}
