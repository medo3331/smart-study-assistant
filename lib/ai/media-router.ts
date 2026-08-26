import type {
  AiMediaGenerationRequest,
  AiMediaResult,
  AiVideoRequest,
  AiVideoResult,
} from "./types";
import { AiProviderError } from "./types";
import type { AiCapability } from "./health";
import { getProviderHealth, isConfigured, recordProviderResult } from "./health";
import { MODEL_REGISTRY, getModel, paidModelsAllowed } from "./models";

/**
 * Media Router — منفصل تمامًا عن راوتر النصوص.
 *
 * المسار: مهمة وسائط → فلتر قدرات → بوابة free-only → صحة المزوّد
 * → موديل متحقق منه → تنفيذ → fallback → MEDIA_MODEL_UNAVAILABLE لو مفيش حد.
 * ممنوع أي مهمة وسائط توصل لموديل نصي، والعكس صحيح.
 */

/** معرّف الموديل اللي هينفّذ مهمة وسائط (بعد كل الفلاتر). */
export type MediaQueryCandidate = {
  provider: import("./types").AiProviderName;
  modelId: string;
};

const MEDIA_TASK_CAPABILITIES: Record<"image_generation" | "image_edit" | "video_generation", AiCapability[]> = {
  image_generation: ["image_generation"],
  image_edit: ["vision", "image_generation"],
  video_generation: ["video_generation"],
};

/** المرشحون لمهمة وسائط — بنفس بوابة free-only بتاعة راوتر النصوص بالظبط. */
export function mediaCandidates(task: "image_generation" | "image_edit" | "video_generation"): MediaQueryCandidate[] {
  const required = MEDIA_TASK_CAPABILITIES[task];
  const allowPaid = paidModelsAllowed();
  return MODEL_REGISTRY.filter(
    (model) =>
      isConfigured(model.provider) &&
      model.enabled &&
      (model.freeEndpoint || allowPaid) &&
      required.every((capability) => model.capabilities.includes(capability))
  ).map((model) => ({ provider: model.provider, modelId: model.id }));
}

/** مولّد الوسائط لمزوّد — بيتحقق منه بالواجهة مش بالـ cast الأعمى. */
type MediaExecutor = import("./types").AiImageGenerationCapable;

function executorFor(providerName: MediaQueryCandidate["provider"]): MediaExecutor | undefined {
  // استيراد مؤجل لتجنّب الدورات — الملف ده server-only by use.
  switch (providerName) {
    case "nvidia":
      return nvidiaMediaExecutor;
    case "openrouter":
      return openrouterMediaExecutor;
    case "gemini":
      return geminiMediaExecutor;
    default:
      return undefined;
  }
}

/* مراجع بتتملى كسولًا من providers الحقيقية (تجنّب دورة استيراد دائرية). */
let nvidiaMediaExecutor: MediaExecutor | undefined;
let openrouterMediaExecutor: MediaExecutor | undefined;
let geminiMediaExecutor: MediaExecutor | undefined;
export function registerMediaExecutors(executors: {
  nvidia?: MediaExecutor;
  openrouter?: MediaExecutor;
  gemini?: MediaExecutor;
}): void {
  nvidiaMediaExecutor = executors.nvidia;
  openrouterMediaExecutor = executors.openrouter;
  geminiMediaExecutor = executors.gemini;
}

/** محاولات الوسائط للمراقبة — HTTP status فقط، بدون أي محتوى. */
export type MediaAttempt = { provider: MediaQueryCandidate["provider"]; modelId: string; ok: boolean; reason?: string };

/** خطأ موحّد: مفيش موديل وسائط مجاني ومتحقق منه للمهمة دي. */
export class MediaModelUnavailableError extends Error {
  readonly task: string;
  constructor(task: string) {
    super(`No verified free media model is registered for task "${task}".`);
    this.name = "MediaModelUnavailableError";
    this.task = task;
  }
}

/**
 * توليد/تعديل صورة عبر أفضل موديل متاح مع fallback.
 * مفيش موديل مؤهل = MediaModelUnavailableError (مش خطأ مزوّد خام).
 */
export async function generateImageWithFallback(
  task: "image_generation" | "image_edit",
  input: AiMediaGenerationRequest
): Promise<{ result: AiMediaResult; attempts: MediaAttempt[] }> {
  const candidates = mediaCandidates(task);
  const attempts: MediaAttempt[] = [];

  for (const candidate of candidates) {
    const providerHealth = getProviderHealth(candidate.provider);
    if (providerHealth === "RATE_LIMITED" || providerHealth === "AUTH_ERROR") {
      attempts.push({ ...candidate, ok: false, reason: `${providerHealth} cooldown` });
      continue;
    }
    const executor = executorFor(candidate.provider);
    if (!executor?.generateMedia) {
      attempts.push({ ...candidate, ok: false, reason: "provider lacks image capability" });
      continue;
    }
    const startedAt = Date.now();
    try {
      // الموديل بيتحدد من السجل المركزي — نفس modelId المسجّل بيتبعت للمزوّد.
      const result = await executor.generateMedia({ ...input, model: candidate.modelId });
      void startedAt;
      recordProviderResult(candidate.provider, { ok: true });
      attempts.push({ ...candidate, ok: true });
      return { result: { ...result, model: candidate.modelId }, attempts };
    } catch (error) {
      const status = error instanceof AiProviderError ? error.status : 500;
      recordProviderResult(candidate.provider, {
        ok: false,
        status,
        reason: error instanceof Error ? error.name : "media failure",
      });
      attempts.push({ ...candidate, ok: false, reason: `HTTP ${status}` });
      // طلب تالف (400 عيلة) مايتعادش على مزوّد تاني.
      if ([400, 413, 422].includes(status)) break;
    }
  }

  throw new MediaModelUnavailableError(task);
}

/**
 * فيديو: نفس الفلاتر بالظبط. لو مفيش موديل متحقق منه مجاني →
 * MediaModelUnavailableError فورًا بدون أي استدعاء شبكة — مش بنستبدل
 * موديل نص أبدًا ولا نفترض توليد sync.
 */
export async function generateVideoWithFallback(
  input: AiVideoRequest
): Promise<{ result: AiMediaResult | AiVideoResult; attempts: MediaAttempt[] }> {
  const candidates = mediaCandidates("video_generation");
  if (candidates.length === 0) {
    throw new MediaModelUnavailableError("video_generation");
  }
  // حاليًا مفيش أي مزوّد بينفّذ AiVideoGenerationCapable — الحالة دي ثابتة
  // لحد ما يتحقق موديل فيديو حقيقي ويُسجّل بقدرة video_generation.
  const attempts: MediaAttempt[] = candidates.map((candidate) => ({
    ...candidate,
    ok: false,
    reason: "no provider implements verified video generation",
  }));
  throw new MediaModelUnavailableError("video_generation");
}
