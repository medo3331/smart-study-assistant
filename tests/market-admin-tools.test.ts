/**
 * عقد أدوات الأدمن المالية (DEV-M3 جزء ٢) — static contract:
 *   - طلبات الشراء: القبول/الرفض شغّالين على كل الحالات النشطة
 *     (awaiting_payment + payment_submitted).
 *   - Economy Balancing: الحفظ بيتحقق فعلاً (regex بيقبل أرقام + revalidate).
 *   - db/119: تفعيل admin_grant لإضافة رصيد من اللوحة.
 *   - عناصر المتجر المخصصة: حارس + تحقق + قراءة العناصر في الواجهات.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const root = join(__dirname, "..");
function read(p: string): string {
  return readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");
}

const prActions = read("app/admin/actions/purchase-requests.ts");
const table = read("app/admin/purchase-requests/PurchaseRequestsTable.tsx");
const economy = read("app/admin/actions/economy-balancing.ts");
const db119 = read("db/119-admin-grant.sql");
const storeActions = read("app/admin/actions/store-items.ts");
const customCatalog = read("lib/shop/custom-catalog.ts");
const shopData = read("lib/shop/shop-data.ts");
const nav = read("lib/admin/nav.ts");

describe("طلبات الشراء — قبول/رفض أي طلب نشط", () => {
  it("ACTIVE_STATUSES بتشمل awaiting_payment و payment_submitted", () => {
    expect(prActions).toContain('["payment_submitted", "awaiting_payment"]');
  });

  it("التحديث الذرّي بيقيد على الحالات النشطة كلها", () => {
    expect(prActions).toMatch(/\.in\("status", \[\.\.\.ACTIVE_STATUSES\]\)/);
  });

  it("الواجهة بتعرض أزرار المراجعة لطلب من غير إثبات دفع", () => {
    expect(table).toContain("المستخدم لسه مؤكدش الدفع");
    expect(table).toContain("مراجعة يدوية");
  });
});

describe("Economy Balancing — الحفظ بيتحفظ فعلاً", () => {
  it("regex المعرّف بيقبل أرقام (streak_tier_3 مثلًا)", () => {
    expect(economy).toContain("^[a-z0-9_]{2,40}$");
    expect(economy).not.toContain("^[a-z_]{2,40}$");
  });

  it("كل إجراء ناجح بيعمل revalidatePath للصفحة", () => {
    const count = (economy.match(/revalidatePath\("\/admin\/economy"\)/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it("منح الرصيد موجود بكل الحمايات", () => {
    expect(economy).toContain("grantUserBalance");
    expect(economy).toContain('p_source: "admin_grant"');
    expect(economy).toContain('p_source_class: "admin"');
    expect(economy).toContain('p_source: "bonus"');
    expect(economy).toContain('requireAdminActor("rewards.manage")');
  });

  it("الواجهة فيها نموذج إضافة الرصيد", () => {
    const client = read("app/admin/economy/EconomyBalancingClient.tsx");
    expect(client).toContain("GrantBalanceForm");
    expect(client).toContain("grantUserBalance");
  });
});

describe("db/119 — تفعيل admin_grant", () => {
  it("بيفعّل المصدر وبيحط سقف يومي", () => {
    expect(db119).toContain("is_live = true");
    expect(db119).toContain("daily_cap = 5");
    expect(db119).toContain("admin_grant");
  });
});

describe("عناصر المتجر المخصصة — الأدمن يضيف بنفسه", () => {
  it("الإجراء محمي بصلاحية الأدمن وبيسجل Audit", () => {
    expect(storeActions).toContain('"use server"');
    expect(storeActions).toContain('requireAdminActor("rewards.manage")');
    expect(storeActions).toContain("recordAuditLog");
  });

  it("القسم مقيّد على avatar/title/companion بس", () => {
    expect(storeActions).toContain('["avatar", "title", "companion"]');
  });

  it("الحذف ممنوع لعنصر مملوك", () => {
    expect(storeActions).toContain("shop_inventory");
    expect(storeActions).toContain("مملوك عند");
  });

  it("القراءة بتفلتر على metadata.custom وتحوّل لعنصر متجر", () => {
    expect(customCatalog).toContain("m.custom");
    expect(customCatalog).toContain("customRowToItem");
    expect(customCatalog).toContain("fetchCustomCatalogItems");
  });

  it("ShopState بيحمل customItems و equippedItem بيراعيها", () => {
    expect(shopData).toContain("customItems");
    expect(shopData).toContain('Pick<ShopState, "equipped" | "customItems">');
  });

  it("المتجر والمخزن بيدمجوا العناصر المخصصة", () => {
    expect(read("app/shop/page.tsx")).toContain("state.customItems ?? []");
    expect(read("app/inventory/page.tsx")).toContain("state.customItems ?? []");
  });

  it("الصفحة مسجلة في قائمة الأدمن", () => {
    expect(nav).toContain('"/admin/store-items"');
  });
});
