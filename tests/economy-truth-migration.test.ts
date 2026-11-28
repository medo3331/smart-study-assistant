/**
 * عقد migration الاقتصاد (db/113 + db/114) — static contract على نمط
 * tests/engagement-games-proof-migration.test.ts. بيمسك أي رجوع forجي
 * للنسخ القديمة أو مسح حماية قبل ما يوصل للإنتاج.
 *
 * نسخة ٢: المسار المعتمد من الإنتاج — _award_coins_core + _award_coins_variable
 * (TABLE) والتحقق مقابل الجداول المرجعية، وحارس current_user (بدون bypass).
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

  it("المصادر المتغيرة: القيمة = القصوى المرجعية الحقيقية وسقوف الإنتاج", () => {
    // _award_coins_variable بتعامل rule.amount كحد أقصى صارم — لازم يغطي
    // أكبر قيمة مرجعية: first-course=300، w.120=120، mythic=1000.
    // سقف achievement = 5/يوم (قيمة الإنتاج الأصلية من db/45).
    expect(truth).toMatch(/\('achievement',\s*300,\s*5,\s*true\)/);
    expect(truth).toMatch(/\('wheel',\s*120,\s*1,\s*true\)/);
    expect(truth).toMatch(/\('box_refund',\s*1000,\s*null,\s*true\)/);
  });

  it("award_coins canonical: يوم القاهرة + تحقق حدث + else بيرفض", () => {
    expect(truth).toContain("v_day        text := public.cairo_day()::text");
    expect(truth).toContain("when 'break_riddle' then");
    expect(truth).toContain("when 'escape_room' then");
    expect(truth).toContain("when 'weekly_mission' then");
    expect(truth).toContain("شغّال من غير تحقق حدث");
  });

  it("award_coins definer بيحمّل source_class — وبدون مفهوم bypass", () => {
    expect(truth).toContain("security definer");
    expect(truth).toContain("source_class)\r\n    values (v_uid, p_source, v_amount, 'earn'".replace("\r\n", "\n"));
    expect(truth).not.toContain("coin_bypass");
  });

  it("_award_coins_core: نواة المنح الداخلية — revoked من كل الأدوار", () => {
    expect(truth).toContain("create or replace function public._award_coins_core(");
    expect(truth).toContain("revoke all on function public._award_coins_core(uuid, text, text, int, jsonb)");
    expect(truth).toContain("from public, anon, authenticated, service_role;");
    expect(truth).toContain("مبلغ المصدر % غير مطابق للقاعدة");
  });

  it("_award_coins_variable (TABLE): تحقق مرجعي صارم + ممنوعة على الأدوار", () => {
    expect(truth).toContain("returns table (awarded int, balance int, capped boolean)");
    expect(truth).toContain("_award_coins_variable: مصدر غير مسموح: %");
    expect(truth).toContain("_award_coins_variable: المبلغ % يتجاوز الحد الأعلى % للمصدر %");
    expect(truth).toContain("from public.achievements_catalog");
    expect(truth).toContain("from public.shop_wheel_prizes");
    expect(truth).toContain("from public.shop_refunds");
    expect(truth).toContain("revoke all on function public._award_coins_variable(text, text, int, jsonb)");
    // التفويض للنواة — مش insert مباشر
    expect(truth).toContain("select * from public._award_coins_core(v_uid, p_source, v_ref, p_amount, p_metadata)");
  });

  it("add_coins_grant: service_role بس + تصنيفات مقفولة + revoked", () => {
    expect(truth).toContain("p_source_class not in ('purchase', 'ads', 'admin')");
    expect(truth).toContain("add_coins_grant: مسار داخلي (service_role) بس");
    expect(truth).toContain("revoke all on function public.add_coins_grant");
  });

  it("P0-G — anon ممنوع من كل دوال المكافآت", () => {
    for (const fn of [
      "claim_break_game\\(text\\)", "claim_daily_mission\\(text\\)", "claim_weekly_mission\\(\\)",
      "answer_break_riddle\\(text\\)", "answer_break_quiz\\(text\\)", "solve_escape_step\\(text\\)",
      "sync_achievements\\(\\)", "spin_wheel\\(\\)", "open_box\\(text\\)", "purchase_item\\(text\\)",
    ]) {
      expect(truth).toMatch(new RegExp(`revoke execute on function public\\.${fn}\\s+from anon;`));
    }
  });
});

describe("db/114-economy-route-writers.sql", () => {
  it("كل الكتابات المباشرة اتحولت للمسار المركزي", () => {
    expect(writers).toContain("public.award_coins('break_game'");
    expect(writers).toContain("public.award_coins('daily_mission'");
    expect(writers).toContain("public.award_coins('weekly_mission'");
    expect(writers).toMatch(/_award_coins_variable\(\s*\n\s*'achievement'/);
    expect(writers).toMatch(/_award_coins_variable\(\s*\n?\s*'box_refund',\s*\n\s*null,\s*\n\s*v_refund/);
    expect(writers).toMatch(/_award_coins_variable\('wheel', v_id, v_coins/);
  });

  it("handle_signup_bonus بيمرّ على _award_coins_core — مش insert مباشر", () => {
    expect(writers).toContain("perform public._award_coins_core(");
    expect(writers).toContain("create trigger trg_signup_bonus");
  });

  it("حارس coin_ledger المعتمد: بيرفض أدوار الكلاينت مهما كان نوع الصف", () => {
    expect(writers).toContain("create trigger trg_coin_ledger_earn_guard");
    expect(writers).toContain("current_user in ('anon', 'authenticated', 'service_role')");
    expect(writers).toContain("client writes are not allowed");
    expect(writers).not.toContain("coin_bypass");
  });

  it("لا يوجد أي insert كسب مباشر في 114 (الصرف فقط مسموح هنا)", () => {
    const inserts = [...writers.matchAll(/insert into public\.coin_ledger[\s\S]*?;/g)].map((m) => m[0]);
    expect(inserts.length).toBeGreaterThan(0);
    for (const block of inserts) {
      expect(block.includes("'spend'")).toBe(true);
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
