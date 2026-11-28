import { requireAdminPermission } from "@/lib/admin/auth-check";
import { AdminPageHeader, AdminCard, AdminNotice } from "@/components/admin/ui";
import MessagingComposer from "@/components/admin/MessagingComposer";

export default async function AdminMessagingPage() {
  await requireAdminPermission("announcements.manage");
  return (
    <div className="space-y-6">
      <AdminPageHeader title="الرسائل والإعلانات" subtitle="رسالة لكل المستخدمين أو لمستخدم محدد — داخل المنصة وبالبريد" badge="announcements.manage" permissionKey="announcements.manage" />
      <AdminCard title="إرسال رسالة" tone="amber">
        <MessagingComposer />
      </AdminCard>
      <AdminNotice tone="default">
        الرسالة تصل دائمًا لصندوق المستخدم داخل المنصة. البريد الإلكتروني يحتاج RESEND_API_KEY وبريد مُرسل صالح (RESEND_FROM_EMAIL أو app_settings.email_sender_address). سجل الإرسال في email_deliveries — وللحملات البريدية الكبيرة استخدم صفحة «إرسال إعلان بالبريد».
      </AdminNotice>
    </div>
  );
}
