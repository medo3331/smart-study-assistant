import { AdminPageHeader } from "@/components/admin/ui";
import SupportInbox from "@/components/support/SupportInbox";
import { requireAdminPermission } from "@/lib/admin/auth-check";

export default async function AdminSupportPage() {
  await requireAdminPermission("support.manage");

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="مركز رسائل الدعم"
        subtitle="تابع طلبات الطلاب ورد عليهم في محادثة موحدة."
        badge="support"
        permissionKey="support.manage"
      />
      <SupportInbox mode="admin" />
    </div>
  );
}
