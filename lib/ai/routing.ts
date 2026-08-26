import type {
  AiChatRequest,
  AiChatResponse,
  AiImageGenerationRequest,
  AiImageGenerationResponse,
  AiImageProvider,
  AiMediaAnalysisRequest,
  AiMediaProvider,
  AiProviderName,
  AiTaskType,
  AiTextProvider,
} from "./types";
import { AiProviderError } from "./types";
import type { AiCapability } from "./health";
import { getProviderHealth, isConfigured, isUsable, recordProviderResult } from "./health";
import {
  MODEL_REGISTRY,
  fallbackCandidatesFor,
  getModel,
  isModelSelectable,
  paidModelsAllowed,
} from "./models";

/** سياسة المهام الحالية — مرجع التوافق والاختبارات (test-ai-router.mjs يعتمد عليه). */
export const AI_PROVIDER_BY_TASK: Readonly<Record<AiTaskType, AiProviderName>> = {
  chat: "groq",
  explain: "groq",
  summarize: "groq",
  content: "groq",
  marketing_copy: "groq",
  // مصفوفة 3A — التفضيلات الافتراضية لما ما فيش قيود قدرات أدق.
  tutor: "nvidia",
  agent: "nvidia",
  coding: "nvidia",
  quiz: "groq",
  flashcards: "gemini",
  study_plan: "gemini",
  lesson_analysis: "gemini",
  mind_map: "gemini",
  file_analysis: "gemini",
  image_analysis: "gemini",
  data_analysis: "gemini",
  planning: "gemini",
  business_plan: "gemini",
  marketing_plan: "gemini",
  roadmap: "gemini",
  image_generation: "gemini",
  // مهام الوسائط الجديدة — التنفيذ الفعلي بيمشي عبر Media Router المشدود
  // بالقدرات، والقيمة دي مرجعية فقط لو اتحقق من موديل مجاني مستقبلًا.
  image_edit: "gemini",
  video_generation: "gemini",
  rag_embeddings: "nvidia",
};

/**
 * القدرات المطلوبة لكل نوع مهمة. مهام الوسائط والصور محتكرة بمزوّدها —
 * لا fallback عابر للقدرات أبدًا: فشل تحليل ملف/صورة لازم يوصل كمَا هو
 * مش يتنكّر كرد نصي ناجح.
 */
const TASK_CAPABILITIES: Readonly<Record<AiTaskType, AiCapability[]>> = {
  chat: ["text"],
  explain: ["text"],
  summarize: ["text"],
  content: ["text"],
  marketing_copy: ["text"],
  // المدرّس/الوكيل: تدفقات نصية تفاعلية بسيطة المتطلبات — التفضيل بيحددها
  // مصفوفة TASK_MODEL_PREFERENCE مش القدرات.
  tutor: ["text"],
  agent: ["text"],
  coding: ["text", "coding"],
  // مهام الدراسة المنظمة: الناتج JSON بيعدّي من validateStructured قبل الاستخدام،
  // فعشان كده القدرة structured_output إلزامية مش اختيارية.
  quiz: ["text", "structured_output"],
  flashcards: ["text", "structured_output"],
  mind_map: ["text", "structured_output"],
  planning: ["text", "reasoning"],
  study_plan: ["text", "reasoning"],
  lesson_analysis: ["text", "reasoning"],
  business_plan: ["text", "reasoning"],
  marketing_plan: ["text", "reasoning"],
  roadmap: ["text", "reasoning"],
  data_analysis: ["text", "structured_output"],
  file_analysis: ["file_analysis"],
  image_analysis: ["vision"],
  image_generation: ["image_generation"],
  // التعديل بيحتاج فهم الصورة + توليدها معًا — لحد ما يتحقق موديل بالقدرتين
  // هيفضل بدون مرشحين (MEDIA_MODEL_UNAVAILABLE) وده الصح.
  image_edit: ["vision", "image_generation"],
  video_generation: ["video_generation"],
  rag_embeddings: ["embeddings"],
};

/**
 * مصفوفة تفضيل موديلات Task 3A — ترتيب التجربة الفعلي للمهام الاستراتيجية.
 * دي تفضيلات مش تصاريح: الموديل بيتخطى لو موقوف أو غير صحي أو مش مؤهل.
 * المفتاح = معرّف موديل مسجّل في MODEL_REGISTRY (بيترمى خطأ لو اتغيّر غلط).
 */
export const TASK_MODEL_PREFERENCE: Partial<Record<AiTaskType, readonly string[]>> = {
  chat: [
    "openai/gpt-oss-120b",            // Groq أولاً (أسرع)
    "nvidia/nemotron-3.5-lightning-30b-a3b",
    "deepseek-ai/deepseek-v4-flash-0731",
  ],
  coding: [
    "deepseek-ai/deepseek-v4-flash-0731",
    "nvidia/nemotron-3.5-lightning-30b-a3b",
    "openai/gpt-oss-120b",            // Groq كمان احتياطي
  ],
  agent: [
    "nvidia/nemotron-3.5-lightning-30b-a3b",
    "deepseek-ai/deepseek-v4-flash-0731",
    "openai/gpt-oss-120b",
  ],
  planning: [
    "nvidia/nemotron-3-super-120b-a12b", // تم التحقق أنه free endpoint فعليًا
    "nvidia/nemotron-3.5-lightning-30b-a3b",
    "deepseek-ai/deepseek-v4-flash-0731",
    "gemini-3.6-flash",
  ],
  tutor: [
    "nvidia/nemotron-3.5-lightning-30b-a3b",
    "openai/gpt-oss-120b",            // Groq ثانياً حسب المصفوفة
    "deepseek-ai/deepseek-v4-flash-0731",
  ],
  quiz: [
    "openai/gpt-oss-20b",             // Groq أولاً — والمهمة محتاجة structured_output
    "nvidia/nemotron-3.5-lightning-30b-a3b",
    "deepseek-ai/deepseek-v4-flash-0731",
  ],
  rag_embeddings: [
    "nvidia/nemotron-3-embed-1b",     // الوحيد المسجّل لمهمة الـ embeddings
  ],
};

export function capabilitiesForTask(task: AiTaskType): AiCapability[] {
  return TASK_CAPABILITIES[task];
}

export type RouteCandidate = {
  provider: AiProviderName;
  /** undefined = سياسة المزوّد الحالية (default model عند المزوّد نفسه). */
  model?: string;
};

export type RouterAttempt = {
  provider: AiProviderName;
  model?: string;
  ok: boolean;
  /** سبب الفشل الآمن — حالة HTTP فقط، بدون أي محتوى استجابة. */
  reason?: string;
};

export type AiRoutedResponse = AiChatResponse & {
  /** موجود فقط لو حصل fallback فعلي — للتلميحات والمراقبة. */
  fallback?: { attempts: RouterAttempt[] };
};

/** خطأ الراوتر نفسه (مش المزوّد): مفيش مرشح صالح للمهمة. */
export class AiRouteError extends Error {
  readonly task: AiTaskType;
  readonly reasons: RouterAttempt[];

  constructor(message: string, task: AiTaskType, reasons: RouterAttempt[]) {
    super(message);
    this.name = "AiRouteError";
    this.task = task;
    this.reasons = reasons;
  }
}

/**
 * هل الخطأ ده يستحق تجربة مرشّح تاني؟
 * - 400/413/422: طلبنا نفسه باين غلط — تكراره على مزوّد تاني مضيعة وضوضاء.
 * - 401/403/503: خطأ تهيئة لهذا المزوّد بالتحديد — نسيبه ونجرّب
 *   مزوّد مختلف لو متاح، بس مش نفس المزوّد تاني.
 * - 408/429/5xx: أعطال مؤقتة — تستاهل fallback.
 */
function shouldTryNextCandidate(status: number): boolean {
  return ![400, 413, 422].includes(status);
}

/**
 * ترتيب المرشحين لمهمة نصية:
 * ١) مصفوفة تفضيل المهمة (لو موجودة): موديل مسجّل + قابل للاختيار + صحة المزوّد بتسمح.
 * ٢) موديلات مزوّد السياسة المؤهَّلة للقدرات المطلوبة بترتيب أولويتها.
 * ٣) باقي المزوّدات بموديلاتها المؤهَّلة (بترتيب fallback داخلية).
 *
 * البوابة الموحّدة في كل الحالات: enabled + freeEndpoint + تهيئة المزوّد + صحته.
 */
export function routeCandidates(task: AiTaskType, now: Date = new Date()): RouteCandidate[] {
  void now; // نقطة توسّع مستقبلية (sticky sessions / budget windows) — مش مستخدمة حاليًا.
  const required = TASK_CAPABILITIES[task];
  const primaryProvider = AI_PROVIDER_BY_TASK[task];
  const allowPaid = paidModelsAllowed();
  const candidates: RouteCandidate[] = [];

  const pushIfEligible = (provider: AiProviderName, modelId?: string) => {
    // ممنوع تكرار نفس (provider, model) أو حتى نفس provider بمرشح أدنى لو
    // المزوّد أصله مش مكتمل التهيئة — NOT_CONFIGURED حالة ثابتة.
    if (!isConfigured(provider)) return;
    if (modelId) {
      let model;
      try {
        model = getModel(modelId);
      } catch {
        return; // معرّف غير مسجّل في السجل — يتجاهل بدل ما يكسر الراوتبغ.
      }
      // البوابة الموحّدة: enabled + free-only + القدرات المطلوبة كلها.
      if (!isModelSelectable(model, allowPaid)) return;
      if (!required.every((capability) => model.capabilities.includes(capability))) return;
      if (candidates.some((c) => c.provider === provider && c.model === model.id)) return;
      candidates.push({ provider, model: model.id });
    } else {
      if (candidates.some((c) => c.provider === provider && c.model === undefined)) return;
      candidates.push({ provider });
    }
  };

  // ١) مصفوفة تفضيل المهمة — بالترتيب المعلن، والموقوف/غير الصحي بيتخطى ديناميكيًا.
  for (const modelId of TASK_MODEL_PREFERENCE[task] ?? []) {
    const preferred = MODEL_REGISTRY.find((model) => model.id === modelId);
    if (!preferred || !isUsable(preferred.provider)) continue;
    pushIfEligible(preferred.provider, preferred.id);
  }

  // ٢+٣) مزوّد السياسة الأول، ثم باقي المزوّدات.
  const primaryModels = MODEL_REGISTRY.filter(
    (m) =>
      m.provider === primaryProvider &&
      isModelSelectable(m, allowPaid) &&
      required.every((capability) => m.capabilities.includes(capability))
  ).sort((a, b) => a.priority - b.priority);
  for (const model of primaryModels) pushIfEligible(primaryProvider, model.id);
  // المرشّح العام (بدون موديل محدد) بيتقبل فقط لو المزوّد أصله عنده موديل
  // قابل للاختيار — مزوّد كل موديلاته موقوفة/مستثناة ماينفعش يتخطى البوابة
  // بمرشح عام من غير موديل.
  const primaryHasSelectableModels = MODEL_REGISTRY.some(
    (m) => m.provider === primaryProvider && isModelSelectable(m, allowPaid)
  );
  if (primaryModels.length === 0 && primaryHasSelectableModels) {
    pushIfEligible(primaryProvider);
  }

  // مزوّدات بديلة — بس اللي حالتهم بتسمح بالاستخدام الآن.
  const otherProviders = [...new Set(MODEL_REGISTRY.map((m) => m.provider))].filter(
    (p) => p !== primaryProvider
  );
  for (const provider of otherProviders) {
    if (!isUsable(provider)) continue;
    const providerModels = fallbackCandidatesFor(provider).filter(
      (m) =>
        isModelSelectable(m, allowPaid) &&
        required.every((capability) => m.capabilities.includes(capability))
    );
    for (const model of providerModels) pushIfEligible(provider, model.id);
  }

  return candidates;
}

export class AiRouter {
  private readonly providers: Partial<Record<AiProviderName, AiTextProvider>>;

  constructor(providers: AiTextProvider[]) {
    this.providers = Object.fromEntries(providers.map((provider) => [provider.name, provider]));
  }

  getProviderName(task: AiTaskType): AiProviderName {
    return AI_PROVIDER_BY_TASK[task];
  }

  async completeChat(task: AiTaskType, input: AiChatRequest): Promise<AiRoutedResponse> {
    const required = TASK_CAPABILITIES[task];
    const mediaOnly = required.some((capability) => capability === "vision" || capability === "file_analysis");

    // مهام الوسائط: بدون أي fallback عابر للقدرات.
    if (mediaOnly || task === "image_generation") {
      const providerName = this.getProviderName(task);
      const provider = this.providers[providerName];
      if (!provider) throw new Error(`AI provider \"${providerName}\" is not available for task \"${task}\".`);
      try {
        const response = await provider.completeChat(input);
        recordProviderResult(providerName, { ok: true });
        return response;
      } catch (error) {
        if (error instanceof AiProviderError) {
          recordProviderResult(providerName, { ok: false, status: error.status, reason: `HTTP ${error.status}` });
        }
        throw error;
      }
    }

    const attempts: RouterAttempt[] = [];
    const candidates = routeCandidates(task);

    if (candidates.length === 0) {
      throw new AiRouteError(
        `No eligible AI provider is configured for task \"${task}\".`,
        task,
        []
      );
    }

    // سقف صريح ضد إعادة المحاولة اللانهائية حتى لو اتسعت القائمة مستقبلًا.
    const MAX_ATTEMPTS = Math.min(candidates.length, 3);

    // مزوّدات استبعدناها نهائيًا بعد خطأ تهيئة (401/403/503) — لا نلمسها تاني.
    const excludedProviders = new Set<AiProviderName>();
    let attemptsMade = 0;

    for (const candidate of candidates) {
      if (attemptsMade >= MAX_ATTEMPTS) break;
      if (excludedProviders.has(candidate.provider)) continue;
      const provider = this.providers[candidate.provider];
      if (!provider) {
        attempts.push({ provider: candidate.provider, model: candidate.model, ok: false, reason: "provider not instantiated" });
        excludedProviders.add(candidate.provider);
        continue;
      }
      const health = getProviderHealth(candidate.provider);
      // بنتخطى المزوّد عند الإشارات الصلبة فقط: كوتة خلصت أو مفتاح مرفوض.
      // حالات زي UNAVAILABLE/TIMEOUT بعد عطل واحد ما تمنعش تجربة الموديل
      // التالي لنفس المزوّد — ده أساس الـ fallback داخل المزوّد نفسه.
      if (health === "RATE_LIMITED" || health === "AUTH_ERROR") {
        attempts.push({ provider: candidate.provider, model: candidate.model, ok: false, reason: `${health} cooldown` });
        continue;
      }

      const request: AiChatRequest = candidate.model ? { ...input, model: candidate.model } : input;
      const startedAt = Date.now();
      attemptsMade++;
      try {
        const response = await provider.completeChat(request);
        recordProviderResult(candidate.provider, { ok: true, latencyMs: Date.now() - startedAt });
        attempts.push({ provider: candidate.provider, model: candidate.model ?? response.model, ok: true });
        return attempts.length > 1
          ? { ...response, fallback: { attempts: [...attempts] } }
          : response;
      } catch (error) {
        const status = error instanceof AiProviderError ? error.status : 500;
        const reason =
          error instanceof AiProviderError && error.reasonCode === "EMPTY_RESPONSE"
            ? "EMPTY_RESPONSE"
            : error instanceof AiProviderError
              ? `HTTP ${status}`
              : "unexpected error";
        recordProviderResult(
          candidate.provider,
          {
            ok: false,
            status,
            reason,
            reasonCode: error instanceof AiProviderError ? error.reasonCode : undefined,
          }
        );
        attempts.push({ provider: candidate.provider, model: candidate.model, ok: false, reason });

        if (!(error instanceof AiProviderError)) throw error;
        if (!shouldTryNextCandidate(error.status)) break;
        // 401/403/503 = مشكلة التهيئة لهذا المزوّد بالذات —
        // نستبعده بالكامل فورًا ونكمّل على مزوّد مختلف فقط، بدون إعادة محاولة.
        if ([401, 403, 503].includes(error.status)) {
          excludedProviders.add(candidate.provider);
        }
      }
    }

    throw new AiRouteError(`All AI candidates failed for task \"${task}\".`, task, attempts);
  }

  async analyzeMedia(task: AiTaskType, input: AiMediaAnalysisRequest): Promise<AiChatResponse> {
    const providerName = this.getProviderName(task);
    const provider = this.providers[providerName] as AiMediaProvider | undefined;
    if (!provider?.analyzeMedia) {
      recordProviderResult(providerName, { ok: false, status: 503, reason: "media capability missing" });
      throw new Error(`AI provider \"${providerName}\" cannot analyze media.`);
    }
    try {
      const response = await provider.analyzeMedia(input);
      recordProviderResult(providerName, { ok: true });
      return response;
    } catch (error) {
      if (error instanceof AiProviderError) {
        recordProviderResult(providerName, { ok: false, status: error.status, reason: `HTTP ${error.status}` });
      }
      throw error;
    }
  }

  async generateImage(input: AiImageGenerationRequest): Promise<AiImageGenerationResponse> {
    const providerName = this.getProviderName("image_generation");
    const provider = this.providers[providerName] as AiImageProvider | undefined;
    if (!provider?.generateImage) {
      recordProviderResult(providerName, { ok: false, status: 503, reason: "image capability missing" });
      throw new Error(`AI provider \"${providerName}\" cannot generate images.`);
    }
    try {
      const response = await provider.generateImage(input);
      recordProviderResult(providerName, { ok: true });
      return response;
    } catch (error) {
      if (error instanceof AiProviderError) {
        recordProviderResult(providerName, { ok: false, status: error.status, reason: `HTTP ${error.status}` });
      }
      throw error;
    }
  }
}
