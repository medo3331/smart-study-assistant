import { describe, it, expect } from "vitest";
import { validatePlanInput, type PlanEditableInput } from "@/lib/plans/validation";

/** خطة صالحة — أي اختبار يعدّل نسخة منها. */
function base(overrides: Partial<PlanEditableInput> = {}): PlanEditableInput {
  return {
    plan_key: "pro",
    name: "Pro",
    display_name_ar: "احترافي",
    price: 199,
    original_price: null,
    discount_percentage: 0,
    credits_monthly: 500,
    profile_limit: 3,
    messages_per_2h: 100,
    messages_daily: 20,
    messages_monthly: 300,
    uploads_daily: 30,
    max_file_size_mb: 150,
    trial_days: 7,
    is_active: true,
    is_popular: false,
    file_types: ["pdf", "text"],
    video_audio_exclusive: false,
    features: ["رسائل غير محدودة عمليًا", "دعم الأولوية"],
    ...overrides,
  };
}

describe("validatePlanInput", () => {
  it("يقبل خطة صالحة", () => {
    expect(validatePlanInput(base())).toEqual({ ok: true });
  });

  it("يرفض السعر السالب", () => {
    const r = validatePlanInput(base({ price: -1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes("price"))).toBe(true);
  });

  it("يرفض السعر غير الرقمي (NaN)", () => {
    const r = validatePlanInput(base({ price: Number.NaN }));
    expect(r.ok).toBe(false);
  });

  it("يرفض نسبة خصم أكبر من 100", () => {
    const r = validatePlanInput(base({ discount_percentage: 101 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes("discount_percentage"))).toBe(true);
  });

  it("يرفض نسبة خصم سالبة", () => {
    const r = validatePlanInput(base({ discount_percentage: -5 }));
    expect(r.ok).toBe(false);
  });

  it("يرفض max_file_size_mb = 0 أو أقل", () => {
    expect(validatePlanInput(base({ max_file_size_mb: 0 })).ok).toBe(false);
    expect(validatePlanInput(base({ max_file_size_mb: -10 })).ok).toBe(false);
  });

  it("يرفض profile_limit أقل من 1", () => {
    expect(validatePlanInput(base({ profile_limit: 0 })).ok).toBe(false);
  });

  it("يرفض credits_monthly سالب أو كسري", () => {
    expect(validatePlanInput(base({ credits_monthly: -1 })).ok).toBe(false);
    expect(validatePlanInput(base({ credits_monthly: 10.5 })).ok).toBe(false);
  });

  it("يقبل credits_monthly = 0 (باقة بلا كريدت)", () => {
    expect(validatePlanInput(base({ credits_monthly: 0 })).ok).toBe(true);
  });

  it("يرفض trial_days سالبًا", () => {
    expect(validatePlanInput(base({ trial_days: -1 })).ok).toBe(false);
  });

  it("يرفض الحقول الرقمية السالبة", () => {
    expect(validatePlanInput(base({ messages_per_2h: -1 })).ok).toBe(false);
    expect(validatePlanInput(base({ messages_daily: -1 })).ok).toBe(false);
    expect(validatePlanInput(base({ messages_monthly: -1 })).ok).toBe(false);
    expect(validatePlanInput(base({ uploads_daily: -1 })).ok).toBe(false);
  });

  it("يرفض name فارغًا", () => {
    expect(validatePlanInput(base({ name: "   " })).ok).toBe(false);
  });

  it("يرفض plan_key غير مطابق للنمط", () => {
    expect(validatePlanInput(base({ plan_key: "Pro Plan" })).ok).toBe(false);
    expect(validatePlanInput(base({ plan_key: "PRO" })).ok).toBe(false);
    expect(validatePlanInput(base({ plan_key: "a" })).ok).toBe(false);
  });

  it("يرفض عناصر features الفارغة", () => {
    expect(validatePlanInput(base({ features: ["ok", "  "] })).ok).toBe(false);
  });

  it("يجمع كل الأخطاء معًا (لا يتوقف عند الأول)", () => {
    const r = validatePlanInput(
      base({ price: -1, profile_limit: 0, max_file_size_mb: 0, discount_percentage: 200 })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(4);
  });
});
