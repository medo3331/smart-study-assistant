/**
 * رسايل التحفيز — منطق نقي، بيتختبر لوحده.
 *
 * الفكرة: بدل ما الداشبورد يعرض نفس الكلام لكل الناس، بنقرا حالة الطالب
 * الحقيقية (XP، الترتيب، الكوينز، السلسلة، المهام) وبنطلع **رسالة واحدة**
 * ليها معنى في اللحظة دي — ووراها إجراء واضح.
 *
 * ⚠️ النبرة: تشجيع، مش ضغط. مفيش «متخيبش» ولا «مين هيفوتك» ولا عدّاد
 * فاضل. كل رسالة بتقول فرصة موجودة، أو بتقول إيه اللي ناقص بالرقم.
 *
 * ⚠️ الأرقام اللي بتتذكر في الرسايل جاية من نفس منابع الحقيقة:
 *    • عائد المرحلة   → STUDY_DAY_XP_REWARD (١٥٠)
 *    • محطات السلسلة → STREAK_BONUSES (٣/٧/٣٠)
 *    • أرخص عنصر     → STORE_ENTRY_PRICE (مرآة BANDS.common في catalog.ts،
 *      وفيه تست بيتأكد من التطابق)
 */

import { STREAK_BONUSES, nextStreakBonus } from "./streak-tiers";

/** أرخص عنصر مدفوع في المتجر — مرآة `BANDS.common[0]` في lib/shop/catalog.ts. */
export const STORE_ENTRY_PRICE = 80;

/** عائد المرحلة — مرآة STUDY_DAY_XP_REWARD في lib/shop/economy.ts. */
export const STEP_XP_REWARD = 150;

export type NudgeTone = "celebrate" | "push" | "tip";

export interface Nudge {
  id: string;
  icon: string;
  tone: NudgeTone;
  title: string;
  body: string;
  cta?: { label: string; href: string };
}

export interface NudgeInput {
  xp: number;
  coins: number;
  streak: number;
  /** ترتيبك في لوحة المتصدرين (١ = الأول). null = مش معروف لسه. */
  rank: number | null;
  /** كام XP بينك وبين اللي فوقك. null لو إنت الأول أو الرقم مش معروف. */
  xpToNextRank: number | null;
  missionsDone: number;
  missionsTotal: number;
}

const num = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};

/**
 * رسايل التحفيز مرتبة بالأهمية. أول رسالة هي اللي بتتعرض.
 *
 * الترتيب مقصود: اللحظات اللي بتفوت (ترتيب قريب، محطة سلسلة بكرة، مهمة
 * واحدة فاضلة) قبل النصايح العامة، لأن الأولى ليها فعل واضح في اليوم.
 */
export function buildNudges(input: NudgeInput): Nudge[] {
  const xp = num(input.xp);
  const coins = num(input.coins);
  const streak = num(input.streak);
  const rank = input.rank === null || input.rank === undefined ? null : Math.max(1, num(input.rank));
  const xpToNextRank = input.xpToNextRank === null || input.xpToNextRank === undefined
    ? null
    : num(input.xpToNextRank);
  const missionsDone = num(input.missionsDone);
  const missionsTotal = num(input.missionsTotal);

  const nudges: Nudge[] = [];

  // ── ١) أنت في القمة: تثبيت، مش تحدي ─────────────────────────────────
  if (rank === 1) {
    nudges.push({
      id: "rank-first",
      icon: "👑",
      tone: "celebrate",
      title: "أنت في المركز الأول على المنصة",
      body: `عندك ${xp} XP، وأنت المتصدّر دلوقتي. حافظ على إيقاعك — كل مرحلة بتزيد الفرق.`,
      cta: { label: "شوف لوحة المتصدرين", href: "/dashboard" },
    });
  }

  // ── ٢) قريب من المركز اللي فوقك ─────────────────────────────────────
  if (rank !== null && rank > 1 && xpToNextRank !== null && xpToNextRank > 0 && xpToNextRank <= STEP_XP_REWARD) {
    nudges.push({
      id: "rank-close",
      icon: "🎯",
      tone: "push",
      title: `تفصلك ${xpToNextRank} XP عن المركز ${rank - 1}`,
      body: `مرحلة واحدة مكتملة = ${STEP_XP_REWARD} XP، يعني كفاية تتخطّاه. ابدأ بخطوة صغيرة دلوقتي.`,
      cta: { label: "ذاكر مرحلة", href: "/dashboard" },
    });
  }

  // ── ٣) السلسلة على وشّ محطة ─────────────────────────────────────────
  const nextBonus = nextStreakBonus(streak);
  if (streak > 0 && nextBonus.daysLeft === 1) {
    nudges.push({
      id: "streak-tomorrow",
      icon: "🔥",
      tone: "push",
      title: `سلسلتك ${streak} أيام — محطة ${nextBonus.label} بكرة`,
      body: `لو ذاكرت النهاردة، بكرة توصل ${nextBonus.label}: ${nextBonus.coins} كوين + ${nextBonus.xp} XP.`,
      cta: { label: "افتح مهامي", href: "/missions" },
    });
  } else if (streak === 0) {
    nudges.push({
      id: "streak-start",
      icon: "🌱",
      tone: "tip",
      title: "ابدأ سلسلتك النهاردة",
      body: `يوم واحد بس يبدأ السلسلة. أول محطة بعد ${STREAK_BONUSES[0].every} أيام: ${STREAK_BONUSES[0].coins} كوين + ${STREAK_BONUSES[0].xp} XP.`,
      cta: { label: "ذاكر مرحلة", href: "/dashboard" },
    });
  }

  // ── ٤) فاضل مهمة واحدة على مكافآت النهاردة كلها ─────────────────────
  if (missionsTotal > 1 && missionsDone === missionsTotal - 1) {
    nudges.push({
      id: "missions-last-one",
      icon: "✨",
      tone: "push",
      title: "فاضل مهمة واحدة بس",
      body: `خلّصها وتكون استلمت كل مكافآت النهاردة (${missionsDone} من ${missionsTotal} خلصوا).`,
      cta: { label: "كمّل آخر مهمة", href: "/missions" },
    });
  }

  // ── ٥) الكوينز تكفي أول عنصر في المتجر ───────────────────────────────
  if (coins >= STORE_ENTRY_PRICE) {
    nudges.push({
      id: "coins-shop",
      icon: "🪙",
      tone: "tip",
      title: `عندك ${coins} كوين`,
      body: `تكفي أول عنصر في المتجر (يبدأ من ${STORE_ENTRY_PRICE} كوين). الكوينز بتتجمّع من المذاكرة والمهام والسلسلة.`,
      cta: { label: "افتح المتجر", href: "/shop" },
    });
  }

  // ── ٦) نصيحة عامة: دايماً فيه خطوة صغيرة مفيدة ───────────────────────
  nudges.push({
    id: "default-step",
    icon: "📘",
    tone: "tip",
    title: "خطوة واحدة النهاردة كفاية",
    body: `المرحلة المكتملة = ${STEP_XP_REWARD} XP + ٢٥ كوين. حتى لو ١٥ دقيقة، بتتحسب.`,
    cta: { label: "افتح خطتي", href: "/dashboard" },
  });

  return nudges;
}

/**
 * التذكير الذكي في صفحة المهام — نفس النص المستخدم في الداشبورد
 * (`TodayMissionsCard`) عشان الطالب يشوف نفس الكلام في المكانين.
 */
export function missionsSmartHint(done: number, total: number): string | null {
  const d = num(done);
  const t = num(total);
  if (t === 0) return null;
  const left = t - d;
  if (left === 0) return "كل مهام النهاردة خلصت — استلمت مكافآتها 🎉";
  if (left === 1) return "فاضل مهمة واحدة بس وتاخد كل مكافآت النهاردة!";
  return `فاضل ${left} مهام على مكافآت النهاردة كلها.`;
}
