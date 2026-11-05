import { requireAdminPermission } from "@/lib/admin/auth-check";
import { AdminPageHeader, AdminCard, AdminNotice } from "@/components/admin/ui";
import { sendBroadcast, listAllNotifications, deleteNotification } from "@/app/admin/actions/notifications-manage";

export default async function AdminAnnouncementsPage() {
  const { user } = await requireAdminPermission("plans.manage");
  const { data } = await listAllNotifications();

  async function action(formData: FormData) {
    "use server";
    await sendBroadcast(
      String(formData.get("title") ?? ""),
      String(formData.get("message") ?? ""),
      String(formData.get("type") ?? "info"),
      String(formData.get("target") ?? "") || null
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title="الإعلانات والإشعارات" subtitle="إرسال إشعارات عامة أو موجهة" badge="plans.manage" permissionKey="plans.manage" />
      <AdminCard title="إرسال إشعار جديد" tone="default">
        <form action={action} className="space-y-3">
          <input name="title" placeholder="العنوان" required className="w-full rounded bg-slate-800 p-2 text-sm" />
          <textarea name="message" placeholder="الرسالة" required rows={3} className="w-full rounded bg-slate-800 p-2 text-sm" />
          <div className="flex gap-3">
            <select name="type" className="rounded bg-slate-800 p-2 text-sm">
              <option value="info">info</option>
              <option value="warning">warning</option>
              <option value="feature">feature</option>
            </select>
            <input name="target" placeholder="user_id (اختياري)" className="flex-1 rounded bg-slate-800 p-2 text-sm" />
          </div>
          <button type="submit" className="rounded bg-marker px-4 py-2 text-sm font-bold text-[var(--on-marker)]">إرسال</button>
        </form>
      </AdminCard>

      <AdminCard title="آخر الإشعارات" tone="default">
        <ul className="space-y-2">
          {data.map((n: any) => (
            <li key={n.id} className="flex items-center justify-between rounded bg-slate-800 p-2 text-sm">
              <div>
                <span className="font-bold">{n.title}</span> — {n.message} <span className="text-xs text-slate-400">({n.type})</span>
              </div>
              <form action={async () => { "use server"; await deleteNotification(n.id); }}>
                <button type="submit" className="text-xs text-rose-400">حذف</button>
              </form>
            </li>
          ))}
        </ul>
      </AdminCard>
    </div>
  );
}
