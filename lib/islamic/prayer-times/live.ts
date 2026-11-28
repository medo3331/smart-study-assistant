/**
 * أدوات نقية (بدون React وبدون شبكة) لتحديث مواقيت الصلاة الحيّ.
 *
 * كل الحسابات هنا pure وتاخد "اللحظة الحالية" كمدخل صريح (أو تعتمد على
 * Date.now() في نقطة واحدة فقط) — عشان تتحقق في vitest مباشرة وتتعوّض
 * عن drift الساعة لما المستخدم يسيب التبويب ويرجع.
 */

/** دقة تقريب الإحداثيات في مفتاح الكاش (~0.01° ≈ 1.1 كم) — بقيم صحيحة بدون artifacts عشرية. */
export const COORDINATE_QUANTUM = 0.01;

/**
 * تقريب إحداثي لأقرب خطوة 0.01° كعدد صحيح من «السنتات».
 * بنرجّع عدد صحيح (مثلاً 3004 لـ 30.0444) عشان مفتاح الكاش يبقى ثابت
 * بدون أخطاء الفاصلة العائمة، ونفس نقطة دايماً بتعطي نفس المفتاح.
 */
export function roundCoordinate(value: number): number {
  return Math.round(value / COORDINATE_QUANTUM);
}

/** عتبة اعتبار أن المستخدم غيّر مكانه فعلاً (بالدرجات) — ~0.01° ≈ 1.1 كم. */
export const LOCATION_CHANGE_THRESHOLD_DEGREES = 0.01;

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * هل انتقل المستخدم مسافة تُعتبر تغيّر موقع؟ (مسافة إقليدية بالدرجات)
 * بنقارن ضد العتبة نفسها المستخدمة في تقريب مفتاح الكاش — يعني أي حركة
 * تعدي المفتاح القديم بتتعمل إعادة جلب فوري، وأقل منها بنستنى التحديث الدوري.
 */
export function hasLocationChangedSignificantly(
  a: GeoCoordinates,
  b: GeoCoordinates,
  thresholdDegrees: number = LOCATION_CHANGE_THRESHOLD_DEGREES,
): boolean {
  const dLat = Math.abs(a.latitude - b.latitude);
  const dLng = Math.abs(a.longitude - b.longitude);
  return Math.hypot(dLat, dLng) > thresholdDegrees;
}

/**
 * المتبقي للوقت المستهدف من لحظة now — تعويض drift بالحساب من now مباشرة
 * (مش زيادة/نقصان تراكمي). اللحظة المستهدفة ثابتة، والفرق يتحدد لحظياً.
 */
export function computeRemainingMs(targetTimestamp: number, now: number): number {
  return Math.max(0, targetTimestamp - now);
}

/**
 * هل عدّ العدّاد (الصلاة القادمة بقت حانية)؟ — لحظة تجاوزها لازم
 * إعادة حساب الصلاة القادمة من المواقيت.
 */
export function isCountdownExpired(targetTimestamp: number, now: number): boolean {
  return targetTimestamp <= now;
}
