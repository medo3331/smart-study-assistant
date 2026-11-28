import { requireAdminPermission } from "@/lib/admin/auth-check";
import { AdminPageHeader, AdminCard, AdminNotice } from "@/components/admin/ui";
import { sendBroadcast, listAllNotifications, deleteNotification } from "@/app/admin/actions/notifications-manage";

export default async function AdminAnnouncementsPage() {
  const { user } = await requireAdminPermission("announcements.manage");
  const { data } = await listAllNotifications();

  async function action(formData: FormData) {
    "use server";
    await sendBroadcast(
      String(formData.get("title") ?? ""),
      String(formData.get("message") ?? ""),
      String(formData.get("type") ?? "info"),
      String(formData.get("target") ?? "").trim() || null,
      String(formData.get("audience") ?? "all")
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title="الإعلانات والإشعارات" subtitle="إرسال إشعارات عامة أو موجهة" badge="announcements.manage" permissionKey="announcements.manage" />
      <AdminCard title="إرسال إشعار جديد" tone="default">
        <form action={action} className="space-y-3">
          <input name="title" placeholder="العنوان" required className="w-full rounded bg-slate-800 p-2 text-sm" />
          <textarea name="message" placeholder="الرسالة" required rows={3} className="w-full rounded bg-slate-800 p-2 text-sm" />
          <div className="grid gap-3 sm:grid-cols-3">
            <select name="type" className="rounded bg-slate-800 p-2 text-sm">
              <option value="info">معلومة</option>
              <option value="warning">تحذير</option>
              <option value="feature">ميزة جديدة</option>
            </select>
            <select name="audience" className="rounded bg-slate-800 p-2 text-sm">
              <option value="all">كل الحسابات</option>
              <option value="student">الطلاب</option>
              <option value="graduate">الخريجون</option>
              <option value="freelancer">المستقلون</option>
            </select>
            <input name="target" placeholder="UUID لحساب واحد (اختياري)" className="rounded bg-slate-800 p-2 text-sm" />
          </div>
          <p className="text-xs text-slate-400">بدون UUID يُرسل الإشعار إلى كل ملفات الحسابات المطابقة، على دفعات محفوظة في سجل الإشعارات. اختيار جمهور محدد يعتمد على persona المحفوظة.</p>
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
