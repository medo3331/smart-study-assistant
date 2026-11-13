/**
 * منطق تذكير السلسلة — نقي وقابل للاختبار.
 *
 * ⚠️ لا يستورد Supabase ولا Next: الراوت يستهلكه، والاختبارات تختبره مباشرة
 * (نفس نمط lib/cron/daily-maintenance.ts).
 */

/** أقل سلسلة تستاهل تذكير — تحت ٣ الأيام السلسلة لسه بتتبني، والتذكير بيبقى إزعاج. */
export const STREAK_REMINDER_MIN = 3;

export interface StreakRiskInput {
  streak: number | null | undefined;
  /** `profiles.last_study_day` بصيغة YYYY-MM-DD (أو ISO كامل). */
  lastStudyDay: string | null | undefined;
  /** يوم القاهرة النهارده YYYY-MM-DD (من cairoDateString). */
  today: string;
}

/**
 * هل الطالب محتاج تذكير؟
 *
 * Conditions:
 *   ١) `streak >= 3` — السلسلة بدأت تبقى شيئًا يستاهل الحماية.
 *   ٢) `last_study_day` مش النهارده (بيوم القاهرة) — يعني لسه ماذاكرش.
 *
 * ⚠️ `lastStudyDay = null` معناها «عمره ما سجّل مذاكرة». غالبًا حساب جديد،
 * وفيه `streak = 0` كمان فبيتفلتر من الشرط الأول. لو لقيت `streak >= 3`
 * و`last_study_day = null` (بيانات قديمة قبل ترحيل P0)، مانبعتش — مفيش دليل
 * إن فيه سلسلة فعلية نخاف عليها.
 */
export function isStreakAtRisk({ streak, lastStudyDay, today }: StreakRiskInput): boolean {
  const value = typeof streak === "number" && Number.isFinite(streak) ? Math.floor(streak) : 0;
  if (value < STREAK_REMINDER_MIN) return false;

  const last = typeof lastStudyDay === "string" ? lastStudyDay.slice(0, 10).trim() : "";
  if (last === "") return false;

  return last !== today;
}

/** جسم الإشعار — عنوان قصير + سطر واحد فيه رقم السلسلة. */
export function buildStreakReminderPayload(streak: number): {
  title: string;
  body: string;
  url: string;
  tag: string;
} {
  const days = Math.max(STREAK_REMINDER_MIN, Math.floor(Number.isFinite(streak) ? streak : STREAK_REMINDER_MIN));
  return {
    title: `🔥 سلسلتك (${days} يوم) في خطر!`,
    body: "لسه ما ذاكرتش النهارده. خلّص خطوة صغيرة واحدة قبل ما اليوم يخلص وسلسلتك تكمل.",
    url: "/dashboard",
    // tag ثابت: إشعار جديد بيستبدل القديم بدل ما يكوم إشعارات فوق بعض
    tag: "streak-reminder",
  };
}

/** تقسيم قائمة معرّفات إلى دفعات — لتجنّب طلب واحد ضخم على PostgREST. */
export function chunkIds<T>(items: readonly T[], size: number): T[][] {
  const safeSize = Math.max(1, Math.trunc(size));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += safeSize) {
    chunks.push(items.slice(i, i + safeSize));
  }
  return chunks;
}
