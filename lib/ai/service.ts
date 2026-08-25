import { aiRouter } from "./router";
import type { AiRouter as AiRouterClass } from "./routing";
import type { AiRoutedResponse } from "./routing";
import type {
  AiChatMessage,
  AiChatRequest,
  AiMediaAnalysisRequest,
  AiTaskType,
} from "./types";
import type { AiCapability } from "./health";
import { capabilitiesForTask } from "./routing";
import { streamingAdapterFor } from "./streaming";
import type { AiStreamChunk } from "./streaming";
import {
  validateStructured,
  type Validator,
} from "./structured";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MutableService = { __router?: AiRouterClass } & Record<string, any>;

function currentRouter(): AiRouterClass {
  const override = (AIService as unknown as MutableService).__router;
  return override ?? aiRouter;
}

/**
 * AIService — الواجهة الموحّدة للتطبيق كله.
 *
 * أي ميزة/وكيل جديدة بتتواصل مع الذكاء الاصطناعي من هنا فقط. ممنوع استيراد
 * providers مباشرة من ملفات الميزات، وممنوع fetch لـ API مزوّد من كود المنتج.
 *
 * كل الدوال ترجّع نفس شكل الاستجابة (provider/model/content) بغضّ النظر عن
 * المزوّد اللي نفّذ الطلب فعليًا.
 */
export const AIService = {
  /**
   * نقطة حقن الاختبار: تسمح للاختبارات باستبدال الراوتر بمزوّد وهمي.
   * لا تستخدمها من كود المنتج أبدًا — الإنتاج يمشي على الراوتر الحقيقي.
   * @internal
   */
  __setRouterForTests(router: AiRouterClass) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (AIService as any).__router = router;
  },

  /** توليد نص عادي (chat/content/coding/planning…). يرمي AiRouteError لو كل المرشحين فشلوا. */
  generate(task: AiTaskType, input: Omit<AiChatRequest, "model"> & { model?: string }): Promise<AiRoutedResponse> {
    return currentRouter().completeChat(task, input);
  },

  /**
   * بث تدريجي للنص. يرجّع AsyncGenerator من chunks موحّدة بدون كشف المزوّد.
   * البث حاليًا بيمشي على سياسة مهمة النصوص الأساسية (بدون fallback أثناء
   * البث) — fallback البث المتوسط هيتقرر في مرحلة لاحقة بعد قياس سلوكه.
   */
  async *stream(task: Extract<AiTaskType, "chat" | "content" | "coding">,
    input: Omit<AiChatRequest, "model"> & { model?: string }): AsyncGenerator<AiStreamChunk, void, undefined> {
    const providerName = aiRouter.getProviderName(task);
    const adapter = streamingAdapterFor(providerName);
    if (!adapter) throw new Error(`No streaming adapter for provider "${providerName}".`);
    yield* adapter.streamChat(input);
  },

  /** تحليل وسائط (صور/ملفات) عبر مزوّد الرؤية. */
  analyze(task: Extract<AiTaskType, "image_analysis" | "file_analysis">, input: AiMediaAnalysisRequest) {
    return aiRouter.analyzeMedia(task, input);
  },

  /** تحليل ملف: اسم أوضح لنفس مسار file_analysis — للوكلاء القادمة. */
  analyzeFile(input: AiMediaAnalysisRequest) {
    return aiRouter.analyzeMedia("file_analysis", input);
  },

  /**
   * توليد مخرجات منظمة: بطلب JSON من الموديل + استخراج + تحقق إلزامي.
   * الفشل هنا معناه رد الموديل مش مطابق — لا يُعاد للموديل تلقائيًا (سياسة
   * صريحة: caller يقرر إعادة المحاولة بصياغة أدق).
   */
  async generateStructured<T>(
    task: AiTaskType,
    schemaDescription: string,
    validate: Validator<T>,
    input: Omit<AiChatRequest, "model"> & { model?: string; temperature?: number }
  ): Promise<{ value: T } & Pick<AiRoutedResponse, "provider" | "model" | "usage">> {
    const messages: AiChatMessage[] = [
      ...(input.messages[0]?.role === "system"
        ? [input.messages[0]]
        : []),
      {
        role: "system",
        content:
          `أجب بكائن JSON صالح فقط، بدون أي شرح أو تنسيق حول الكائن.\nالبنية المطلوبة:\n${schemaDescription}`,
      },
      ...input.messages.slice(input.messages[0]?.role === "system" ? 1 : 0),
    ];

    const response = await currentRouter().completeChat(task, { ...input, messages, temperature: input.temperature ?? 0.2 });
    const result = validateStructured(response.content, validate);
    if (!result.ok) {
      throw new Error(`Structured output validation failed (${response.provider}/${response.model}): ${result.error}`);
    }
    return { value: result.value, provider: response.provider, model: response.model, usage: response.usage };
  },

  /** القدرات المطلوبة لمهمة — للواجهات اللي بتحتاج تعرض/تفحص قبل التنفيذ. */
  requiredCapabilities(task: AiTaskType): AiCapability[] {
    return capabilitiesForTask(task);
  },
};
