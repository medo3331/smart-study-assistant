import { requireAdminPermission } from "@/lib/admin/auth-check";
import { fetchPayments } from "@/app/admin/actions/payments";
import PaymentsManager from "./PaymentsManager";
import { AdminPageHeader, AdminCard } from "@/components/admin/ui";

export default async function AdminPaymentsPage() {
  const ctx = await requireAdminPermission("users.read");
  const rows = await fetchPayments();
  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader title="الدفعات (يدوي)" subtitle="تسجيل دفعات يدوية وتاريخها" badge="payments" permissionKey="subscriptions.manage" />
      <AdminCard title="إدارة الدفعات" tone="default">
        <PaymentsManager adminUserId={ctx.user.id} initial={rows} />
      </AdminCard>
    </div>
  );
}

