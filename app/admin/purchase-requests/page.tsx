import { requireAdminPermission } from "@/lib/admin/auth-check";
import {
  AdminCard,
  AdminNotice,
  AdminPageHeader,
  AdminStatCard,
} from "@/components/admin/ui";
import {
  getPurchaseRequestsOverview,
  listPurchaseRequests,
  type PurchaseRequestAdminView,
} from "@/lib/admin/purchase-requests";
import PurchaseRequestsTable from "./PurchaseRequestsTable";

/**
 * /admin/purchase-requests — طلبات الشراء (كريدت / باقات) بالدفع اليدوي.
 * الموافقة تنفّذ المنح/التفعيل الفعلي عبر server actions، وكل محاولة تُدوَّن.
 */
export const dynamic = "force-dynamic";

export default async function AdminPurchaseRequestsPage() {
  await requireAdminPermission("subscriptions.manage");

  let overview: Awaited<ReturnType<typeof getPurchaseRequestsOverview>> | null = null;
  let requests: PurchaseRequestAdminView[] = [];
  let errorMessage: string | null = null;

  try {
    [overview, requests] = await Promise.all([getPurchaseRequestsOverview(), listPurchaseRequests(200)]);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="طلبات الشراء"
        subtitle="طلبات شراء الكريدت والاشتراكات بالدفع اليدوي — راجع إثبات الدفع، ثم اقبل أو ارفض."
        badge="subscriptions.manage"
        permissionKey="subscriptions.manage"
      />

      {errorMessage ? (
        <AdminNotice tone="rose">
          تعذّر قراءة <code>purchase_requests</code>: {errorMessage} — تأكد من تطبيق ترحيل <code>purchase_requests_store</code>.
        </AdminNotice>
      ) : null}

      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <AdminStatCard label="بانتظار المراجعة" value={overview.payment_submitted} hint="دفع مؤكد" tone={overview.payment_submitted > 0 ? "amber" : "default"} />
          <AdminStatCard label="بانتظار الدفع" value={overview.awaiting_payment} hint="لم يؤكد بعد" tone="default" />
          <AdminStatCard label="مقبولة" value={overview.approved} tone="emerald" />
          <AdminStatCard label="مرفوضة" value={overview.rejected} tone="rose" />
          <AdminStatCard label="الإجمالي" value={overview.total_requests} hint={`ملغاة: ${overview.cancelled}`} tone="blue" />
        </div>
      )}

      <AdminCard
        title="الطلبات"
        description="آخر 200 طلب. زر «مراجعة» يظهر فقط للطلبات ذات دفع مؤكد — القبول يمنح الكريدت أو يفعّل الاشتراك فورًا ويشعر المستخدم."
        tone={overview && overview.payment_submitted > 0 ? "amber" : "default"}
      >
        <PurchaseRequestsTable requests={requests} />
      </AdminCard>
    </div>
  );
}
