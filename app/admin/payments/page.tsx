import { requireAdminPermission } from "@/lib/admin/auth-check";
import { createServiceClient } from "@/lib/supabase/admin";

export default async function AdminPaymentsPage() {
  await requireAdminPermission("users.read");
  const db = createServiceClient();
  const { data } = await db.from("payments").select("*").order("created_at", { ascending: false }).limit(50);
  const rows = (data as any[]) || [];
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold">الدفعات (يدوي)</h1>
      <p className="text-sm text-muted-foreground">سجل الدفعات اليدوية. لإضافة دفعة استخدم Server Action recordPayment.</p>
      <table className="w-full text-sm">
        <thead><tr><th>المستخدم</th><th>المبلغ</th><th>العملة</th><th>الطريقة</th><th>ملاحظة</th><th>التاريخ</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.user_id}</td>
              <td>{r.amount}</td>
              <td>{r.currency}</td>
              <td>{r.method}</td>
              <td>{r.note}</td>
              <td>{r.created_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
