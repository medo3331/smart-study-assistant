import { requireAdminPermission } from "@/lib/admin/auth-check";
import { AdminPageHeader, AdminCard } from "@/components/admin/ui";
import { listAllTickets } from "@/app/admin/actions/tickets-manage";
import Link from "next/link";

export default async function AdminTicketsPage() {
  await requireAdminPermission("plans.manage");
  const { data } = await listAllTickets();

  return (
    <div className="space-y-6">
      <AdminPageHeader title="تذاكر الدعم" subtitle="إدارة تذاكر المستخدمين" badge="plans.manage" permissionKey="plans.manage" />
      <AdminCard title="كل التذاكر" tone="default">
        <table className="w-full text-sm">
          <thead className="text-amber-300">
            <tr>
              <th className="px-2 py-1 text-right">الموضوع</th>
              <th className="px-2 py-1 text-right">الحالة</th>
              <th className="px-2 py-1 text-right">الأولوية</th>
              <th className="px-2 py-1 text-right">التاريخ</th>
              <th className="px-2 py-1 text-right">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {data.map((t: any) => (
              <tr key={t.id} className="border-t border-slate-700">
                <td className="px-2 py-1">{t.subject}</td>
                <td className="px-2 py-1">{t.status}</td>
                <td className="px-2 py-1">{t.priority}</td>
                <td className="px-2 py-1 text-xs">{new Date(t.created_at).toLocaleString()}</td>
                <td className="px-2 py-1"><Link href={`/admin/tickets/${t.id}`} className="text-marker underline text-xs">عرض</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminCard>
    </div>
  );
}
