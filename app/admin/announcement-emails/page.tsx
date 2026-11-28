import { requireAdminPermission } from "@/lib/admin/auth-check";
import AnnouncementEmailCampaignsAdmin from "@/components/admin/AnnouncementEmailCampaignsAdmin";
import { AdminNotice } from "@/components/admin/ui";

export default async function Page() {
  await requireAdminPermission("announcements.manage");

  const hasKey = !!process.env.RESEND_API_KEY?.trim();
  const hasSender = !!(
    process.env.FEEDBACK_EMAIL_FROM?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.RESEND_FROM?.trim()
  );

  return (
    <div className="space-y-6">
      {!hasKey || !hasSender ? (
        <AdminNotice tone="rose" title="إعدادات البريد ناقصة — الإرسال هيفشل">
          {!hasKey ? (
            <>
              <code>RESEND_API_KEY</code> غير موجود في متغيرات البيئة. أضفه من إعدادات الاستضافة (Vercel → Settings → Environment Variables) ثم أعد النشر.
              <br />
            </>
          ) : null}
          {!hasSender ? (
            <>
              بريد المُرسل غير مضبوط. أي من: <code>RESEND_FROM_EMAIL</code> في البيئة، أو حقل «بريد المُرسل» في الحملة تحت، أو مفتاح <code>email_sender_address</code> في <code>app_settings</code>.
              <br />
            </>
          ) : null}
          بريد المُرسل لازم يكون دومين مُفعّل في حساب Resend (Domains → Verify).
        </AdminNotice>
      ) : null}
      <AnnouncementEmailCampaignsAdmin />
    </div>
  );
}
