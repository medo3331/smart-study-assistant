import { describe, it, expect } from "vitest";
import { buildMagicGreeting, buildChatWelcomeGreeting, daysSinceStudy } from "@/lib/magic/greeting";

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

  it("اسأل Magic بيفتح صفحة المساعد الموحد", () => {
    const g = buildMagicGreeting({ ...base, workspaceFiles: 0 });
    const ask = g.suggestions.find((s) => s.id === "ask_magic");
    expect(ask?.href).toBe("/chat");
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

describe("buildMagicGreeting — نمط Duolingo (المستوى والسلسلة والغياب والمهام)", () => {
  const economy = {
    xp: 450,
    streak: 4,
    lastStudyDay: "2026-07-20",
    today: "2026-07-20",
  };

  it("بيحسب المستوى وتقدم XP من نقاط الخبرة", () => {
    const g = buildMagicGreeting({ ...base, economy });
    expect(g.stats).not.toBeNull();
    expect(g.stats!.level).toBe(3); // 450/200 → المستوى ٣
    expect(g.stats!.xpInLevel).toBe(50);
    expect(g.stats!.xpToNext).toBe(150);
    expect(g.stats!.progressPercent).toBe(25);
    expect(g.stats!.streak).toBe(4);
  });

  it("مذاكر النهارده ← رسالة تشجيع على السلسلة (مش غياب)", () => {
    const g = buildMagicGreeting({ ...base, economy });
    expect(g.nudge).toContain("سلسلتك");
  });

  it("غايب يوم ← ملاحظة لطيفة بترجّع السلسلة", () => {
    const g = buildMagicGreeting({ ...base, economy: { ...economy, lastStudyDay: "2026-07-19" } });
    expect(g.nudge).toContain("يوم واحد");
  });

  it("غايب ٥ أيام ← ملاحظة ترحيب بالرجوع بدون لوم", () => {
    const g = buildMagicGreeting({ ...base, economy: { ...economy, lastStudyDay: "2026-07-15" } });
    expect(g.nudge).toContain("طولت غايب 5");
  });

  it("last_study_day = null (بيانات قديمة) ← مفيش ملاحظة غياب", () => {
    const g = buildMagicGreeting({ ...base, economy: { ...economy, lastStudyDay: null } });
    expect(g.nudge).toBeNull();
  });

  it("بدون economy ← stats وnudge بـ null (ترحيب عام)", () => {
    const g = buildMagicGreeting({ ...base });
    expect(g.stats).toBeNull();
    expect(g.nudge).toBeNull();
    expect(g.tasks).toEqual([]);
  });

  it("مهام مفتوحة ← اقتراح «مهام مستنياك» الأول + tasks مرجّعة", () => {
    const g = buildMagicGreeting({ ...base, tasks: ["راجع محاضرة الخلية", "اختبار سريع"] });
    expect(g.tasks).toEqual(["راجع محاضرة الخلية", "اختبار سريع"]);
    expect(g.suggestions[0].id).toBe("open_tasks");
    expect(g.suggestions[0].label).toContain("راجع محاضرة الخلية");
    expect(g.suggestions[0].href).toBe("/dashboard/planner");
  });

  it("شارات المذاكرة بترجع دايمًا — والمكتسبة تبع الأرقام الحقيقية", () => {
    const g = buildMagicGreeting({ ...base, economy, tasksDoneTotal: 12 });
    expect(g.badges.length).toBeGreaterThan(0);
    expect(g.badges.find((b) => b.id === "tasks_10")?.earned).toBe(true);
    expect(g.badges.find((b) => b.id === "tasks_50")?.earned).toBe(false);
    expect(g.badges.find((b) => b.id === "streak_3")?.earned).toBe(true); // streak 4
  });

  it("بدون بيانات — الشارات كلها مقفولة بس موجودة", () => {
    const g = buildMagicGreeting({ ...base });
    expect(g.badges.length).toBeGreaterThan(0);
    expect(g.badges.every((b) => !b.earned)).toBe(true);
  });
});

describe("daysSinceStudy", () => {
  it("نفس اليوم = صفر", () => {
    expect(daysSinceStudy("2026-07-20", "2026-07-20")).toBe(0);
  });

  it("يوم كامل = ١ — وISO كامل بيتقارن بتاريخه بس", () => {
    expect(daysSinceStudy("2026-07-19", "2026-07-20")).toBe(1);
    expect(daysSinceStudy("2026-07-19T21:30:00+00:00", "2026-07-20")).toBe(1);
  });

  it("تاريخ فاسد = صفر (best-effort)", () => {
    expect(daysSinceStudy("not-a-date", "2026-07-20")).toBe(0);
  });
});
