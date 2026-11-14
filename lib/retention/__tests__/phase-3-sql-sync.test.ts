import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { STUDY_DAY_XP_REWARD } from "@/lib/shop/economy";

const sql = readFileSync(
  path.join(process.cwd(), "db", "45-retention-phase-3-achievements.sql"),
  "utf8"
);

/** استخراج صفوف كتالوج الإنجازات من الميجريشن (بدون الاعتماد على المسافات). */
function catalogRows(): string[] {
  const start = sql.indexOf("insert into public.achievements_catalog");
  const end = sql.indexOf("on conflict (id) do update", start);
  const block = sql.slice(start, end);
  return block.match(/\('[a-z-]+',[^\n]*\n/g) ?? [];
}

/**
 * حارس ضد الانحراف بين الواجهة والداتابيز في Phase 3:
 *   • عائد المرحلة (١٥٠ XP) — أرضية بيفرضها trigger، والواجهة بتعرض رقم.
 *   • أهداف المهمة الأسبوعية — بتتحسب على السيرفر، والصفحة بتعرض نفس الأرقام.
 */
describe("Phase 3 — تطابق الواجهة مع الميجريشن", () => {
  it("عائد المرحلة في TS هو نفسه اللي الميجريشن بيرفعه", () => {
    expect(STUDY_DAY_XP_REWARD).toBe(150);
    expect(sql).toContain(`set xp_reward = ${STUDY_DAY_XP_REWARD}`);
    expect(sql).toContain(`alter column xp_reward set default ${STUDY_DAY_XP_REWARD}`);
    expect(sql).toContain(`new.xp_reward < ${STUDY_DAY_XP_REWARD}`);
  });

  it("كتالوج الإنجازات فيه الثمانية اللي الصفحة كانت بتحسبهم", () => {
    for (const id of [
      "first-step",
      "ten-steps",
      "fifty-steps",
      "week-streak",
      "month-streak",
      "level-five",
      "first-boss",
      "first-course",
    ]) {
      expect(sql).toContain(`('${id}',`);
    }
  });

  it("كل إنجاز في الكتالوج له كوينز، والـ XP موجود إلا لإنجاز المستوى", () => {
    const rows = catalogRows();
    expect(rows).toHaveLength(8);

    for (const row of rows) {
      // الشكل: ('id', 'icon', 'title', 'requirement', 'kind', target, coins, xp, sort)
      const numbers = row.match(/'(days_done|streak|level|badges|courses)',\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/);
      expect(numbers, `صف مش مفهوم: ${row.trim()}`).not.toBeNull();
      const [, kind, target, coins, xp] = numbers!;
      expect(Number(target)).toBeGreaterThan(0);
      expect(Number(coins)).toBeGreaterThan(0);
      // مكافأة XP لمستوى معتمد على XP = حلقة مغلقة، فإنجاز المستوى كوينز بس
      if (kind === "level") expect(Number(xp)).toBe(0);
      else expect(Number(xp)).toBeGreaterThan(0);
    }
  });

  it("أهداف المهمة الأسبوعية مطابقة لللي الصفحة بتعرضه", () => {
    expect(sql).toContain("c_steps  constant int := 5;");
    expect(sql).toContain("c_days   constant int := 3;");
    expect(sql).toContain("'أكمل ٥ مراحل وذاكر ٣ أيام'::text");
  });

  it("المهمة الأسبوعية مربوطة بمفتاح أسبوع واحد في المنتج", () => {
    // نفس أسبوع لوحة المتصدرين + يوم القاهرة
    expect(sql).toContain("public.current_quiz_week()");
    expect(sql).toContain("at time zone 'Africa/Cairo'");
  });
});
