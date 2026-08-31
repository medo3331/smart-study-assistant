/**
 * Model Access Policy — Phase G
 *
 * لا مصدر حقيقة موازي — نستخدم entitlements(kind, value) الحالي:
 *   kind="model", value="<model-id>"  → وصول لنموذج محدد
 *   kind="feature", value="advanced-study" → ميزة عامة
 *
 * Phase G: كل الـ 6 models الحالية free — لا قفل عشوائي
 * السلوك الحالي يبقى كما هو، لكن البنية جاهزة لـ gating مستقبلي
 */

export type ModelAccessPolicy = {
  modelId: string;
  access: "free" | "entitlement";
  entitlement?: {
    kind: string;
    value: string;
  };
};

// النماذج الحرة الحالية (مرآة MODEL_REGISTRY المفعّلة)
const FREE_MODELS = new Set<string>([
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-3-ultra-550b",
  "nvidia/nemotron-3-embed-1b",
]);

// نماذج مستقبلية مقفلة (مثال — لا تُستخدم حالياً، للاختبار فقط)
// لو أضيف نموذج جديد premium، يُضاف هنا بدلاً من جدول منفصل
const GATED_MODELS: Record<string, { kind: string; value: string }> = {
  // مثال للاختبار: لن يُقفل في الإنتاج الآن
  // "premium/super-model": { kind: "model", value: "premium/super-model" },
  // "feature:advanced-study": { kind: "feature", value: "advanced-study" },
};

export function getModelAccessPolicy(modelId: string): ModelAccessPolicy {
  // 1) إذا كان في قائمة المقفلة صراحة → يتطلب entitlement
  const gated = GATED_MODELS[modelId];
  if (gated) {
    return {
      modelId,
      access: "entitlement",
      entitlement: { kind: gated.kind, value: gated.value },
    };
  }

  // 2) إذا كان من النماذج الحرة المعروفة → free
  if (FREE_MODELS.has(modelId)) {
    return { modelId, access: "free" };
  }

  // 3) نماذج غير معروفة → افتراضياً تتطلب entitlement لنفس الـ modelId
  // هذا يمنع bypass عبر إرسال modelId عشوائي غير مسجل
  // لكن في Phase G لا يُستخدم لأن الـ client لا يرسل modelId أصلاً
  return {
    modelId,
    access: "entitlement",
    entitlement: { kind: "model", value: modelId },
  };
}

export function requiresEntitlement(modelId: string): boolean {
  return getModelAccessPolicy(modelId).access === "entitlement";
}

// للتوثيق: الـ routing الحالي في unified-ai.ts يستخدم GROQ_MODEL مباشرة
// ولا يمر عبر routeCandidates() — Phase G يضيف boundary حول النموذج الفعلي المختار
// دون إعادة تصميم الـ Router
export const CURRENT_AI_MODEL = "openai/gpt-oss-120b";

// ملاحظة: لا ربط مع AiRouter architecture — فقط فحص قبل الحجز
