/**
 * عقد migration الاقتصاد (db/113 + db/114) — static contract على نمط
 * tests/engagement-games-proof-migration.test.ts. بيمسك أي رجوع forجي
 * للنسخ القديمة أو مسح حماية قبل ما يوصل للإنتاج.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const root = join(__dirname, "..");
const truth = readFileSync(join(root, "db", "113-economy-truth.sql"), "utf8").replace(/\r\n/g, "\n");
const writers = readFileSync(join(root, "db", "114-economy-route-writers.sql"), "utf8").replace(/\r\n/g, "\n");

describe("db/113-economy-truth.sql", () => {
  it("source_class عمود additive + view اشتقاق للحركات القديمة", () => {
    expect(truth).toContain("add column if not exists source_class");
    expect(truth).toContain("create or replace view public.coin_ledger_classified");
  });

  it("السجل يشمل مصادر الألعاب (كانت بتنادى award_coins من غير قاعدة)", () => {
    for (const src of ["break_riddle", "break_riddle_fast", "break_game", "escape_room", "daily_mission", "weekly_mission", "achievement", "wheel", "box_refund"]) {
      expect(truth).toContain(`('${src}'`);
    }
  });

  it("escape_room = 25 (D-1) ومصادر الفلوس مقفولة (D-M-01/D-M-05)", () => {
    expect(truth).toMatch(/\('escape_room',\s*25,\s*1,\s*true\)/);
    expect(truth).toMatch(/\('purchase',/);
    expect(truth).toMatch(/\('purchase',\s*\d+,\s*\d+,\s*false\)/);
    expect(truth).toMatch(/\('ad_reward',\s*5,\s*3,\s*false\)/);
  });

  it("award_coins canonical: يوم القاهرة + تحقق حدث + else بيرفض", () => {
    expect(truth).toContain("v_day        text := public.cairo_day()::text");
    expect(truth).toContain("when 'break_riddle' then");
    expect(truth).toContain("when 'escape_room' then");
    expect(truth).toContain("when 'weekly_mission' then");
    expect(truth).toContain("شغّال من غير تحقق حدث");
  });

  it("award_coins بيعمل coin_bypass حوالين الـ insert بس", () => {
    expect(truth).toMatch(/set_config\('app\.coin_bypass', 'on', true\)/);
  });

  it("_award_coins_variable ممنوعة على anon/authenticated وبها حدود مبلغ", () => {
    expect(writers.length).toBeGreaterThan(0);
    expect(truth).toContain("_award_coins_variable: نداء من خارج المسار الداخلي");
    expect(truth).toContain("revoke all on function public._award_coins_variable");
    expect(truth).toContain("array[1, 500]");
  });

  it("add_coins_grant: service_role بس + تصنيفات مقفولة + revoked", () => {
    expect(truth).toContain("p_source_class not in ('purchase', 'ads', 'admin')");
    expect(truth).toContain("add_coins_grant: مسار داخلي (service_role) بس");
    expect(truth).toContain("revoke all on function public.add_coins_grant");
  });
});

describe("db/114-economy-route-writers.sql", () => {
  it("كل الكتابات المباشرة اتحولت للمسار المركزي", () => {
    expect(writers).toContain("public.award_coins('break_game'");
    expect(writers).toContain("public.award_coins('daily_mission'");
    expect(writers).toContain("public.award_coins('weekly_mission'");
    expect(writers).toMatch(/_award_coins_variable\(\s*'achievement'/);
    expect(writers).toContain("'box_refund', null, v_refund");
    expect(writers).toContain("'wheel', v_day, v_coins");
  });

  it("حارس coin_ledger موجود على earn وبيسمح بالصرف", () => {
    expect(writers).toContain("create trigger trg_guard_coin_ledger_earn");
    expect(writers).toContain("new.source_type = 'earn'");
    expect(writers).toContain("app.coin_bypass");
  });

  it("لا يوجد insert كسب مباشر جديد خارج مسارات التصريح", () => {
    // الـ inserts المسموحة: داخل award_coins (في 113) أو داخل بلوكات bypass في 114
    const earnInserts = [...writers.matchAll(/insert into public\.coin_ledger[\s\S]*?;/g)].map(
      (m) => m[0],
    );
    expect(earnInserts.length).toBeGreaterThan(0);
    for (const block of earnInserts) {
      const isSpend = block.includes("'spend'");
      const hasBypass = /set_config\('app\.coin_bypass', 'on', true\)/.test(
        writers.slice(Math.max(0, writers.indexOf(block) - 400), writers.indexOf(block)),
      );
      expect(isSpend || hasBypass).toBe(true);
    }
  });

  it("الملفات القديمة عليها هيدر Deprecation", () => {
    for (const f of [
      "db/shop.sql",
      "db/43-retention-p0-streak.sql",
      "db/44-retention-phase-2-tiers.sql",
      "db/45-retention-phase-3-achievements.sql",
      "db/worship.sql",
      "db/economy-phase-4-foundation.sql",
      "db/gamification.sql",
      "db/break-zone.sql",
    ]) {
      expect(readFileSync(join(root, f), "utf8").split("\n")[0]).toContain("DEPRECATED بعد db/113");
    }
  });
});
