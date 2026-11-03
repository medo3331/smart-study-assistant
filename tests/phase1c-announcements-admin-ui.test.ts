import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const nav = read("lib/admin/nav.ts");
const page = read("app/admin/announcements/page.tsx");
const component = read("components/admin/AnnouncementsAdmin.tsx");

describe("Phase 1C admin announcements UI", () => {
  it("adds announcements nav item with announcements.manage", () => {
    expect(nav).toContain('/admin/announcements');
    expect(nav).toContain('permission: "announcements.manage"');
  });

  it("server page requires announcements.manage", () => {
    expect(page).toContain('requireAdminPermission("announcements.manage")');
  });

  it("client component uses existing announcement API only", () => {
    expect(component).toContain('fetch("/api/announcements"');
    expect(component).toContain('method: "PATCH"');
    expect(component).toContain('method: "DELETE"');
  });

  it("validates required fields and date windows", () => {
    expect(component).toContain('if (!form.title.trim()) return "العنوان مطلوب."');
    expect(component).toContain('if (!form.body.trim()) return "المحتوى مطلوب."');
    expect(component).toContain('if (p && e && p >= e) return "publish_at must be before expires_at."');
  });

  it("documents audience metadata limitation", () => {
    expect(page).toContain("Audience");
    expect(component).toContain("Audience (metadata)");
  });
});
