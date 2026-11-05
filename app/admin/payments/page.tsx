import { requireAdminPermission } from "@/lib/admin/auth-check";
import { fetchPayments } from "@/app/admin/actions/payments";
import PaymentsManager from "./PaymentsManager";
import { AdminPageHeader, AdminCard } from "@/components/admin/ui";

export default async function AdminPaymentsPage() {
  const ctx = await requireAdminPermission("users.read");
  const rows = await fetchPayments();

  // العملة الافتراضية من site_settings (Phase B1) — بسقوط آمن إلى EGP.
  let defaultCurrency = "EGP";
  try {
    const { data } = await ctx.supabase
      .from("site_settings")
      .select("value")
      .eq("key", "default_currency")
      .maybeSingle();
    if (typeof data?.value === "string" && data.value.trim()) {
      defaultCurrency = data.value.trim();
    }
  } catch {
    // القاعدة غير متاحة أو RLS يمنع القراءة — الافتراضي EGP يبقى صحيحًا.
  }

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader title="الدفعات (يدوي)" subtitle="تسجيل دفعات يدوية وتاريخها" badge="payments" permissionKey="subscriptions.manage" />
      <AdminCard title="إدارة الدفعات" tone="default">
        <PaymentsManager adminUserId={ctx.user.id} initial={rows} defaultCurrency={defaultCurrency} />
      </AdminCard>
    </div>
  );
}

