import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import { AdminCard, AdminNotice, AdminPageHeader } from "@/components/admin/ui";
import AnnouncementsAdmin from "@/components/admin/AnnouncementsAdmin";

export default async function AdminAnnouncementsPage() {
  await requireAdminPermission("announcements.manage");
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="الإعلانات"
        subtitle="إنشاء وتعديل وحذف الإعلانات. جميع التغييرات تُسجَّل في سجل العمليات."
        badge="announcements.manage"
        permissionKey="announcements.manage"
      />
      <AdminCard
        title="ملاحظة حول Audience"
        description="حقل audience (students/staff/all) هو metadata فقط في هذه المرحلة — جميع المستخدمين المسجّلين يرون كل إعلان published نشط. لا يوجد targeting فعلي."
        tone="amber"
      >
        <AdminNotice tone="amber">
          لا تفترض أن الإعلان موجّه فقط إلى فئة محددة. الجدولة (publish/expires) مفروضة من الخادم.
        </AdminNotice>
      </AdminCard>
      <AnnouncementsAdmin />
    </div>
  );
}
