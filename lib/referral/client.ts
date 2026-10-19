/**
 * أدوات كود الإحالة على الكلاينت.
 *
 * القواعد:
 *  - ?ref=CODE بيتقري من أي صفحة (زائر جاي من رابط دعوة) ويتحفظ في
 *    localStorage — localStorage عن قصد (مش session): لو المستخدم راح
 *    يعمل حاجة تانية ورجع يسجّل، الكود يفضل موجود.
 *  - التخزين والقراءة جوه localStorage فقط؛ التسجيل نفسه بيحصل
 *    server-side عبر /api/referrals/attribute.
 */
const REFERRAL_KEY = "ssa_referral_code";
const MAX_CODE_CHARS = 32;

/** الكود مسموح: حروف كبيرة وأرقام (من غير I,O,0,1) وشرطات. */
export function isValidReferralCode(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const code = value.trim().toUpperCase();
  return code.length >= 4 && code.length <= MAX_CODE_CHARS && /^[A-Z2-9-]+$/.test(code);
}

/** بيلقط ?ref= من الرابط ويحفظه — بيتنادى مرة على كل تحميل صفحة. */
export function rememberReferralCodeFromUrl(search: string): void {
  try {
    const raw = new URLSearchParams(search).get("ref");
    if (raw && isValidReferralCode(raw)) {
      window.localStorage.setItem(REFERRAL_KEY, raw.trim().toUpperCase());
    }
  } catch {
    // الستوريج مقفول — التتبع بيتعطّل والمستخدم يكمّل عادي
  }
}

/** بيقرا الكود المحفوظ (من غير ما يمسحه — المسح بعد التسجيل الناجح بس). */
export function readStoredReferralCode(): string | null {
  try {
    const raw = window.localStorage.getItem(REFERRAL_KEY);
    return raw && isValidReferralCode(raw) ? raw.trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

/** مسح الكود بعد ما الإحالة اتسجلت (أو اتجاهلت). */
export function clearStoredReferralCode(): void {
  try {
    window.localStorage.removeItem(REFERRAL_KEY);
  } catch {
    // مقفول — مش مشكلة
  }
}
