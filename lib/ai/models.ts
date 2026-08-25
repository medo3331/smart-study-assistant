import type { AiCapability } from "./health";
import type { AiProviderName } from "./types";

/**
 * سجل الموديلات المركزي.
 *
 * القاعدة الوحيدة: أي موديل بيستخدمه المشروع لازم يكون معرّف هنا، وأي موديل
 * يتشال بيتشال من هنا بس. مفيش موديل hard-coded في providers ولا في راوتات.
 * إضافة موديل جديد = مدخل واحد في MODEL_REGISTRY + (لو محتاج) تحديث الأولويات.
 */
export type ModelDefinition = {
  /** معرّف الـ API الفعلي عند المزوّد — ده اللي بيتبعَت في الطلب، مش اسم العرض. */
  id: string;
  provider: AiProviderName;
  displayName: string;
  capabilities: AiCapability[];
  /** حجم سياق الموديل بالتوكنات كما يعلن مزوّد الخدمة. */
  contextWindow: number;
  priority: number;
  /**
   * تصنيف مجاني/مدفوع حسب ما هو معلوم فعليًا عن خطة المزوّد وقت كتابة المدخل.
   * "unknown" لما مش متأكدين — ممنوع نخمّن.
   */
  tier: "free" | "paid" | "unknown";
  /**
   * أولوية الـ fallback: الأرقام الأصغر تُجرَّب الأول بعد فشل الموديل الأساسي.
   * -1 = مش مرشّح fallback للمهمة دي أصلًا (مثلًا موديل صور لمهمة نص).
   */
  fallbackPriority: number;
};

export const MODEL_REGISTRY: readonly ModelDefinition[] = [
  {
    id: "openai/gpt-oss-120b",
    provider: "groq",
    displayName: "GPT-OSS 120B",
    capabilities: ["text", "reasoning", "coding"],
    contextWindow: 131_072,
    priority: 1,
    tier: "free",
    fallbackPriority: 1,
  },
  {
    id: "openai/gpt-oss-20b",
    provider: "groq",
    displayName: "GPT-OSS 20B",
    capabilities: ["text", "structured_output"],
    contextWindow: 131_072,
    priority: 2,
    tier: "free",
    fallbackPriority: 2,
  },
  {
    id: "gemini-3.6-flash",
    provider: "gemini",
    displayName: "Gemini 3.6 Flash",
    capabilities: ["text", "vision", "file_analysis", "structured_output", "reasoning"],
    contextWindow: 1_048_576,
    priority: 1,
    tier: "unknown",
    fallbackPriority: 1,
  },
  {
    // الموديل الوحيد اللي بيدعم Image Generation فعليًا في الحساب الحالي
    // (موثّق في lib/ai-config.ts من قبل) — مش موديل نصوص ولا fallback له.
    id: "gemini-3.1-flash-image",
    provider: "gemini",
    displayName: "Gemini 3.1 Flash Image",
    capabilities: ["image_generation"],
    contextWindow: 32_768,
    priority: 1,
    tier: "unknown",
    fallbackPriority: -1,
  },
];

const BY_ID = new Map(MODEL_REGISTRY.map((model) => [model.id, model]));

/** يرمّم الموديل من السجل أو يرمي — الاستخدام بمعرّف غير مسجّل bug مش طلب. */
export function getModel(id: string): ModelDefinition {
  const model = BY_ID.get(id);
  if (!model) throw new Error(`Unknown model "${id}" — register it in lib/ai/models.ts first.`);
  return model;
}

export function findModel(id: string): ModelDefinition | undefined {
  return BY_ID.get(id);
}

/**
 * الموديلات المناسبة لمجموعة قدرات مطلوبة، مرتّبة بأولوية الـ fallback.
 * موديل بلا قدرة مطلوبة واحدًا منها مستبعد تمامًا (ولا يصلح أساسيًا ولا fallback).
 */
export function modelsForCapabilities(required: AiCapability[]): ModelDefinition[] {
  if (required.length === 0) return [...MODEL_REGISTRY];
  return MODEL_REGISTRY.filter((model) =>
    required.every((capability) => model.capabilities.includes(capability))
  );
}

/**
 * ترتيب الموديلات المرشحة للـ fallback داخل نفس المزوّد.
 * fallbackPriority = -1 يعني مستبعد نهائيًا.
 */
export function fallbackCandidatesFor(provider: AiProviderName): ModelDefinition[] {
  return MODEL_REGISTRY.filter(
    (model) => model.provider === provider && model.fallbackPriority >= 0
  ).sort((a, b) => a.fallbackPriority - b.fallbackPriority);
}
