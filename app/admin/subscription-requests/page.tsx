import { requireAdminPermission } from "@/lib/admin/auth-check";
import { AdminCard, AdminNotice, AdminPageHeader, AdminStatCard } from "@/components/admin/ui";
import {
  getPurchaseRequestsOverview,
  listPurchaseRequests,
  type PurchaseRequestAdminView,
} from "@/lib/admin/purchase-requests";
import SubscriptionRequestsTable from "./SubscriptionRequestsTable";

/**
 * /admin/subscription-requests — قسم مخصص لطلبات دفع الاشتراكات:
 * بيانات المستخدم كاملة، تعديل الطلب (باقة/مدة/مبلغ)، محادثة الدعم المرتبطة،
 * وقبول/رفض الطلب (القبول يفعّل الاشتراك عبر admin_activate_subscription).
 */
export const dynamic = "force-dynamic";

export default async function AdminSubscriptionRequestsPage() {
  await requireAdminPermission("subscriptions.manage");

  let overview: Awaited<ReturnType<typeof getPurchaseRequestsOverview>> | null = null;
  let requests: PurchaseRequestAdminView[] = [];
  let errorMessage: string | null = null;

  try {
    [overview, requests] = await Promise.all([
      getPurchaseRequestsOverview(),
      listPurchaseRequests(200, "plan"),
    ]);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  const planRequests = requests.filter((r) => r.kind === "plan");
  const pendingReview = planRequests.filter((r) => r.status === "payment_submitted").length;
  const viaSupport = planRequests.filter((r) => r.ticket_id).length;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="طلبات دفع الاشتراكات"
        subtitle="بيانات المستخدم، إثبات الدفع، محادثة الدعم المرتبطة — عدّل الطلب إن لزم ثم اقبل أو ارفض."
        badge="subscriptions.manage"
        permissionKey="subscriptions.manage"
      />

      {errorMessage ? (
        <AdminNotice tone="rose">
          تعذّر قراءة <code>purchase_requests</code>: {errorMessage} — تأكد من تطبيق ترحيلي <code>purchase_requests_store</code> و<code>purchase_requests_support_link</code>.
        </AdminNotice>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AdminStatCard label="بانتظار المراجعة" value={pendingReview} hint="دفع مؤكد" tone={pendingReview > 0 ? "amber" : "default"} />
        <AdminStatCard label="عبر رسايل الدعم" value={viaSupport} hint="مرتبطة بمحادثة" tone="purple" />
        <AdminStatCard label="مقبولة" value={overview?.approved ?? 0} tone="emerald" />
        <AdminStatCard label="مرفوضة" value={overview?.rejected ?? 0} tone="rose" />
      </div>

      <AdminCard
        title="الطلبات"
        description="آخر 200 طلب اشتراك. زر «مراجعة» يفتح التعديل والمحادثة — القبول يفعّل الاشتراك فورًا ويشعر المستخدم في المحادثة وبالإشعار."
        tone={pendingReview > 0 ? "amber" : "default"}
      >
        <SubscriptionRequestsTable requests={planRequests} />
      </AdminCard>
    </div>
  );
}
