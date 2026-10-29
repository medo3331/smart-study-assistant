import { requireAdminPermission } from "@/lib/admin/auth-check";
import { fetchPayments } from "@/app/admin/actions/payments";
import PaymentsManager from "./PaymentsManager";

export default async function AdminPaymentsPage() {
  const ctx = await requireAdminPermission("users.read");
  const rows = await fetchPayments();
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold">الدفعات (يدوي)</h1>
      <PaymentsManager adminUserId={ctx.user.id} initial={rows} />
    </div>
  );
}

