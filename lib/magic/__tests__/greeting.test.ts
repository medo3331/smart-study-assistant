import { describe, it, expect } from "vitest";
import { buildMagicGreeting, buildChatWelcomeGreeting } from "@/lib/magic/greeting";

const base = {
  displayName: "أحمد",
  hour: 9,
  activePlan: null,
  workspaceFiles: 5,
};

describe("buildMagicGreeting", () => {
  it("يرحّب بالاسم حسب وقت اليوم", () => {
    const g = buildMagicGreeting({ ...base, hour: 8 });
    expect(g.greeting).toContain("صباح الخير يا أحمد");
    expect(g.greeting).toContain("⚡");
    const e = buildMagicGreeting({ ...base, hour: 21, displayName: "سارة" });
    expect(e.greeting).toContain("مساء الخير يا سارة");
  });

  it("بدون اسم — ترحيب عام", () => {
    const g = buildMagicGreeting({ ...base, displayName: null });
    expect(g.greeting).not.toContain("يا");
  });

  it("خطة نشطة + مهمة النهارده ← اقتراح كمّل الخطة أولًا", () => {
    const g = buildMagicGreeting({
      ...base,
      activePlan: { subject: "الشبكات", examDate: "2026-12-01", daysLeft: 2, todayTask: { title: "مراجعة OSI" } },
    });
    expect(g.suggestions[0].id).toBe("plan_today");
    expect(g.suggestions[0].label).toContain("مراجعة OSI");
    expect(g.sub).toContain("الشبكات");
  });

  it("خطة نشطة + اليوم خلص ← اقتراح مراجعة/اختبار", () => {
    const g = buildMagicGreeting({
      ...base,
      activePlan: { subject: "الشبكات", examDate: "2026-12-01", daysLeft: 1, todayTask: null },
    });
    expect(g.suggestions[0].id).toBe("plan_review");
  });

  it("مفيش ملفات ← اقتراح رفع أول محاضرة", () => {
    const g = buildMagicGreeting({ ...base, workspaceFiles: 0 });
    expect(g.suggestions.some((s) => s.id === "first_upload")).toBe(true);
  });

  it("فيه ملفات ← اقتراح فتح درس مع Tutor", () => {
    const g = buildMagicGreeting({ ...base, workspaceFiles: 7 });
    expect(g.suggestions.some((s) => s.id === "ask_tutor")).toBe(true);
  });

  it("اقتراحات محدودة بـ 3 وفيها اسأل Magic دايمًا", () => {
    const g = buildMagicGreeting({
      ...base,
      activePlan: { subject: "x", examDate: "2026-12-01", daysLeft: 3, todayTask: { title: "y" } },
      workspaceFiles: 0,
    });
    expect(g.suggestions.length).toBeLessThanOrEqual(3);
    expect(g.suggestions.some((s) => s.id === "ask_magic")).toBe(true);
  });

  it("ساعة خارج النطاق متكسّرش الحاجة", () => {
    const g = buildMagicGreeting({ ...base, hour: 99 });
    expect(g.greeting).toBeTruthy();
    expect(g.greeting).toContain("!");
  });
});

describe("buildChatWelcomeGreeting", () => {
  it("هوية Magic داخل الشات", () => {
    const w = buildChatWelcomeGreeting("أحمد", 10);
    expect(w).toContain("أنا Magic");
    expect(w).toContain("صباح الخير يا أحمد");
    expect(w).toContain("خطة مذاكرة");
  });

  it("زائر بدون اسم", () => {
    const w = buildChatWelcomeGreeting(null, 20);
    expect(w).toContain("أنا Magic");
    expect(w).toContain("مساء الخير");
  });
});
