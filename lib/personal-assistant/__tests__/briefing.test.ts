// Tests for getPersonalAssistantBriefing — فحص الحالات المطلوبة.
import { describe, expect, it } from "vitest";
import {
  getPersonalAssistantBriefing,
  type BriefingResult,
} from "@/lib/personal-assistant/briefing";
import type { PersonalAssistantContext } from "@/lib/personal-assistant/context";

/** بناء سياق بسيط بكل الحقول الاختيارية */
function buildContext(overrides: Partial<PersonalAssistantContext> = {}): PersonalAssistantContext {
  return {
    userName: "محمد",
    role: "student",
    studentLevel: "prep",
    subject: "رياضيات",
    streak: 12,
    xp: 2350,
    studyProgress: {
      currentDay: 3,
      completedDays: 2,
      totalDays: 10,
      progressPct: 20,
    },
    goals: {
      pendingCount: 3,
      pendingTitles: ["حل تمرين ٥٤", "مراجعة الفصل الثاني", "إكمال الواجب البرهاني"],
      urgentCount: 1,
    },
    recentActivity: {
      focusMinutesToday: 45,
      focusMinutesWeek: 280,
      activeDaysCount: 4,
    },
    ...overrides,
  };
}

describe("getPersonalAssistantBriefing", () => {
  // ⚠️ The greeting depends on the hour, and this test used to hard-code
  //    "صباح" while the clock said otherwise. It passed in the morning and
  //    failed at night, which is a test that reports whether you ran it
  //    before lunch rather than whether the code is right. The period is an
  //    input (input.now), so the test supplies one and asserts against the
  //    hour it chose, which makes it deterministic at any time of day.
  const morning = new Date("2026-01-15T09:00:00");
  const evening = new Date("2026-01-15T21:00:00");

  it("يصنع سياق كاملًا بكل البيانات المتاحة", () => {
    const result = getPersonalAssistantBriefing(
      { ctx: buildContext(), now: morning },
    ) as BriefingResult;

    expect(result.greeting).toBe("أسعد الله صباحك بكل خير يا محمد 💙");
  });

  it("يسلّم التحية المناسبة للوقت", () => {
    const atNight = getPersonalAssistantBriefing(
      { ctx: buildContext(), now: evening },
    ) as BriefingResult;

    expect(atNight.greeting).toBe("أسعد الله مساءك بكل خير يا محمد 💙");
  });

  it("الفترة بتتحدّد من الساعة اللي اتدخّلت، مش من ساعة النظام", () => {
    // 5 صباحًا boundary: the code treats 5–17 as morning.
    const earlyMorning = getPersonalAssistantBriefing(
      { ctx: buildContext(), now: new Date("2026-01-15T05:00:00") },
    ) as BriefingResult;
    const lateMorning = getPersonalAssistantBriefing(
      { ctx: buildContext(), now: new Date("2026-01-15T16:59:00") },
    ) as BriefingResult;
    const justAfter = getPersonalAssistantBriefing(
      { ctx: buildContext(), now: new Date("2026-01-15T17:00:00") },
    ) as BriefingResult;

    expect(earlyMorning.greeting).toContain("صباحك");
    expect(lateMorning.greeting).toContain("صباحك");
    expect(justAfter.greeting).toContain("مساءك");
  });
});
