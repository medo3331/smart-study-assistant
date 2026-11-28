/**
 * عقد Gaming Hub 🎮 (db/124 — DEV-M3 جزء ٦ — Arcade Foundation) — static:
 *   - game_profiles / game_achievements بجداول وRLS مالك-بس.
 *   - arcade_level نفس معادلة الواجهة (levelFor في lib/games/arcade.ts).
 *   - arcade_submit_score: clamp + XP من السيرفر (الواجهة ماتبعتش XP)
 *     + مكافأة arcade_win + إنجازات game_achievements.
 *   - arcade_leaderboard: security definer + top 20 + social_profiles.
 *   - محرك الشطرنج + واجهة اللعبة + Hub مستوردين صح.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { levelFor, ACHIEVEMENTS, ARCADE_GAMES } from "@/lib/games/arcade";

const root = join(__dirname, "..");
const sql = readFileSync(join(root, "db", "124-gaming-hub.sql"), "utf8").replace(/\r\n/g, "\n");
const arcade = readFileSync(join(root, "lib", "games", "arcade.ts"), "utf8").replace(/\r\n/g, "\n");
const engine = readFileSync(join(root, "lib", "games", "chess", "engine.ts"), "utf8").replace(/\r\n/g, "\n");
const ai = readFileSync(join(root, "lib", "games", "chess", "ai.ts"), "utf8").replace(/\r\n/g, "\n");
const chessPage = readFileSync(join(root, "app", "games", "chess", "page.tsx"), "utf8").replace(/\r\n/g, "\n");
const hubPage = readFileSync(join(root, "app", "games", "page.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("db/124 — الجداول والصلاحيات", () => {
  it("game_profiles موجود بمفتاح (user_id, game_id)", () => {
    expect(sql).toContain("create table if not exists public.game_profiles");
    expect(sql).toContain("primary key (user_id, game_id)");
  });

  it("RLS مفعّل والسياسات للمالك بس", () => {
    expect(sql).toContain("alter table public.game_profiles enable row level security");
    expect(sql).toContain("alter table public.game_achievements enable row level security");
    expect(sql).toContain("using (auth.uid() = user_id)");
    // الإنجازات مش المفروض تتعدل من الواجهة — قراءة + إدراج بس
    expect(sql).not.toContain('"game_achievements_owner_all"');
  });

  it("الإنجازات بينفتحوا مرة واحدة (primary key على achievement_id)", () => {
    expect(sql).toContain("primary key (user_id, achievement_id)");
  });
});

describe("db/124 — arcade_level مطابق للواجهة", () => {
  it("نفس المعادلة: floor(sqrt(xp)/5) + 1", () => {
    expect(sql).toMatch(/floor\(sqrt\(greatest\(coalesce\(p_xp, 0\), 0\)\) \/ 5\.0\)::int \+ 1/);
    expect(arcade).toContain("Math.floor(Math.sqrt(Math.max(xp, 0)) / 5) + 1");
    expect(levelFor(3450)).toBe(12);
    expect(levelFor(0)).toBe(1);
  });
});

describe("db/124 — arcade_submit_score (سيرفر-أوثوريتيتيف)", () => {
  it("clamp للنتيجة + حماية الزائر", () => {
    expect(sql).toContain("greatest(0, least(coalesce(p_score, 0), 100000))");
    expect(sql).toContain("is_anonymous");
  });

  it("الـ XP بيتحسب من السيرفر — الواجهة ماتبعتش XP خالص", () => {
    expect(sql).toContain("v_gain := case when p_won then 60");
    // التوقيع مافيهوش باراميتر xp
    expect(sql).toMatch(/arcade_submit_score\(\s*\n\s*p_game\s+text,\s*\n\s*p_score\s+integer,\s*\n\s*p_won\s+boolean/);
  });

  it("أول فوز/يوم = 5 كوين عبر award_coins برفid يومي", () => {
    expect(sql).toContain("('arcade_win', 5, 1, true)");
    expect(sql).toContain("award_coins('arcade_win', p_game || ':' || public.cairo_day()::text)");
  });

  it("الإنجازات بتتفتح جوا الـ RPC (مش من الواجهة) وكل إنجاز مرة", () => {
    expect(sql).toContain("insert into public.game_achievements");
    expect(sql).toContain("on conflict (user_id, achievement_id) do nothing");
    expect(sql).toContain("award_coins('achievement', 'arcade:' || v_id)");
  });
});

describe("db/124 — arcade_leaderboard", () => {
  it("security definer + top 20 + أسماء social_profiles", () => {
    expect(sql).toMatch(/function public\.arcade_leaderboard\(p_game text\)[\s\S]*?security definer/);
    expect(sql).toContain("left join public.social_profiles sp on sp.user_id = gp.user_id");
    expect(sql).toContain("limit 20");
    expect(sql).toContain("revoke all on function public.arcade_leaderboard(text) from public, anon;");
  });
});

describe("Magicly Chess ♟️", () => {
  it("المحرك بيغطي القواعد: تبييت + تجاوز + ترقية + مات/حصر", () => {
    expect(engine).toContain('"ep"');
    expect(engine).toContain('"castle"');
    expect(engine).toContain('"double"');
    expect(engine).toContain('"stalemate"');
    expect(engine).toContain("isAttacked");
  });

  it("الـ AI minimax بعمق حسب الصعوبة مع أكل أولًا", () => {
    expect(ai).toContain("alpha");
    expect(ai).toContain("beta");
    expect(ai).toContain("difficulty - 1");
  });

  it("الواجهة بتسجل النتيجة عبر arcade_submit_score ومرة واحدة بس", () => {
    expect(chessPage).toContain('supabase.rpc("arcade_submit_score"');
    expect(chessPage).toContain("submitted");
    expect(chessPage).toContain('p_game: "chess"');
  });
});

describe("Gaming Hub", () => {
  it("صفحة /games فيها بروفايل اللاعب + ترتيب + إنجازات", () => {
    expect(hubPage).toContain("arcade_leaderboard");
    expect(hubPage).toContain("game_profiles");
    expect(hubPage).toContain("game_achievements");
    expect(hubPage).toContain("Magicly Chess");
  });

  it("لينك الشطرنج متاح في الـ Hub", () => {
    expect(hubPage).toContain('href: "/games/chess"');
  });

  it("إنجازات الواجهة نفس معرفات السيرفر", () => {
    for (const id of ["arcade_first_win", "arcade_wins_10", "arcade_plays_25", "arcade_best_500", "arcade_level_5", "arcade_level_12"]) {
      expect(sql).toContain(`'${id}'`);
      expect(ACHIEVEMENTS.some((a) => a.id === id)).toBe(true);
    }
  });

  it("الألعاب المسجلة في السيرفر نفس قائمة الواجهة", () => {
    for (const g of ARCADE_GAMES) expect(sql).toContain(`'${g}'`);
  });
});
