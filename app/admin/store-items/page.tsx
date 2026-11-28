import { requireAdminPermission } from "@/lib/admin/auth-check";
import { getCustomStoreItems } from "@/lib/admin/store-items";
import { isPgConfigured } from "@/lib/admin/pg";
import { AdminNotice, AdminPageHeader } from "@/components/admin/ui";
import { StoreItemsClient } from "./StoreItemsClient";

/**
 * 🛍️ عناصر المتجر المخصصة — الأدمن بيضيف عناصر (صور/ألقاب/رفقاء) تظهر
 * في المتجر والمخزن مباشرة. Owner فقط (rewards.manage).
 */
export default async function AdminStoreItemsPage() {
  await requireAdminPermission("rewards.manage");

  if (!isPgConfigured()) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="عناصر المتجر" subtitle="إضافة عناصر مخصصة إلى المتجر" badge="rewards.manage = Owner" permissionKey="rewards.manage" />
        <AdminNotice tone="rose">DATABASE_URL غير متاح — غير قابل للتحقق من هنا.</AdminNotice>
      </div>
    );
  }

  let items;
  let error: string | null = null;
  try {
    items = await getCustomStoreItems();
  } catch (e) {
    items = null;
    error = e instanceof Error ? e.message : "unknown";
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="عناصر المتجر"
        subtitle="إضافة عناصر مخصصة (صور رمزية / ألقاب / رفقاء) تظهر في المتجر والمخزن فورًا — وكل تغيير بيتسجّل في Audit Log."
        badge="rewards.manage = Owner"
        permissionKey="rewards.manage"
      />
      {error ? <AdminNotice tone="rose">خطأ قراءة: {error}</AdminNotice> : null}
      <StoreItemsClient items={items ?? []} />
    </div>
  );
}
