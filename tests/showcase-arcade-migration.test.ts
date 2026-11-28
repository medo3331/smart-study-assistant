/**
 * عقد Showcase 🏆 + Arcade (db/122 — DEV-M3 جزء ٥) — static contract:
 *   - get_showcase_by_code: RPC عام بالكود، محمي بـ p_allow (الخصوصية)،
 *     والمقتنيات من shop_inventory للمستخدم نفسه (المفضلة الأول، حد ٦).
 *   - claim_break_game يقبل 'penalty' (جول ولا لا؟) مع نفس السقف والشرط.
 *   - صفحة /games وnav "الألعاب" موجودين.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const root = join(__dirname, "..");
const sql = readFileSync(join(root, "db", "122-showcase-arcade.sql"), "utf8").replace(/\r\n/g, "\n");
const uPage = readFileSync(join(root, "app", "u", "[code]", "page.tsx"), "utf8").replace(/\r\n/g, "\n");
const breakPage = readFileSync(join(root, "app", "break", "page.tsx"), "utf8").replace(/\r\n/g, "\n");
const escapePage = readFileSync(join(root, "app", "escape-room", "page.tsx"), "utf8").replace(/\r\n/g, "\n");
const penaltyGame = readFileSync(join(root, "app", "games", "components", "PenaltyShootout.tsx"), "utf8").replace(/\r\n/g, "\n");
const gamesPage = readFileSync(join(root, "app", "games", "page.tsx"), "utf8").replace(/\r\n/g, "\n");
const navConfig = readFileSync(join(root, "app", "dashboard", "components", "nav-config.ts"), "utf8").replace(/\r\n/g, "\n");

describe("db/122 — get_showcase_by_code", () => {
  it("الـ RPC موجود ومعاه حارس الخصوصية p_allow", () => {
    expect(sql).toContain("function public.get_showcase_by_code(p_code text, p_allow boolean default false)");
    // الخصوصية: بدون إذن مافيش داتا
    expect(sql).toContain("if not p_allow then return null; end if;");
  });

  it("بيقرأ من shop_inventory وshop_equipped للمستخدم المستهدف بس", () => {
    expect(sql).toContain("from public.shop_inventory i");
    expect(sql).toContain("i.user_id = v_uid");
  });

  it("المفضلة الأول وحد ٦ عناصر في الـ Showcase", () => {
    expect(sql).toMatch(/order by i\.favorite desc, i\.purchased_at desc/);
    expect(sql).toMatch(/limit 6/);
  });

  it("بيستبعد العناصر المجانية من الـ Showcase (الكتالوج بس بسعر > ٠)", () => {
    expect(sql).toContain("c.price > 0");
  });

  it("الصلاحيات: مش متاح لـ anon/public، ومتاح لـ authenticated", () => {
    expect(sql).toContain("revoke all on function public.get_showcase_by_code(text, boolean) from public, anon;");
    expect(sql).toContain("grant execute on function public.get_showcase_by_code(text, boolean) to authenticated;");
  });
});

describe("db/122 — claim_break_game يقبل penalty", () => {
  it("'penalty' في قائمة الألعاب المسموحة", () => {
    expect(sql).toContain("'penalty'");
  });

  it("نفس العقد المالي: مكافأة عبر award_coins ومشروطة بنشاط دراسي", () => {
    expect(sql).toContain("award_coins('break_game'");
    expect(sql).toContain("break_studied_today(v_uid)");
  });
});

describe("واجهة Showcase على البروفايل العام", () => {
  it("صفحة /u/[code] بتنادي get_showcase_by_code بـ p_allow حسب الخصوصية", () => {
    expect(uPage).toContain('supabase.rpc("get_showcase_by_code"');
    expect(uPage).toContain("p_allow: showAcademic");
  });

  it("فيها قسم My Showcase وعرض اللقب والأفاتار الملبوسين", () => {
    expect(uPage).toContain("🏆 My Showcase");
    expect(uPage).toContain("equippedTitle");
    expect(uPage).toContain("equippedAvatarEmoji");
  });
});

describe("Arcade وخط الألعاب", () => {
  it("صفحة /games موجودة وفيها الألعاب الحية والقادمة", () => {
    expect(gamesPage).toContain("Magicly Arcade");
    expect(gamesPage).toContain("Magicly Chess");
    expect(gamesPage).toContain("Magic Battle Pass");
  });

  it("لعبة جول ولا لا؟ واقعية: كورة بتطير + شبكة + حارس بينط — وبتكافئ penalty", () => {
    expect(penaltyGame).toContain("جول ولا لا؟");
    expect(penaltyGame).toContain("claim_break_game");
    expect(penaltyGame).toMatch(/next >= 3/);
    // الواقعية: الكورة بتتحرك (transition + مواضع) والحارس بينط (rotate)
    expect(penaltyGame).toContain("transition-all");
    expect(penaltyGame).toContain("repeating-linear-gradient"); // الشبكة
    expect(penaltyGame).toMatch(/rotate/);
  });

  it("كل الألعاب في مكان واحد: /break و/escape-room بيعملوا redirect لـ /games", () => {
    expect(breakPage).toContain('redirect("/games")');
    expect(escapePage).toContain('redirect("/games")');
    // الـ Hub نفسه فيه كل الألعاب جواه
    expect(gamesPage).toContain("EscapeRoomGame");
    expect(gamesPage).toContain("PenaltyShootout");
    expect(gamesPage).toContain("ReactionTest");
    expect(gamesPage).toContain("QuizRush");
    expect(gamesPage).toContain("DailyRiddle");
    expect(gamesPage).toContain("BreakTimer");
    expect(gamesPage).toContain("MemoryGame");
  });

  it("nav فيه عنصر الألعاب", () => {
    expect(navConfig).toContain('id: "arcade"');
    expect(navConfig).toContain('href: "/games"');
  });
});
