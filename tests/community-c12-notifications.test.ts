import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// ---------------------------------------------------------------------------
// عقد Community C12 — صفحة الإشعارات الموحدة + الجرس المحسّن
// ---------------------------------------------------------------------------

const notifApi = read("app/api/notifications/route.ts");
const notifPage = read("app/notifications/page.tsx");
const bell = read("components/NotificationBell.tsx");

describe("C12 notifications API contract", () => {
  it("DELETE removes one notification or all read ones (ownership enforced)", () => {
    expect(notifApi).toContain("export async function DELETE");
    expect(notifApi).toContain("allRead");
    // ملكية المستلم إجبارية في المسارين الحديث والقديم
    expect(notifApi).toMatch(/delete\(\)\.eq\("id",id\)\.eq\("recipient_id",user\.id\)/);
    expect(notifApi).toMatch(/delete\(\)\.eq\("id",id\)\.eq\("user_id",user\.id\)/);
  });
});

describe("C12 notifications page contract", () => {
  it("page exists with categorized tabs and full per-item actions", () => {
    expect(notifPage).toContain('"all" | "social" | "support" | "system"');
    expect(notifPage).toContain("التفاعلات والرسايل");
    expect(notifPage).toContain("الدعم");
    expect(notifPage).toContain("الإعلانات والنظام");
    // إجراءات الطالب: فتح + تعليم كمقروء + حذف + تعليم الكل + حذف المقروء
    expect(notifPage).toContain("markAllRead");
    expect(notifPage).toContain("deleteRead");
    expect(notifPage).toContain("void remove(n.id)");
    expect(notifPage).toContain("void open(n)");
    // الفتح بيروح لمكان الإشعار في المنصة
    expect(notifPage).toContain("router.push(n.link_url)");
  });

  it("bell opens rightward (left-0) and links to the full page", () => {
    // كانت right-0 فالبانل بيطلع بره الشاشة شمال — اتصلحت لـ left-0
    expect(bell).toContain("absolute left-0 z-50");
    expect(bell).not.toContain("absolute right-0 z-50");
    expect(bell).toContain('"/notifications"');
    expect(bell).toContain("markAllRead");
    // الضغط بره القايمة يقفلها
    expect(bell).toContain('document.addEventListener("mousedown"');
  });
});
