import { AdminPageHeader } from "@/components/admin/ui";
import SupportInbox from "@/components/support/SupportInbox";
import { requireAdminPermission } from "@/lib/admin/auth-check";

export default async function AdminTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPermission("support.manage");
  const { id } = await params;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="محادثة الدعم"
        subtitle="تابع الرسائل وحالة طلب الطالب."
        badge="support"
        permissionKey="support.manage"
      />
      <SupportInbox mode="admin" initialTicketId={id} />
    </div>
  );
}
