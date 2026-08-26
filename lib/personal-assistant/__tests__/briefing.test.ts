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
  it("يصنع سياقไหมّ كاملًا بكل البيانات المتاحة", () => {
    const result = getPersonalAssistantBriefing(
      { ctx: buildContext() },
    ) as BriefingResult;

    expect(result.greeting).toBe("أسعد الله صباحك بكل خير يا محمد 💙");
  });
});
