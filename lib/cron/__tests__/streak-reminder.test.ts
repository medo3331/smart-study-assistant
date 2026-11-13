import { describe, it, expect } from "vitest";

import {
  STREAK_REMINDER_MIN,
  buildStreakReminderPayload,
  chunkIds,
  isStreakAtRisk,
} from "@/lib/cron/streak-reminder";

describe("isStreakAtRisk", () => {
  const today = "2026-11-14";

  it("سلسلة ٣+ ولسه ماذاكرش النهارده ⇒ تذكير", () => {
    expect(isStreakAtRisk({ streak: 3, lastStudyDay: "2026-11-13", today })).toBe(true);
    expect(isStreakAtRisk({ streak: 12, lastStudyDay: "2026-11-10", today })).toBe(true);
  });

  it("ذاكر النهارده ⇒ مفيش تذكير", () => {
    expect(isStreakAtRisk({ streak: 9, lastStudyDay: today, today })).toBe(false);
  });

  it("سلسلة أقل من الحد ⇒ مفيش تذكير", () => {
    expect(isStreakAtRisk({ streak: 2, lastStudyDay: "2026-11-13", today })).toBe(false);
    expect(isStreakAtRisk({ streak: STREAK_REMINDER_MIN - 1, lastStudyDay: "2026-11-13", today })).toBe(false);
  });

  it("قيمة last_study_day كاملة (ISO) بتتقارن بتاريخها بس", () => {
    expect(isStreakAtRisk({ streak: 5, lastStudyDay: "2026-11-14T00:00:00+02:00", today })).toBe(false);
    expect(isStreakAtRisk({ streak: 5, lastStudyDay: "2026-11-13T21:00:00Z", today })).toBe(true);
  });

  it("بيانات ناقصة أو تالفة ⇒ مفيش تذكير (fail-closed)", () => {
    expect(isStreakAtRisk({ streak: null, lastStudyDay: "2026-11-13", today })).toBe(false);
    expect(isStreakAtRisk({ streak: 8, lastStudyDay: null, today })).toBe(false);
    expect(isStreakAtRisk({ streak: Number.NaN, lastStudyDay: "2026-11-13", today })).toBe(false);
    expect(isStreakAtRisk({ streak: 8, lastStudyDay: "   ", today })).toBe(false);
  });
});

describe("buildStreakReminderPayload", () => {
  it("فيه رقم السلسلة ولينك الداشبورد وتاج ثابت", () => {
    const payload = buildStreakReminderPayload(7);
    expect(payload.title).toContain("7");
    expect(payload.body.length).toBeGreaterThan(10);
    expect(payload.url).toBe("/dashboard");
    expect(payload.tag).toBe("streak-reminder");
  });

  it("مايطلعش أرقام غريبة", () => {
    expect(buildStreakReminderPayload(0).title).toContain(String(STREAK_REMINDER_MIN));
    expect(buildStreakReminderPayload(Number.NaN).title).toContain(String(STREAK_REMINDER_MIN));
  });
});

describe("chunkIds", () => {
  it("بيقسّم لدفعات بالحجم المطلوب", () => {
    expect(chunkIds([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("حجم غلط بيتصحح لـ ١", () => {
    expect(chunkIds(["a", "b"], 0)).toEqual([["a"], ["b"]]);
  });

  it("قائمة فاضية ⇒ مفيش دفعات", () => {
    expect(chunkIds([], 10)).toEqual([]);
  });
});
