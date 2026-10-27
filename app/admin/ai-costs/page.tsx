import { requireAdminPermission } from "@/lib/admin/auth-check";
import { CREDIT_COSTS } from "@/lib/ai/credit-pricing";
import { AdminCard, AdminPageHeader } from "@/components/admin/ui";

export default async function AdminAiCostsPage() {
  await requireAdminPermission("plans.manage");
  return (
    <div className="space-y-6">
      <AdminPageHeader title="تكلفة عمليات AI (Credits)" subtitle="قائمة read-only. لتعديل القيم، عدّل lib/ai/credit-pricing.ts." badge="plans.manage" permissionKey="plans.manage" />
      <AdminCard title="CREDIT_COSTS" description="التكاليف per operation">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-950/60 text-slate-300"><th className="text-right px-3 py-2">Operation</th><th className="text-right px-3 py-2">Credits</th></tr></thead>
          <tbody>
            {Object.entries(CREDIT_COSTS).map(([k, v]) => (
              <tr key={k} className="border-t border-slate-800">
                <td className="px-3 py-2 font-mono" dir="ltr">{k}</td>
                <td className="px-3 py-2">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminCard>
    </div>
  );
}