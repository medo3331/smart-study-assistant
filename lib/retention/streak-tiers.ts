/**
 * محطات مكافآت السلسلة — مصدر واحد للواجهة.
 *
 * ⚠️ الأرقام دي **مرآة** لمنطق `public._streak_apply()` في
 * `db/44-retention-phase-2-tiers.sql`:
 *   streak % 3  = 0  → streak_tier_3   → ١٥ كوين (من coin_source_rules) + ١٥ XP
 *   streak % 7  = 0  → perfect_week    → ١٢٠ كوين + ٥٠ XP
 *   streak % 30 = 0  → streak_tier_30  → ٢٥٠ كوين + ٢٠٠ XP
 *
 * أي تعديل لازم يتعمل في الملفين، و`streak-tiers.test.ts` بيتأكد إن الأرقام
 * هنا مطابقة للمكتوب في الـ SQL (بيقرا الملف نفسه) — عشان مايحصلش drift بين
 * اللي الطالب بيشوفه واللي بيتصرف فعلاً.
 */

export interface StreakBonus {
  /** كل كام يوم بتتصرف */
  every: 3 | 7 | 30;
  coins: number;
  xp: number;
  label: string;
}

export const STREAK_BONUSES: readonly StreakBonus[] = [
  { every: 3, coins: 15, xp: 15, label: "بونص ٣ أيام" },
  { every: 7, coins: 120, xp: 50, label: "بونص الأسبوع" },
  { every: 30, coins: 250, xp: 200, label: "بونص الشهر" },
];

export interface NextStreakBonus {
  /** اليوم اللي هيتصرف فيه (٣، ٦، ٧، ١٢، ١٤، ٣٠...) */
  day: number;
  /** كام يوم فاضل من السلسلة الحالية */
  daysLeft: number;
  coins: number;
  xp: number;
  label: string;
}

function bonusFor(every: number): StreakBonus {
  const found = STREAK_BONUSES.find((b) => b.every === every);
  if (!found) throw new Error(`مفيش محطة معرّفة كل ${every} يوم`);
  return found;
}

/**
 * أقرب محطة جاية بعد السلسلة الحالية.
 *
 * مثال: سلسلة ٥ أيام ⇒ المحطة القادمة يوم ٦ (٣ أيام، فاضل يوم)، لأن ٦ < ٧.
 * سلسلة ٧ ⇒ القادمة يوم ٩ (فاضل يومين) — مش ١٠، لأن محطة الـ٣ بتيجي الأول.
 * لو السلسلة ٠ (لسه مابدأش) بنرجّع أول محطة يوم ٣.
 */
export function nextStreakBonus(streak: number): NextStreakBonus {
  const current = Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0;

  let best: NextStreakBonus | null = null;
  for (const bonus of STREAK_BONUSES) {
    // أصغر مضاعف للمحطة أكبر من السلسلة الحالية
    const day = (Math.floor(current / bonus.every) + 1) * bonus.every;
    const candidate: NextStreakBonus = {
      day,
      daysLeft: day - current,
      coins: bonus.coins,
      xp: bonus.xp,
      label: bonus.label,
    };
    // الأقرب زمنيًا، ولو اتساووا (مثال: سلسلة ٠ ⇒ ٣ و٣؟) الأكبر مكافأة
    if (
      !best ||
      candidate.day < best.day ||
      (candidate.day === best.day && candidate.coins > best.coins)
    ) {
      best = candidate;
    }
  }

  // `best` مش null عمليًا (STREAK_BONUSES مش فاضية) — السطر ده للإرضاء النوعي
  return best ?? { day: 3, daysLeft: 3, coins: bonusFor(3).coins, xp: bonusFor(3).xp, label: bonusFor(3).label };
}

/** هل السلسلة الحالية بتستحق مكافأة النهارده؟ (نفس شرط الـ SQL: % كل محطة) */
export function bonusesForStreak(streak: number): StreakBonus[] {
  const current = Math.max(0, Math.floor(Number.isFinite(streak) ? streak : 0));
  if (current === 0) return [];
  return STREAK_BONUSES.filter((b) => current % b.every === 0);
}
