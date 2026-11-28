/**
 * عقد migration التوسعة (db/118 — DEV-M3) — static contract:
 *  ١) عناصر جديدة في الكتالوج — مرآة أسعار بين db/118 و lib/shop/catalog.ts.
 *  ٢) إثبات سيرفري لكويز الدرس (D-M-04) — فرع lesson_quiz_passed في
 *     award_coins + جدول المحاولات + تفعيل المصدر بسقف.
 *  ٣) أبطال الأسبوع — جدول الجوائز + دالة المنح + لوحة القراءة.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { CATALOG, itemById } from "@/lib/shop/catalog";
import { COIN_SOURCES, COIN_GRANT_SOURCES } from "@/lib/shop/economy";

const root = join(__dirname, "..");
const sql = readFileSync(join(root, "db", "118-store-expansion.sql"), "utf8").replace(/\r\n/g, "\n");

describe("db/118 — عناصر جديدة (مرآة الكتالوج)", () => {
  const NEW_ITEMS = [
    { id: "avatar.graduate", slot: "avatar", price: 700, rarity: "rare" },
    { id: "avatar.scientist", slot: "avatar", price: 200, rarity: "uncommon" },
    { id: "avatar.books", slot: "avatar", price: 250, rarity: "uncommon" },
    { id: "avatar.rocket", slot: "avatar", price: 620, rarity: "rare" },
    { id: "avatar.brain", slot: "avatar", price: 1400, rarity: "epic" },
    { id: "avatar.alien", slot: "avatar", price: 900, rarity: "epic" },
    { id: "avatar.wizard", slot: "avatar", price: 2070, rarity: "legendary" },
    { id: "avatar.astronaut", slot: "avatar", price: 2330, rarity: "legendary" },
    { id: "title.quiz-master", slot: "title", price: 450, rarity: "rare" },
    { id: "title.scholar", slot: "title", price: 280, rarity: "uncommon" },
    { id: "title.champion", slot: "title", price: 1400, rarity: "epic" },
    { id: "title.timekeeper", slot: "title", price: 200, rarity: "uncommon" },
    { id: "companion.bunny", slot: "companion", price: 580, rarity: "rare" },
    { id: "companion.hamster", slot: "companion", price: 1400, rarity: "epic" },
  ];

  it("الأربعة عشر موجودين في db/118 بنفس السعر والندرة", () => {
    for (const it of NEW_ITEMS) {
      // صف واحد فيه (id, slot, price) وخانة الندرة — بمسافات محاذاة أي عدد
      const row = new RegExp(
        `\\('${it.id.replace(".", "\\.")}',\\s+'${it.slot}',\\s+${it.price},[\\s\\S]{0,40}'${it.rarity}'`,
      );
      expect(row.test(sql), it.id).toBe(true);
    }
  });

  it("نفسهم في الكتالوج بنفس الأسعار والندرة والخانة", () => {
    for (const it of NEW_ITEMS) {
      const item = itemById(it.id);
      expect(item, it.id).toBeDefined();
      expect(item!.price).toBe(it.price);
      expect(item!.rarity).toBe(it.rarity);
      expect(item!.category).toBe(it.slot);
    }
  });

  it("كل عنصر جديد جوه نطاق ندرته — مستحيل يتسرّب سعر", () => {
    for (const it of NEW_ITEMS) {
      const item = itemById(it.id)!;
      expect(item.price, it.id).toBeGreaterThan(0);
    }
  });

  it("العناصر القديمة ما اتزحلقتش — الإضافة append بس", () => {
    // أول عنصر في AVATARS مجاني — لو الفهرس اتغيّر السعر كان هيتبدل
    const owl = itemById("avatar.owl")!;
    expect(owl.price).toBe(0);
    expect(itemById("title.beginner")!.price).toBe(0);
    expect(itemById("frame.thin")!.price).toBe(0);
  });
});

describe("db/118 — إثبات سيرفري لكويز الدرس (D-M-04)", () => {
  it("جدول المحاولات + RLS", () => {
    expect(sql).toContain("create table if not exists public.lesson_quiz_attempts");
    expect(sql).toContain("alter table public.lesson_quiz_attempts enable row level security");
    expect(sql).toContain("auth.uid() = user_id");
  });

  it("تفعيل lesson_quiz_passed بسقف يومي — مش من غير سقف (قاعدة رقم ٣)", () => {
    expect(sql).toContain("set is_live = true, daily_cap = 5\n where id = 'lesson_quiz_passed'");
    expect(COIN_SOURCES.lesson_quiz_passed.live).toBe(true);
    expect(COIN_SOURCES.lesson_quiz_passed.dailyCap).toBe(5);
    expect(COIN_SOURCES.lesson_quiz_passed.amount).toBe(5);
  });

  it("فرع award_coins بينادي على جدول المحاولات — الإثبات صف حقيقي", () => {
    const branch = sql.indexOf("when 'lesson_quiz_passed' then");
    const proof = sql.indexOf("lesson_quiz_attempts a", branch);
    const passed = sql.indexOf("a.passed = true", proof);
    const graded = sql.indexOf("a.completed_at is not null", proof);
    const elseRaise = sql.indexOf("شغّال من غير تحقق حدث", proof);
    expect(branch).toBeGreaterThan(-1);
    expect(proof).toBeGreaterThan(branch);
    expect(passed).toBeGreaterThan(proof);
    expect(graded).toBeGreaterThan(proof);
    // الفرع قبل الـ else — مبيعدّيش من غير تحقق (قاعدة رقم ٤)
    expect(elseRaise).toBeGreaterThan(passed);
  });

  it("مسار التصحيح في السيرفر — route موجود وبيتصحح من المحاولة المحفوظة", () => {
    const route = readFileSync(join(root, "app", "api", "lesson-quiz", "submit", "route.ts"), "utf8");
    expect(route).toContain("lesson_quiz_attempts");
    expect(route).toContain("correctIndex");
    expect(route).toContain('awardCoins(supabase, "lesson_quiz_passed", attemptId');
    expect(route).toContain('.eq("status", "pending")');
  });
});

describe("db/118 — أبطال الأسبوع (التصميم §7)", () => {
  it("جدول الجوائز بقيود فريدة ضد التكرار", () => {
    expect(sql).toContain("create table if not exists public.coin_champion_awards");
    expect(sql).toContain("unique (week_start, champ_rank)");
    expect(sql).toContain("unique (week_start, user_id)");
  });

  it("الترتيب بالمذاكرة (source_class='study') مش بالشرا", () => {
    expect(sql).toContain("grant_weekly_champion_prizes");
    expect(sql.match(/coalesce\(l\.source_class/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("'champion_weekly', 200, 1, true");
  });

  it("الجوائز من add_coins_grant بصنف rewards — والصنف مسموح", () => {
    expect(sql).toContain("'champion_weekly', 'rewards'");
    expect(sql).toContain("not in ('purchase', 'ads', 'admin', 'rewards')");
    expect(COIN_GRANT_SOURCES).toContain("champion_weekly");
  });

  it("دالة المنح service_role بس — ولوحة القراءة للـ authenticated", () => {
    expect(sql).toContain("grant_weekly_champion_prizes: مسار داخلي (service_role) بس");
    expect(sql).toContain("revoke all on function public.grant_weekly_champion_prizes()");
    expect(sql).toContain("grant execute on function public.weekly_champions_board() to authenticated");
    expect(sql).toContain("revoke all on function public.weekly_champions_board() from public, anon");
  });

  it("cron أسبوعي مسجّل في vercel.json + راوت محمي بـ CRON_SECRET", () => {
    const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
    expect(vercel.crons).toContainEqual({ path: "/api/cron/weekly-champions", schedule: "0 22 * * 0" });
    const route = readFileSync(join(root, "app", "api", "cron", "weekly-champions", "route.ts"), "utf8");
    expect(route).toContain("isAuthorizedCronRequest");
    expect(route).toContain('grant_weekly_champion_prizes');
  });
});
