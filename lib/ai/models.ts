import type { AiCapability } from "./health";
import type { AiProviderName } from "./types";

/**
 * سجل الموديلات المركزي — مصدر الحقيقة الوحيد لأي معرّف موديل في المشروع.
 *
 * القواعد:
 * ١) أي موديل بيستخدمه المشروع لازم يكون معرّف هنا، وأي موديل يتشال بيتشال من هنا بس.
 * ٢) مفيش موديل hard-coded في providers ولا في راوتات ولا في مهام.
 * ٣) freeEndpoint إلزامي: false يعني الموديل مش هيتختار أبدًا ما لم يُفعّل
 *    AI_ALLOW_PAID_MODELS=true صراحة — الحماية الافتراضية من أي تكلفة غير متوقعة.
 * ٤) enabled = مفتاح تشغيل لكل موديل. موديلات NVIDIA مسجّلة بـ enabled:false
 *    لحين التحقق من توفرها فعليًا على حساب NVIDIA المُهيّأ عبر
 *    `node scripts/verify-nvidia-models.mjs` — بعدها بتتفعّل يدويًا هنا.
 *
 * خصائص زي supportsVision/supportsEmbeddings مش مضروبة كحقول منفصلة عشان
 * مفيش مصدرين للحقيقة — القدرات (capabilities) هي المرجع الوحيد.
 */
export type ModelDefinition = {
  /** معرّف الـ API الفعلي عند المزوّد — ده اللي بيتبعَت في الطلب، مش اسم العرض. */
  id: string;
  provider: AiProviderName;
  displayName: string;
  capabilities: AiCapability[];
  /** حجم سياق الموديل بالتوكنات كما يعلن مزوّد الخدمة؛ غير معروف = undefined. */
  contextWindow?: number;
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
  /** true فقط للموديلات على نقاط نهاية مجانية مؤكدة. false = مستثنى افتراضيًا. */
  freeEndpoint: boolean;
  /** مفتاح تشغيل — false يخرج الموديل من الاختيار تمامًا مهما كانت باقي الشروط. */
  enabled: boolean;
};

export const MODEL_REGISTRY: readonly ModelDefinition[] = [
  /* ---------------- Groq (مجاني — أساسي للمهام السريعة) ---------------- */
  {
    id: "openai/gpt-oss-120b",
    provider: "groq",
    displayName: "GPT-OSS 120B",
    capabilities: ["text", "reasoning", "coding", "streaming"],
    contextWindow: 131_072,
    priority: 1,
    tier: "free",
    fallbackPriority: 1,
    freeEndpoint: true,
    enabled: true,
  },
  {
    id: "openai/gpt-oss-20b",
    provider: "groq",
    displayName: "GPT-OSS 20B",
    capabilities: ["text", "structured_output", "streaming"],
    contextWindow: 131_072,
    priority: 2,
    tier: "free",
    fallbackPriority: 2,
    freeEndpoint: true,
    enabled: true,
  },
  {
    /**
     * 🔥 **Llama 3.3 70B** — مرشّح ممتاز لتوليد الـJSON الطويل (سريع جدًا
     * على Groq ومتاح على النقطة المجانية).
     *
     * ⚠️ **ليه `enabled: false`**: ما قدرناش نتحقق حيًا إن الحساب الحالي
     *    مفعّل له الموديل (فحص `/v1/models` محتاج تشغيل
     *    `node scripts/test-ai-providers.mjs groq:models`). **ممنوع نفعّله
     *    قبل الفحص** — لو مش موجود عند المزوّد كل نداء هيرجع 404 وهيحرق
     *    وقت التوليد. بعد الفحص: بدّل `enabled` لـ true يدويًا.
     *
     * ⚠️ **ليه مش هو الأساسي**: خط التوليد الأساسي ما بيتغيّرش — التوليد شغال
     *    على `openai/gpt-oss-20b` (متحقَّق منه في المشروع) لحد ما يتأكد.
     */
    id: "llama-3.3-70b-versatile",
    provider: "groq",
    displayName: "Llama 3.3 70B Versatile (Groq)",
    capabilities: ["text", "streaming"],
    contextWindow: 131_072,
    priority: 4,
    tier: "free",
    fallbackPriority: 4,
    freeEndpoint: true,
    enabled: false,
  },
  {
    id: "llama-3.2-11b-vision-preview",
    provider: "groq",
    displayName: "Llama 3.2 11B Vision (Groq)",
    capabilities: ["text", "vision", "streaming"],
    contextWindow: 8_192,
    priority: 3,
    tier: "free",
    fallbackPriority: 3,
    freeEndpoint: true,
    enabled: true,
  },

  /* ------------------------------------------------------------------ */
  /* NVIDIA Free Endpoint — مُتحقَّق منها حيًا (2026-08-26)               */
  /* ------------------------------------------------------------------ */
  /* التحقق عبر scripts/verify-nvidia-models.mjs ضد الحساب الفعلي:        */
  /* 2026-11-06 → /v1/models = 30 موديل. النتائج:                                     */
  /*   nemotron-3.5-lightning ✓ · nemotron-3-ultra-550b ✓ (بروب VALID)  */
  /*   nemotron-3-super-120b ✗ اختفى · nemotron-3-embed-1b ✗ اختفى         */
  /*   deepseek-v4-flash-0731 ✗ — والحساب فيه جيل embeds جديد:            */
  /*   nemotron-3.5-embed-1b/8b + super-vl-120b + bolt-e4b (محتاجين بروب)  */
  /* ------------------------------------------------------------------ */
  {
    // chat/tutor/agent الأساسي عند NVIDIA — تم التحقق بطلب حي ناجح.
    id: "nvidia/nemotron-3.5-lightning-30b-a3b",
    provider: "nvidia",
    displayName: "Nemotron 3.5 Lightning 30B A3B",
    capabilities: ["text", "reasoning", "coding", "structured_output", "streaming"],
    priority: 1,
    tier: "unknown",
    fallbackPriority: 1,
    freeEndpoint: true,
    enabled: true,
  },
  {
    // تأكيد 2026-11-06: مش موجود في قائمة حساب NVIDIA (اختفت من /v1/models)
    // — معطّل لحين رجوعه. البديل المتحقّق منه: nemotron-3-ultra-550b تحت.
    id: "nvidia/nemotron-3-super-120b-a12b",
    provider: "nvidia",
    displayName: "Nemotron 3 Super 120B A12B",
    capabilities: ["text", "reasoning", "coding", "structured_output", "streaming"],
    priority: 2,
    tier: "unknown",
    fallbackPriority: 2,
    freeEndpoint: true,
    enabled: false,
  },
  {
    // احتياطي ثقيل للمهام المعقدة — تم التحقق بطلب حي ناجح (~9.3s، أبطأ).
    id: "nvidia/nemotron-3-ultra-550b-a55b",
    provider: "nvidia",
    displayName: "Nemotron 3 Ultra 550B A55B",
    capabilities: ["text", "reasoning", "coding", "structured_output"],
    priority: 3,
    tier: "unknown",
    fallbackPriority: 3,
    freeEndpoint: true,
    enabled: true,
  },
  {
    // مدرج في كتالوج الحساب لكنه يردّ 404 فعليًا (غير مفعّل للحساب حاليًا).
    // ممنوع تفعيله قبل إعادة التحقق — الراوتر يتخطاه ديناميكيًا وهو disabled.
    // اتشال كمان من كل مصفوفات TASK_MODEL_PREFERENCE — التفضيلات للموديلات
    // المفعّلة فقط (بعد إعادة التحقق يترجّع للمصفوفات يدويًا لو لزم).
    id: "deepseek-ai/deepseek-v4-flash-0731",
    provider: "nvidia",
    displayName: "DeepSeek V4 Flash (عبر NVIDIA)",
    capabilities: ["text", "reasoning", "coding", "structured_output", "streaming"],
    priority: 2,
    tier: "unknown",
    fallbackPriority: 2,
    freeEndpoint: true,
    enabled: false, // ← تحقق مرتين: HTTP 404 على هذا الحساب
  },
  {
    // تأكيد 2026-11-06: مش موجود في قائمة الحساب (اختفت من /v1/models)
    // — معطّل؛ استُبدل بالجيل nemotron-3.5-embed تحت.
    id: "nvidia/nemotron-3-embed-1b",
    provider: "nvidia",
    displayName: "Nemotron 3 Embed 1B",
    capabilities: ["embeddings"],
    priority: 1,
    tier: "unknown",
    fallbackPriority: -1, // مش بديل لأي مهمة نصية أبدًا
    freeEndpoint: true,
    enabled: false,
  },
  {
    // الجيل الجديد من embeds — متأكد وجوده في قائمة حساب NVIDIA (2026-11-06).
    // ممنوع التفعيل قبل بروب ناجح على /v1/embeddings (D-REAL-008) — فحص
    // embeddings مضاف في verify-nvidia-models.mjs.
    id: "nvidia/nemotron-3.5-embed-1b",
    provider: "nvidia",
    displayName: "Nemotron 3.5 Embed 1B",
    capabilities: ["embeddings"],
    priority: 1,
    tier: "unknown",
    fallbackPriority: -1, // مش بديل لأي مهمة نصية أبدًا
    freeEndpoint: true,
    enabled: false,
  },
  {
    // نفس الجيل الجديد بأبعاد أعلى (4096) — لنفس شرط البروب.
    id: "nvidia/nemotron-3.5-embed-8b",
    provider: "nvidia",
    displayName: "Nemotron 3.5 Embed 8B",
    capabilities: ["embeddings"],
    priority: 2,
    tier: "unknown",
    fallbackPriority: -1,
    freeEndpoint: true,
    enabled: false,
  },

  /* ------------------------------------------------------------------ */
  /* OpenRouter — مسجّل من الكتالوج الحقيقي (2026-08-26)                 */
  /* ------------------------------------------------------------------ */
  /* المصدر: openrouter.ai/api/v1/models — free = كل جوانب التسعير صفر.   */
  /* الرؤية اتحددت من architecture.input_modalities (مش من الاسم).        */
  /* مفيش ولا موديل image/video-output مجاني في الكتالوج الحالي، فمفيش    */
  /* أي موديل وسائط متسجّل هنا — MEDIA_MODEL_UNAVAILABLE هو السلوك الصحيح.*/
  /* ------------------------------------------------------------------ */
  {
    // مجاني مؤكد من التسعير + رؤية مؤكدة من input_modalities.
    id: "nvidia/nemotron-3.5-lightning:free",
    provider: "openrouter",
    displayName: "Nemotron 3.5 Lightning (OpenRouter Free)",
    capabilities: ["text", "streaming"],
    priority: 1,
    tier: "free",
    fallbackPriority: 2,
    freeEndpoint: true,
    enabled: true,
  },
  {
    // مجاني مؤكد + رؤية (text+image input) — بديل الرؤية بدون Gemini.
    id: "dots-studio/dots-3-note-preview:free",
    provider: "openrouter",
    displayName: "Dots 3 Note Preview (OpenRouter Free)",
    capabilities: ["text", "vision", "streaming"],
    priority: 2,
    tier: "free",
    fallbackPriority: 3,
    freeEndpoint: true,
    enabled: true,
  },
  {
    // B4.0.2g-e: اتشال من كتالوج OpenRouter الفعلي (تحقق 2026-11-06 عبر
    // /api/v1/models — "دوميد" [-] ميت) — 404 وقت ما يُنادى. متعطّل.
    id: "qwen/qwen-2.5-vl-7b-instruct:free",
    provider: "openrouter",
    displayName: "Qwen 2.5 VL 7B (OpenRouter Free)",
    capabilities: ["text", "vision", "streaming"],
    priority: 3,
    tier: "free",
    fallbackPriority: 4,
    freeEndpoint: true,
    enabled: false, // ← مش موجود في الكتالوج الحي (2026-11-06)
  },
  {
    // مجاني مؤكد من التسعير لكن البروب الحي رجّع 403 على هذا الحساب
    // (مش مصرّح له بالموديل) — ممنوع تفعيله وإلا سمّم حالة صحة المزوّد.
    id: "thinkingmachines/inkling-small:free",
    provider: "openrouter",
    displayName: "Inkling Small (OpenRouter Free)",
    capabilities: ["text", "vision", "streaming"],
    priority: 3,
    tier: "free",
    fallbackPriority: 4,
    freeEndpoint: true,
    enabled: false, // ← بروب حي: HTTP 403 على هذا الحساب (2026-08-26)
  },

  /* ---------------- Gemini (ثانوي متخصص — تحليل ووسائط) ---------------- */
  {
    id: "gemini-3.6-flash",
    provider: "gemini",
    displayName: "Gemini 3.6 Flash",
    capabilities: ["text", "vision", "file_analysis", "structured_output", "reasoning", "streaming"],
    contextWindow: 1_048_576,
    priority: 1,
    tier: "unknown",
    fallbackPriority: 1,
    freeEndpoint: true, // الطبقة المجانية لمفتاح Gemini الحالي
    enabled: true,
  },
  {
    // الموديل الوحيد اللي بيدعم Image Generation فعليًا في الحساب الحالي —
    // مش موديل نصوص ولا fallback له.
    id: "gemini-3.1-flash-image",
    provider: "gemini",
    displayName: "Gemini 3.1 Flash Image",
    capabilities: ["image_generation"],
    contextWindow: 32_768,
    priority: 1,
    tier: "unknown",
    fallbackPriority: -1,
    freeEndpoint: true,
    enabled: true,
  },
  /* ---------------- OpenRouter (مجاني — Nemotron Vision) ---------------- */
  {
    // بديل nemotron-nano-12b-v2-vl:free المَيت — متحقق منه حيًا في كتالوج
    // OpenRouter (vision عبر architecture.input_modalities، 2026-11-06).
    id: "nvidia/nemotron-3.5-super-vl:free",
    provider: "openrouter",
    displayName: "Nemotron 3.5 Super VL (OpenRouter, Free)",
    capabilities: ["text", "vision", "streaming"],
    contextWindow: 1_000_000,
    priority: 1,
    tier: "free",
    fallbackPriority: 1,
    freeEndpoint: true,
    enabled: true,
  },
  {
    // B4.0.2g-e: اتشال من كتالوج OpenRouter (تحقق 2026-11-06) — كان مصدر
    // 404 أعلى سلاسل fallback. متعطّل؛ البديل nemotron-3.5-super-vl فوق.
    id: "nvidia/nemotron-nano-12b-v2-vl:free",
    provider: "openrouter",
    displayName: "Nemotron Nano 12B v2 VL (OpenRouter, Free)",
    capabilities: ["text", "vision", "streaming"],
    contextWindow: 128_000,
    priority: 1,
    tier: "free",
    fallbackPriority: 1,
    freeEndpoint: true,
    enabled: false, // ← مش موجود في الكتالوج الحي (2026-11-06)
  },
  {
    // مرشّح لمهام الاستدلال الثقيلة (الخطط/الشرح الطويل/المراجع) — 280B MoE / 14B active
    // وسياق 1.02M مع structured_outputs. لسه محتاج بروب حي قبل التفعيل:
    // شغّل scripts/verify-openrouter-models.mjs بعد إضافته للائحة البروب.
    id: "baidu/ernie-5.5-flash-preview:free",
    provider: "openrouter",
    displayName: "ERNIE 5.5 Flash Preview (OpenRouter, Free)",
    capabilities: ["text", "reasoning", "structured_output", "streaming"],
    contextWindow: 1_024_000,
    priority: 3,
    tier: "free",
    fallbackPriority: 4,
    freeEndpoint: true,
    enabled: false, // ← ممنوع التفعيل قبل التحقق الحي (D-REAL-008)
  },
  {
    // مرشّح للسياق الضخم + الرؤية — hybrid reasoning وحدّ 200 صورة/طلب.
    // الـ contextWindow بالرقم مش مؤكد → اتساب فاضي لحد ما البروب الحي يأكده.
    id: "inclusionai/ling-3.2-flash:free",
    provider: "openrouter",
    displayName: "Ling 3.2 Flash (OpenRouter, Free)",
    capabilities: ["text", "vision", "reasoning", "streaming"],
    priority: 3,
    tier: "free",
    fallbackPriority: 4,
    freeEndpoint: true,
    enabled: false, // ← ممنوع التفعيل قبل التحقق الحي (D-REAL-008)
  },
  {
    // مرشّح للكود Agentic — مبني على DeepSeek V4.1 Flash. متحقّق بروب حي ناجح
    // (VALID ✓ 2026-11-06) بعد إزالة قيد max_tokens (commit 31f11d6).
    id: "particle-ai/particle-1:free",
    provider: "openrouter",
    displayName: "Particle 1 (OpenRouter, Free)",
    capabilities: ["text", "coding", "streaming"],
    priority: 3,
    tier: "free",
    fallbackPriority: 4,
    freeEndpoint: true,
    enabled: true, // متحقّق حيًّا 2026-11-06 — VALID ✓
  },
  {
    // متحقّق بروب حي ناجح (VALID ✓ 2026-11-06) — موديل استدلال؛ سجّلنا بس
    // القدرات اللي اتأكدنا منها (text/reasoning). مش في مصفوفات تفضيل حاليًا.
    id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    provider: "openrouter",
    displayName: "Nemotron 3 Nano Omni 30B A3B Reasoning (OpenRouter, Free)",
    capabilities: ["text", "reasoning"],
    priority: 3,
    tier: "free",
    fallbackPriority: 4,
    freeEndpoint: true,
    enabled: true,
  },
];

const BY_ID = new Map(MODEL_REGISTRY.map((model) => [model.id, model]));

/** يرمّم الموديل من السجل أو يرمي — الاستخدام بمعرّف غير مسجّل bug مش طلب. */
export function getModel(id: string): ModelDefinition {
  const model = BY_ID.get(id);
  if (!model) throw new Error(`Unknown model \"${id}\" — register it in lib/ai/models.ts first.`);
  return model;
}

export function findModel(id: string): ModelDefinition | undefined {
  return BY_ID.get(id);
}

/* ------------------------------------------------------------------ */
/* بوابة FREE-ONLY                                                     */
/* ------------------------------------------------------------------ */

/**
 * السماح بالموديلات المدفوعة معطّل افتراضيًا — المتغير الغايب يعني false.
 * أي قيمة غير "true" الحرفي (بعد lowercase) تعتبر رفض.
 */
export function paidModelsAllowed(): boolean {
  return process.env.AI_ALLOW_PAID_MODELS?.trim().toLowerCase() === "true";
}

/**
 * هل الموديل قابل للاختيار الآن؟ البوابة الموحّدة قبل أي ترتيب أو أولوية:
 * enabled + (freeEndpoint أو سماح صريح بالمدفوع).
 */
export function isModelSelectable(
  model: Pick<ModelDefinition, "enabled" | "freeEndpoint">,
  allowPaid: boolean = paidModelsAllowed()
): boolean {
  if (!model.enabled) return false;
  if (!model.freeEndpoint && !allowPaid) return false;
  return true;
}

/**
 * الموديلات القابلة للاختيار لمجموعة قدرات مطلوبة، مرتّبة بأولوية الإعلان
 * (priority ثم fallbackPriority). موديل بلا قدرة مطلوبة واحدًا منها مستبعد،
 * والموقوف (enabled:false) والمدفوع غير المسموح بيهم مستبعدين من الأصل.
 */
export function selectableModelsForCapabilities(required: AiCapability[]): ModelDefinition[] {
  return MODEL_REGISTRY.filter(
    (model) =>
      isModelSelectable(model) &&
      (required.length === 0 || required.every((capability) => model.capabilities.includes(capability)))
  ).sort((a, b) => a.priority - b.priority || a.fallbackPriority - b.fallbackPriority);
}

/** ترتيب الموديلات المرشحة للـ fallback داخل نفس المزوّد (بدون بوابة التهيئة). */
export function fallbackCandidatesFor(provider: AiProviderName): ModelDefinition[] {
  return MODEL_REGISTRY.filter(
    (model) => model.provider === provider && model.fallbackPriority >= 0
  ).sort((a, b) => a.fallbackPriority - b.fallbackPriority);
}

/** اسم قديم محفوظ للتوافق — نفس دلالات selectableModelsForCapabilities. */
export const modelsForCapabilities = selectableModelsForCapabilities;

/** كل الموديلات المسجّلة لمزوّد — للفحص والتشخيص فقط. */
export function modelsForProvider(provider: AiProviderName): ModelDefinition[] {
  return MODEL_REGISTRY.filter((model) => model.provider === provider);
}
