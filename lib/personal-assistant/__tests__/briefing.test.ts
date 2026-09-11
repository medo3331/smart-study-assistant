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

/**
 * ⏱️ كل الاختبارات هنا بتحقن اللحظة عبر `now` (الموجود في BriefingContext
 * تحديدًا «للاختبارات فقط»). من غيره الاختبار كان بيقع على أي جهاز ساعته
 * مساءً: getTimePeriod بتقرأ now.getHours() والحد ٥ص–٥م.
 *
 * ليه مش vi.useFakeTimers: الدالة أصلًا بتستقبل الوقت كباراميتر، فالحقن
 * المباشر أدق وما بيسيبش حالة عامة (ساعة مزيفة) ممكن تسرّب لاختبارات تانية.
 */
const MORNING = new Date(2025, 0, 15, 9, 0, 0); // ٩:٠٠ ص
const EVENING = new Date(2025, 0, 15, 21, 0, 0); // ٩:٠٠ م

describe("getPersonalAssistantBriefing", () => {
  it("يصنع سياق مايّ كاملًا بكل البيانات المتاحة", () => {
    const result = getPersonalAssistantBriefing({
      ctx: buildContext(),
      now: MORNING,
    }) as BriefingResult;

    expect(result.greeting).toBe("أسعد الله صباحك بكل خير يا محمد 💙");
    expect(result.timePeriod).toBe("morning");
  });

  it("التحية بتتبدّل مساءً", () => {
    const result = getPersonalAssistantBriefing({
      ctx: buildContext(),
      now: EVENING,
    }) as BriefingResult;

    expect(result.greeting).toBe("أسعد الله مساءك بكل خير يا محمد 💙");
    expect(result.timePeriod).toBe("evening");
  });

  it("حدود الفترة: ٥ص صباح و٥م مساءً", () => {
    const at = (hour: number) =>
      (getPersonalAssistantBriefing({
        ctx: buildContext(),
        now: new Date(2025, 0, 15, hour, 0, 0),
      }) as BriefingResult).timePeriod;

    expect(at(4)).toBe("evening"); // قبل ٥ص
    expect(at(5)).toBe("morning"); // الحد الأدنى للصباح
    expect(at(16)).toBe("morning"); // قبل ٥م
    expect(at(17)).toBe("evening"); // الحد الأدنى للمساء
    expect(at(0)).toBe("evening"); // منتصف الليل
  });

  it("من غير اسم المستخدم المخاطبة بتبقى عامة (مفيش «يا» فاضية)", () => {
    const result = getPersonalAssistantBriefing({
      ctx: buildContext({ userName: "  " }),
      now: MORNING,
    }) as BriefingResult;

    expect(result.greeting).toBe("أسعد الله صباحك بكل خير 💙");
    expect(result.greeting).not.toContain("يا  ");
  });
});
