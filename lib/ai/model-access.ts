/**
 * Model Access Policy — Phase G + H
 *
 * لا مصدر حقيقة موازي — نستخدم entitlements(kind, value) الحالي:
 *   kind="model", value="<model-id>"  → وصول لنموذج محدد
 *   kind="feature", value="advanced-study" → ميزة عامة (Study Booster)
 *
 * Phase H Final:
 *   Free  = كل النماذج الاساسية التي يجب أن تظل متاحة بدون شراء
 *   Gated = نماذج متقدمة قليلة فقط تستحق entitlement (قيمة فعلية)
 *   — الشراء يكون عبر Store (Coins → entitlement/feature) ولا يوجد bypass
 */

export type ModelAccessPolicy = {
  modelId: string;
  access: "free" | "entitlement";
  entitlement?: {
    kind: string;
    value: string;
  };
};

// ── Free: مرآة دقيقة للموديلات المفعّلة فعلاً في MODEL_REGISTRY ──
// هذه هي النماذج التي يراها أي مستخدم بدون شراء. أي موديل ليس هنا
// إما مقفل (في GATED_MODELS) أو غير معروف (افتراضياً مقفل لمنع bypass).
const FREE_MODELS = new Set<string>([
  // Groq — الأساس المجاني
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  // NVIDIA Free — خفيف + embeddings
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nemotron-3-embed-1b",
  // OpenRouter Free — بدائل مجانية مؤكدة
  "nvidia/nemotron-3.5-lightning:free",
  "dots-studio/dots-3-note-preview:free",
  // Gemini — تخصصي مجاني
  "gemini-3.6-flash",
  "gemini-3.1-flash-image",
  // ملاحظة: nemotron-3-ultra لم يعد free حراً — أصبح gated (انظر أدناه)
]);

// ── Gated: نماذج متقدمة فقط — تتطلب feature=advanced-study ──
// العميل يشتري "Study Booster" (useful.study-booster, 2200 Coins)
// → يمنح entitlement kind=feature value=advanced-study → يفتح هذه النماذج
// عدد صغير فقط له قيمة فعلية (reasoning ثقيل للتخطيط والدراسة المتعمقة)
export const GATED_MODELS: Record<string, { kind: string; value: string }> = {
  "nvidia/nemotron-3-super-120b-a12b": { kind: "feature", value: "advanced-study" },
  "nvidia/nemotron-3-ultra-550b-a55b": { kind: "feature", value: "advanced-study" },
};

export function getModelAccessPolicy(modelId: string): ModelAccessPolicy {
  const gated = GATED_MODELS[modelId];
  if (gated) {
    return {
      modelId,
      access: "entitlement",
      entitlement: { kind: gated.kind, value: gated.value },
    };
  }
  if (FREE_MODELS.has(modelId)) {
    return { modelId, access: "free" };
  }
  // موديل غير معروف أو غير مسجل → افتراضياً مقفل لمنع bypass
  // يمنع إرسال modelId عشوائي لفتح مسار غير مرخص
  return {
    modelId,
    access: "entitlement",
    entitlement: { kind: "model", value: modelId },
  };
}

export function requiresEntitlement(modelId: string): boolean {
  return getModelAccessPolicy(modelId).access === "entitlement";
}

export const CURRENT_AI_MODEL = "openai/gpt-oss-120b";

// ── Phase H: filterAccessibleModels (لا إعادة بناء للـ Router) ──
// يطبّق الترتيب: is healthy? is enabled? is entitled? → skip إذا مقفل
// يُستدعى بعد routeCandidates() وقبل اختيار المرشح النهائي
export type CandidateLite = { provider: string; model?: string };

export async function filterAccessibleModels<T extends CandidateLite>(
  candidates: readonly T[],
  hasEntitlement: (kind: string, value: string) => Promise<boolean>
): Promise<T[]> {
  const out: T[] = [];
  for (const c of candidates) {
    if (!c.model) {
      // مرشح بدون موديل محدد يعتمد على سياسة المزوّد — نعتبره free
      out.push(c);
      continue;
    }
    const policy = getModelAccessPolicy(c.model);
    if (policy.access === "free") {
      out.push(c);
      continue;
    }
    // gated → تحقق entitlement (قبل الحجز — لا يستهلك credit)
    if (!policy.entitlement) {
      continue;
    }
    const ok = await hasEntitlement(policy.entitlement.kind, policy.entitlement.value);
    if (ok) out.push(c);
  }
  return out;
}

export function isKnownModel(modelId: string): boolean {
  return FREE_MODELS.has(modelId) || modelId in GATED_MODELS;
}
