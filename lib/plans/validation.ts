/**
 * تحقّق خطط الاشتراك — منطق نقي (بلا Supabase وبلا Next).
 *
 * ⚠️ يُستخدم في **السيرفر** داخل `plans-manage.ts` قبل أي كتابة، وفي
 * الاختبارات مباشرة. التحقق في العميل (HTML min/max) ليس ضمانًا: أي طلب
 * يمكن أن يصل بدون النموذج أصلًا.
 */

export type PlanEditableInput = {
  plan_key: string;
  name: string;
  display_name_ar?: string | null;
  price: number;
  original_price?: number | null;
  discount_percentage?: number | null;
  credits_monthly?: number | null;
  profile_limit: number;
  messages_per_2h: number;
  messages_daily?: number | null;
  messages_monthly?: number | null;
  uploads_daily: number;
  max_file_size_mb: number;
  trial_days?: number | null;
  is_active?: boolean;
  is_popular?: boolean;
  file_types?: string[] | null;
  video_audio_exclusive?: boolean;
  features: string[];
};

export type PlanValidation = { ok: true } | { ok: false; errors: string[] };

const PLAN_KEY_PATTERN = /^[a-z0-9_]{2,40}$/;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInt(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

/**
 * يتحقق من كل الحقول القابلة للتعديل. يعيد **كل** الأخطاء مجتمعة
 * (لا يوقف عند أول خطأ) حتى يرى الأدمن كل ما يجب إصلاحه مرة واحدة.
 */
export function validatePlanInput(input: PlanEditableInput): PlanValidation {
  const errors: string[] = [];

  if (!input || typeof input !== "object") {
    return { ok: false, errors: ["بيانات الخطة غير صالحة"] };
  }

  if (!PLAN_KEY_PATTERN.test(input.plan_key ?? "")) {
    errors.push("plan_key: أحرف لاتينية صغيرة/أرقام/شرطة سفلية فقط (2–40)");
  }
  if (typeof input.name !== "string" || input.name.trim() === "") {
    errors.push("name: مطلوب");
  }

  if (!isFiniteNumber(input.price) || input.price < 0) {
    errors.push("price: لازم يكون رقمًا ≥ 0");
  }
  if (input.original_price != null) {
    if (!isFiniteNumber(input.original_price) || input.original_price < 0) {
      errors.push("original_price: لازم يكون رقمًا ≥ 0 أو فارغًا");
    }
  }
  if (input.discount_percentage != null) {
    if (
      !isFiniteNumber(input.discount_percentage) ||
      input.discount_percentage < 0 ||
      input.discount_percentage > 100
    ) {
      errors.push("discount_percentage: بين 0 و100");
    }
  }
  if (input.credits_monthly != null && !isNonNegativeInt(input.credits_monthly)) {
    errors.push("credits_monthly: عدد صحيح ≥ 0");
  }

  if (!isNonNegativeInt(input.profile_limit) || input.profile_limit < 1) {
    errors.push("profile_limit: عدد صحيح ≥ 1");
  }
  if (!isNonNegativeInt(input.messages_per_2h)) {
    errors.push("messages_per_2h: عدد صحيح ≥ 0");
  }
  if (input.messages_daily != null && !isNonNegativeInt(input.messages_daily)) {
    errors.push("messages_daily: عدد صحيح ≥ 0");
  }
  if (input.messages_monthly != null && !isNonNegativeInt(input.messages_monthly)) {
    errors.push("messages_monthly: عدد صحيح ≥ 0");
  }
  if (!isNonNegativeInt(input.uploads_daily)) {
    errors.push("uploads_daily: عدد صحيح ≥ 0");
  }
  if (!isFiniteNumber(input.max_file_size_mb) || input.max_file_size_mb <= 0) {
    errors.push("max_file_size_mb: رقم > 0");
  }
  if (input.trial_days != null && !isNonNegativeInt(input.trial_days)) {
    errors.push("trial_days: عدد صحيح ≥ 0");
  }

  if (!Array.isArray(input.features)) {
    errors.push("features: مصفوفة نصوص");
  } else if (input.features.some((f) => typeof f !== "string" || f.trim() === "")) {
    errors.push("features: لا تُقبل عناصر فارغة");
  }

  if (input.file_types != null) {
    if (!Array.isArray(input.file_types)) errors.push("file_types: مصفوفة نصوص");
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
