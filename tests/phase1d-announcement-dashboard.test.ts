import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const toast = read("components/AnnouncementToast.tsx");
const layout = read("app/layout.tsx");
const bell = read("components/NotificationBell.tsx");

describe("Phase 1D announcement global presentation", () => {
  it("registers the automatic announcement toast globally", () => {
    expect(layout).toContain("import AnnouncementToast from '@/components/AnnouncementToast'");
    expect(layout).toContain("<AnnouncementToast />");
  });

  it("uses readable explicit colors for announcement content", () => {
    expect(toast).toContain("bg-blue-50");
    expect(toast).toContain("text-blue-950");
    expect(toast).toContain("dark:bg-blue-950/90");
    expect(toast).toContain("dark:text-blue-50");
    expect(toast).not.toContain("bg-white text-white");
  });

  it("fetches active announcements through the existing API", () => {
    expect(toast).toContain('fetch("/api/announcements"');
    expect(toast).toContain('fetch(`/api/announcements/${current.id}/read`');
  });

  it("reuses read receipts to hide read announcements", () => {
    expect(toast).toContain("announcement_reads");
    expect(toast).toContain("readIdsRef");
  });

  it("supports RTL and wrapping for long text", () => {
    expect(toast).toContain('dir="rtl"');
    expect(toast).toContain("break-words");
    expect(toast).toContain("whitespace-pre-wrap");
  });

  it("shows details toggle and close", () => {
    expect(toast).toContain("عرض التفاصيل");
    expect(toast).toContain("إغلاق");
  });

  it("preserves ordinary bell notifications", () => {
    expect(bell).toContain('fetch("/api/notifications")');
    expect(bell).toContain("الإشعارات");
  });
});