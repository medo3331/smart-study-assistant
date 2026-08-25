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
import { MODEL_REGISTRY, fallbackCandidatesFor, getModel } from "./models";

/** سياسة المهام الحالية — مرجع التوافق والاختبارات (test-ai-router.mjs يعتمد عليه). */
export const AI_PROVIDER_BY_TASK: Readonly<Record<AiTaskType, AiProviderName>> = {
  chat: "groq",
  content: "groq",
  marketing_copy: "groq",
  coding: "groq",
  file_analysis: "gemini",
  image_analysis: "gemini",
  data_analysis: "gemini",
  planning: "gemini",
  business_plan: "gemini",
  marketing_plan: "gemini",
  roadmap: "gemini",
  image_generation: "gemini",
};

/**
 * القدرات المطلوبة لكل نوع مهمة. مهام الوسائط والصور محتكرة بمزوّدها —
 * لا fallback عابر للقدرات أبدًا: فشل تحليل ملف/صورة لازم يوصل كمَا هو
 * مش يتنكّر كرد نصي ناجح.
 */
const TASK_CAPABILITIES: Readonly<Record<AiTaskType, AiCapability[]>> = {
  chat: ["text"],
  content: ["text"],
  marketing_copy: ["text"],
  coding: ["text", "coding"],
  planning: ["text", "reasoning"],
  business_plan: ["text", "reasoning"],
  marketing_plan: ["text", "reasoning"],
  roadmap: ["text", "reasoning"],
  data_analysis: ["text", "structured_output"],
  file_analysis: ["file_analysis"],
  image_analysis: ["vision"],
  image_generation: ["image_generation"],
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
 * - 400: طلبنا نفسه باين غلط — تكراره على مزوّد تاني مضيعة وضوضاء.
 * - 401/403/404/503: خطأ تهيئة لهذا المزوّد بالتحديد — نسيبه ونجرّب
 *   مزوّد مختلف لو متاح، بس مش نفس المزوّد تاني.
 * - 408/429/5xx: أعطال مؤقتة — تستاهل fallback.
 */
function shouldTryNextCandidate(status: number): boolean {
  return status !== 400;
}

/**
 * ترتيب المرشحين لمهمة نصية:
 * ١) مزوّد السياسة بموديله الأعلى أولوية المؤهَّل للقدرات المطلوبة.
 * ٢) باقي موديلات نفس المزوّد المؤهَّلة بترتيب fallback.
 * ٣) مزوّدات أخرى بموديلات مؤهَّلة (بترتيب fallback داخلية) — فقط لو صحتها بتسمح.
 */
export function routeCandidates(task: AiTaskType, now: Date = new Date()): RouteCandidate[] {
  void now; // نقطة توسّع مستقبلية (sticky sessions / budget windows) — مش مستخدمة حاليًا.
  const required = TASK_CAPABILITIES[task];
  const primaryProvider = AI_PROVIDER_BY_TASK[task];
  const candidates: RouteCandidate[] = [];

  const pushIfEligible = (provider: AiProviderName, modelId?: string) => {
    // ممنوع تكرار نفس (provider, model) أو حتى نفس provider بمرشح أدنى لو
    // المزوّد أصله مش مكتمل التهيئة — NOT_CONFIGURED حالة ثابتة.
    if (!isConfigured(provider)) return;
    if (modelId) {
      const model = getModel(modelId);
      if (!required.every((capability) => model.capabilities.includes(capability))) return;
      if (candidates.some((c) => c.provider === provider && c.model === model.id)) return;
      candidates.push({ provider, model: model.id });
    } else {
      if (candidates.some((c) => c.provider === provider && c.model === undefined)) return;
      candidates.push({ provider });
    }
  };

  // ١+٢) مزوّد السياسة الأول.
  const primaryModels = MODEL_REGISTRY.filter(
    (m) =>
      m.provider === primaryProvider &&
      required.every((capability) => m.capabilities.includes(capability))
  ).sort((a, b) => a.priority - b.priority);
  for (const model of primaryModels) pushIfEligible(primaryProvider, model.id);
  if (primaryModels.length === 0) pushIfEligible(primaryProvider);

  // ٣) مزوّدات بديلة — بس اللي حالتهم بتسمح بالاستخدام الآن.
  const otherProviders = [...new Set(MODEL_REGISTRY.map((m) => m.provider))].filter(
    (p) => p !== primaryProvider
  );
  for (const provider of otherProviders) {
    if (!isUsable(provider)) continue;
    const providerModels = fallbackCandidatesFor(provider).filter((m) =>
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

    // مهام الوسائط: نفس السلوك الحالي حرفيًا — بدون أي fallback عابر للقدرات.
    if (mediaOnly || task === "image_generation") {
      const providerName = this.getProviderName(task);
      const provider = this.providers[providerName];
      if (!provider) throw new Error(`AI provider "${providerName}" is not available for task "${task}".`);
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
        `No eligible AI provider is configured for task "${task}".`,
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
      if (getProviderHealth(candidate.provider) === "RATE_LIMITED") {
        attempts.push({ provider: candidate.provider, model: candidate.model, ok: false, reason: "RATE_LIMITED cooldown" });
        continue; // مؤقت — المزوّد يرجع تلقائيًا بعد التهدئة، فمش بنستبعده.
      }

      const request: AiChatRequest = candidate.model ? { ...input, model: candidate.model } : input;
      attemptsMade++;
      try {
        const response = await provider.completeChat(request);
        recordProviderResult(candidate.provider, { ok: true });
        attempts.push({ provider: candidate.provider, model: candidate.model ?? response.model, ok: true });
        return attempts.length > 1
          ? { ...response, fallback: { attempts: [...attempts] } }
          : response;
      } catch (error) {
        const status = error instanceof AiProviderError ? error.status : 500;
        const reason = error instanceof AiProviderError ? `HTTP ${status}` : "unexpected error";
        recordProviderResult(
          candidate.provider,
          { ok: false, status, reason }
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

    throw new AiRouteError(`All AI candidates failed for task "${task}".`, task, attempts);
  }

  async analyzeMedia(task: AiTaskType, input: AiMediaAnalysisRequest): Promise<AiChatResponse> {
    const providerName = this.getProviderName(task);
    const provider = this.providers[providerName] as AiMediaProvider | undefined;
    if (!provider?.analyzeMedia) {
      recordProviderResult(providerName, { ok: false, status: 503, reason: "media capability missing" });
      throw new Error(`AI provider "${providerName}" cannot analyze media.`);
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
      throw new Error(`AI provider "${providerName}" cannot generate images.`);
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
