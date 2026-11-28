import { describe, it, expect } from "vitest";
import { computeStudyBadges } from "@/lib/magic/badges";

describe("computeStudyBadges", () => {
  it("مبتدئ — مفيش شارة مكتسبة وكل شارة بتقول ناقصها إيه", () => {
    const badges = computeStudyBadges({ xp: 0, streak: 1, tasksDone: 0 });
    expect(badges.every((b) => !b.earned)).toBe(true);
    const streak3 = badges.find((b) => b.id === "streak_3");
    expect(streak3?.hint).toContain("٢");
    const xp1000 = badges.find((b) => b.id === "xp_1000");
    expect(xp1000?.hint).toContain("XP");
  });

  it("سلسلة ٧ أيام ← شارة الأسبوع مكتسبة والشهر لأ", () => {
    const badges = computeStudyBadges({ xp: 0, streak: 7, tasksDone: 0 });
    expect(badges.find((b) => b.id === "streak_3")?.earned).toBe(true);
    expect(badges.find((b) => b.id === "streak_7")?.earned).toBe(true);
    expect(badges.find((b) => b.id === "streak_30")?.earned).toBe(false);
    expect(badges.find((b) => b.id === "streak_30")?.hint).toContain("٢٣");
  });

  it("شارات المهام و XP بتنور مع بعض — والشارات المكتسبة من غير hint", () => {
    const badges = computeStudyBadges({ xp: 5000, streak: 30, tasksDone: 50 });
    expect(badges.every((b) => b.earned)).toBe(true);
    expect(badges.every((b) => b.hint === undefined)).toBe(true);
  });

  it("قيم سالبة أو فاسدة متكسّرش الحاجة", () => {
    const badges = computeStudyBadges({ xp: -5, streak: -1, tasksDone: Number.NaN });
    expect(badges.every((b) => !b.earned)).toBe(true);
  });
});
