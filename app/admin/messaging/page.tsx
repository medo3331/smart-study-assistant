import { requireAdminPermission } from "@/lib/admin/auth-check";
import { AdminPageHeader, AdminCard, AdminNotice } from "@/components/admin/ui";
import { sendAdminMessage } from "@/app/admin/actions/messaging";

export default async function AdminMessagingPage() {
  await requireAdminPermission("users.read");
  return (
    <div className="space-y-6">
      <AdminPageHeader title="الرسائل والإعلانات" subtitle="إرسال رسائل/إعلانات للمستخدمين" badge="messaging" permissionKey="users.read" />
      <AdminCard title="إرسال رسالة" tone="amber">
        <form action={async (fd: FormData) => {
          "use server";
          await sendAdminMessage({
            subject: String(fd.get("subject") || ""),
            body: String(fd.get("body") || ""),
            targetUserId: String(fd.get("target_user_id") || "") || null,
            sendEmail: fd.get("send_email") === "on",
          });
        }}>
          <div className="space-y-3">
            <input name="subject" placeholder="الموضوع" className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-sm" />
            <textarea name="body" placeholder="النص" className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-sm" rows={6} />
            <input name="target_user_id" placeholder="UUID المستخدم (اختياري - للإرسال لمستخدم واحد)" className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-sm" />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" name="send_email" /> إرسال بريد إلكتروني (Resend)
            </label>
            <button type="submit" className="rounded bg-amber-600 px-4 py-2 text-sm font-bold text-white">إرسال</button>
          </div>
        </form>
      </AdminCard>
      <AdminNotice tone="default">تتطلب RESEND_API_KEY و RESEND_FROM_EMAIL للبريد. سجل الإرسال في email_deliveries.</AdminNotice>
    </div>
  );
}
