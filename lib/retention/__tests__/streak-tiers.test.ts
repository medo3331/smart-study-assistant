import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { STREAK_BONUSES, bonusesForStreak, nextStreakBonus } from "@/lib/retention/streak-tiers";

describe("nextStreakBonus", () => {
  it("سلسلة ٠ ⇒ أول محطة يوم ٣", () => {
    expect(nextStreakBonus(0)).toMatchObject({ day: 3, daysLeft: 3, coins: 15, xp: 15 });
  });

  it("بيختار أقرب محطة، مش أكبر واحدة", () => {
    // يوم ٥ ⇒ ٦ (٣) قبل ٧
    expect(nextStreakBonus(5)).toMatchObject({ day: 6, daysLeft: 1, label: "بونص ٣ أيام" });
    // يوم ٦ ⇒ ٧ (فاضل يوم)
    expect(nextStreakBonus(6)).toMatchObject({ day: 7, daysLeft: 1, coins: 120 });
    // يوم ٧ ⇒ ٩ (فاضل يومين) مش ١٠
    expect(nextStreakBonus(7)).toMatchObject({ day: 9, daysLeft: 2 });
  });

  it("بيتعامل مع الأرقام الغريبة بهدوء", () => {
    expect(nextStreakBonus(-5).day).toBe(3);
    expect(nextStreakBonus(Number.NaN).day).toBe(3);
    expect(nextStreakBonus(2.9)).toMatchObject({ day: 3, daysLeft: 1 });
  });

  it("محطة الشهر موجودة في الحساب", () => {
    // يوم ٢٠ ⇒ الأقرب ٢١ (٣ أيام)؛ ويوم ٢٩ ⇒ ٣٠ (الشهر)
    expect(nextStreakBonus(29)).toMatchObject({ day: 30, coins: 250, xp: 200 });
  });
});

describe("bonusesForStreak", () => {
  it("مفيش مكافأة لو لسه مابدأش", () => {
    expect(bonusesForStreak(0)).toEqual([]);
  });

  it("بيجمع المحطات اللي بتنطبق في نفس اليوم", () => {
    expect(bonusesForStreak(3).map((b) => b.every)).toEqual([3]);
    expect(bonusesForStreak(7).map((b) => b.every)).toEqual([7]);
    // اليوم ٢١ = ٣ × ٧
    expect(bonusesForStreak(21).map((b) => b.every)).toEqual([3, 7]);
    // اليوم ٣٠ = ٣ × ١٠ و٣٠
    expect(bonusesForStreak(30).map((b) => b.every)).toEqual([3, 30]);
  });
});

/**
 * حارس ضد الـ drift: الواجهة بتوعد الطالب بأرقام، والـ SQL هو اللي بيصرفها.
 * التست بيقرا ملف الميجريشن ويتأكد إن كل رقم في TS موجود حرفيًا فيه.
 */
describe("تطابق أرقام الواجهة مع SQL", () => {
  const sqlPath = path.join(process.cwd(), "db", "44-retention-phase-2-tiers.sql");
  const sql = readFileSync(sqlPath, "utf8");

  it("كوينز المحطات موجودة في جدول القواعد في الميجريشن", () => {
    expect(sql).toMatch(/streak_tier_3'\s*,\s*15\s*,\s*1\s*,\s*true/);
    expect(sql).toMatch(/streak_tier_30'\s*,\s*250\s*,\s*1\s*,\s*true/);
  });

  it("كل محطة ليها فرع في _streak_apply بنفس رقم XP", () => {
    for (const bonus of STREAK_BONUSES) {
      expect(sql).toContain(`v_new % ${bonus.every} = 0`);
      expect(sql).toContain(`v_bonus_xp := v_bonus_xp + ${bonus.xp}`);
    }
  });
});
