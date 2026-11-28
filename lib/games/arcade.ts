/**
 * Arcade Foundation — العقد المشترك بين الواجهة والسيرفر (db/124).
 *
 * ⚠️ `levelFor` لازم يفضل مطابق لـ `arcade_level` في db/124:
 *      level = floor(sqrt(max(xp,0))/5) + 1
 *    الاختبارات بتمسك الاتنين (tests/gaming-hub-migration.test.ts).
 *
 * الألعاب بتكسب XP أساسًا — الكوينز من الألعاب محدودة:
 *   - أول فوز في اليوم لكل لعبة = ٥ كوين (coin_source_rules.arcade_win).
 *   - كل إنجاز = مرة واحدة (game_achievements) بمكافأة 'achievement'.
 *   الواجهة ماتبعتش XP خالص — السيرفر بيحسبه من النتيجة والفوز.
 */

export const ARCADE_GAMES = [
  "chess", "memory", "reaction", "quiz", "penalty", "blocks", "run",
] as const;
export type ArcadeGame = (typeof ARCADE_GAMES)[number];

export const ARCADE_GAME_NAMES: Record<ArcadeGame, string> = {
  chess: "Magicly Chess ♟️",
  memory: "Memory Match 🧠",
  reaction: "Reaction Test ⚡",
  quiz: "Quiz Rush 🏃",
  penalty: "جول ولا لا؟ ⚽",
  blocks: "Magic Blocks 🧱",
  run: "Magicly Run 🏃‍♂️",
};

export function levelFor(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(xp, 0)) / 5) + 1;
}

/** نقاط XP اللازمة لبداية المستوى التالي (لشريط التقدم) */
export function xpForLevel(level: number): number {
  return Math.pow((level - 1) * 5, 2);
}

export type Achievement = {
  id: string;
  title: string;
  desc: string;
  icon: string;
};

/**
 * إنجازات Arcade — نفس المعرفات اللي السيرفر بيفتحها في
 * arcade_submit_score (db/124). أي إنجاز هنا لازم يكون هناك.
 */
export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: "arcade_first_win", title: "أول فوز", desc: "اكسب أول جولة في أي لعبة", icon: "🏅" },
  { id: "arcade_wins_10", title: "محترف الانتصارات", desc: "١٠ انتصارات في نفس اللعبة", icon: "🏆" },
  { id: "arcade_plays_25", title: "مثابر", desc: "٢٥ جولة في نفس اللعبة", icon: "🎯" },
  { id: "arcade_best_500", title: "صاحب الرقم", desc: "رقم قياسي ٥٠٠+ في نفس اللعبة", icon: "⭐" },
  { id: "arcade_level_5", title: "Arcade Rookie", desc: "اوصل مستوى ٥", icon: "🚀" },
  { id: "arcade_level_12", title: "Arcade Explorer", desc: "اوصل مستوى ١٢", icon: "👑" },
] as const;

export type GameProfileRow = {
  game_id: string;
  xp: number;
  best_score: number;
  plays: number;
  wins: number;
};
