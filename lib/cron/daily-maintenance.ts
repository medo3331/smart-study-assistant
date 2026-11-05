import { timingSafeEqual } from "node:crypto";

/**
 * منطق cron الصيانة اليومية — نقي وقابل للاختبار.
 *
 * ⚠️ لا يستورد Supabase ولا Next: الراوت يستهلكه، والاختبارات تختبره مباشرة.
 */

/** نافذة منح الكريدت الشهري: أول 3 أيام من الشهر (فرصة لتعويض فشل اليوم الأول). */
export const GRACE_WINDOW_START = 1;
export const GRACE_WINDOW_END = 3;

/** هل اليوم الحالي داخل نافذة المنح الشهري؟ (1..3) */
export function isMonthlyGraceWindow(
  date: Date,
  start: number = GRACE_WINDOW_START,
  end: number = GRACE_WINDOW_END
): boolean {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  const day = date.getDate();
  return day >= start && day <= end;
}

/**
 * مقارنة آمنة زمنيًا لترويسة Authorization مع `Bearer <secret>`.
 *
 * فشل مُغلق: لو `secret` غير مضبوط في البيئة ⇒ false دائمًا (لا cron مفتوح).
 * الأطوال المختلفة تُقارن بأمان دون رمي (timingSafeEqual يرفض أطوالًا مختلفة).
 */
export function isAuthorizedCronRequest(
  authorizationHeader: string | null | undefined,
  secret: string | null | undefined
): boolean {
  const expectedSecret = (secret ?? "").trim();
  if (expectedSecret === "") return false;

  const header = (authorizationHeader ?? "").trim();
  const expected = `Bearer ${expectedSecret}`;
  if (header.length === 0) return false;

  const headerBuf = Buffer.from(header, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (headerBuf.length !== expectedBuf.length) return false;

  try {
    return timingSafeEqual(headerBuf, expectedBuf);
  } catch {
    return false;
  }
}

/** تقسيم قائمة مستخدمين إلى صفحات ثابتة — لتجنّب تحميل كل الصفوف مرة واحدة. */
export function nextPageRange(page: number, pageSize: number): [number, number] {
  const safePage = Math.max(0, Math.trunc(page));
  const safeSize = Math.max(1, Math.trunc(pageSize));
  const from = safePage * safeSize;
  return [from, from + safeSize - 1];
}
