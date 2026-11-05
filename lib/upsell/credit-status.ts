/**
 * منطق حالة الكريدت للـ upsell — نقي وقابل للاختبار.
 *
 * يُستخدم في `/api/me/credit-status` (قراءة) وفي الاختبارات مباشرة.
 * لا يستورد Supabase ولا Next.
 */

export type CreditStatusLevel = "ok" | "low" | "critical" | "exhausted";
export type NextPlan = "pro" | "ultra" | null;

/** عتبات النسبة المئوية المتبقية. */
export const CRITICAL_PERCENT = 10;
export const LOW_PERCENT = 20;

/** المستويات المقبولة للأدوار/الخطط كما تظهر في entitlements. */
const TIER_TO_PLAN: Record<string, string> = {
  free: "free",
  premium: "pro", // ميراث: premium كانت تعني الباقة المدفوعة القديمة
  pro: "pro",
  ultra: "ultra",
};

/** يطبّع قيمة الخطة إلى مفتاح صف في subscription_plans. */
export function normalizeTier(tier: string | null | undefined): string {
  const key = (tier ?? "").trim().toLowerCase();
  return TIER_TO_PLAN[key] ?? "free";
}

/** الباقة التالية للترقية: free/premium → pro، pro → ultra، ultra → لا شيء. */
export function nextPlanFor(tier: string | null | undefined): NextPlan {
  const key = (tier ?? "").trim().toLowerCase();
  if (key === "ultra") return null;
  if (key === "pro") return "ultra";
  // free / premium / فارغ / أي قيمة مجهولة
  return "pro";
}

export function checkoutUrlFor(plan: NextPlan): string | null {
  return plan ? `/checkout/${plan}` : null;
}

export type CreditStatusResult = {
  status: CreditStatusLevel;
  credits_percent: number;
};

/**
 * يحسب الحالة من الرصيد المتبقي والحد الشهري.
 *
 * ⚠️ حالات حدّية مقصودة:
 *   - `remaining <= 0` → exhausted دائمًا (حتى لو الحد الشهري 0).
 *   - `monthly <= 0` → لا يمكن حساب نسبة: تُعتبر ok (لا نُطلق إنذارًا كاذبًا).
 *   - النسبة تُقرَّب لأسفل عدد صحيح وتُقيَّد بين 0 و100.
 */
export function computeCreditStatus(input: {
  creditsRemaining: number;
  creditsMonthly: number;
}): CreditStatusResult {
  const remaining = Number.isFinite(input.creditsRemaining)
    ? Math.max(0, Math.trunc(input.creditsRemaining))
    : 0;
  const monthly = Number.isFinite(input.creditsMonthly)
    ? Math.max(0, Math.trunc(input.creditsMonthly))
    : 0;

  if (remaining <= 0) return { status: "exhausted", credits_percent: 0 };
  if (monthly <= 0) return { status: "ok", credits_percent: 0 };

  const percent = Math.min(100, Math.max(0, Math.floor((remaining / monthly) * 100)));

  if (percent <= CRITICAL_PERCENT) return { status: "critical", credits_percent: percent };
  if (percent <= LOW_PERCENT) return { status: "low", credits_percent: percent };
  return { status: "ok", credits_percent: percent };
}

export type CreditStatusPayload = {
  tier: string;
  credits_remaining: number;
  credits_monthly: number;
  credits_percent: number;
  status: CreditStatusLevel;
  next_plan: NextPlan;
  checkout_url: string | null;
};

/** يبني الاستجابة الكاملة — نقطة واحدة يستخدمها الـ endpoint والاختبارات. */
export function buildCreditStatusPayload(input: {
  tier: string;
  creditsRemaining: number;
  creditsMonthly: number;
}): CreditStatusPayload {
  const { status, credits_percent } = computeCreditStatus({
    creditsRemaining: input.creditsRemaining,
    creditsMonthly: input.creditsMonthly,
  });
  const nextPlan = nextPlanFor(input.tier);

  return {
    tier: input.tier,
    credits_remaining: Math.max(0, Math.trunc(input.creditsRemaining) || 0),
    credits_monthly: Math.max(0, Math.trunc(input.creditsMonthly) || 0),
    credits_percent,
    status,
    next_plan: nextPlan,
    checkout_url: checkoutUrlFor(nextPlan),
  };
}
