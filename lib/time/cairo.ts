/**
 * يوم المستخدم — تعريف واحد للواجهة.
 *
 * ⚠️ ليه مش `toISOString().slice(0, 10)`:
 *   ده تاريخ **UTC**. في القاهرة (UTC+2/+3) بعد منتصف الليل المحلي التاريخ
 *   UTC لسه إمبارح، فمقارنة «آخر مذاكرة» بـ«النهارده» كانت بتغلط ساعتين كل
 *   يوم. والسيرفر بقى بيحسب اليوم بـ `Africa/Cairo` (`public.cairo_day()` في
 *   `db/43-retention-p0-streak.sql`)، فلازم الواجهة تقيس بنفس المسطرة.
 *
 * `en-CA` مقصودة: صيغتها YYYY-MM-DD زي اللي الداتابيز بتخزّنها.
 */
export const USER_TIME_ZONE = "Africa/Cairo";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: USER_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** تاريخ اليوم بتوقيت القاهرة بصيغة YYYY-MM-DD. */
export function cairoDateString(date: Date = new Date()): string {
  return dayFormatter.format(date);
}
