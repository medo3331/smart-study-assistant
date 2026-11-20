// lib/ai/trial.ts
//
// 🎁 الفترة التجريبية المفتوحة — قرار صاحب المنصة:
//   «اعمل تجربة النوته مجانية لمدة شهر» — كل الميزات (نوته + AI)
//   مفتوحة للجميع حتى نهاية الفترة، وبعدها:
//   - الصفحات: بلا حد للأبد (db/45).
//   - الـ AI: يرجع للمشتركين المدفوعين فقط (بوابة ai-credit-guard).
//   - الكوتات: يرجع الحد الطبيعي لكل خطة.
//
// مواعيد الإبطال تتحكم فيها البيئة (AI_OPEN_TRIAL_END) لو محتاج تمديد
// أو قطع مبكر من غير كود جديد.

/** نهاية الشهر التجريبي — 2026-12-21 (شهر من 2026-11-20). */
export const AI_OPEN_TRIAL_END_DEFAULT = "2026-12-21T00:00:00+02:00";

export function aiOpenTrialEnd(): string {
  const raw = process.env.AI_OPEN_TRIAL_END || AI_OPEN_TRIAL_END_DEFAULT;
  return raw;
}

/** true لو الفترة التجريبية المفتوحة لسه شغالة. */
export function isAiOpenTrialActive(): boolean {
  const end = Date.parse(aiOpenTrialEnd());
  if (!Number.isFinite(end)) return false;
  return Date.now() < end;
}
