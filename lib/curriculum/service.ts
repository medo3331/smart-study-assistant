/* ==========================================================================
   Curriculum Builder — التنسيق بين الموديل والتحقق

   الخطوات:
   1) Outline: عناوين الدروس فقط (نداء واحد).
   2) Enrichment: وصف كل دفعة من 10 دروس (نداء لكل دفعة).
   3) التجميع والتحقق النهائي.

   كل خطوة ليها محاولة إعادة واحدة عند الفشل القابل لإعادة المحاولة.
   لو فشلت المحاولة التانية، الخطأ بيطلع للراوت — ومفيش أي حفظ جزئي هنا.
   ========================================================================== */

import { aiRouter } from "@/lib/ai/router";
import type { AiChatMessage } from "@/lib/ai/types";
import type { AiUsageContext } from "@/lib/ai/usage-context";
import {
  buildCurriculumDays,
  buildEnrichmentMessages,
  buildOutlineMessages,
  chunkOutline,
  parseEnrichment,
  parseOutline,
} from "./prompts";
import {
  CurriculumGenerationError,
  type CurriculumGenerationInput,
  type CurriculumGenerationResult,
} from "./types";

/** نداء واحد للموديل عبر الراوتر — بياخد fallback وتدوير المفاتيح مجاناً. */
async function callModel(
  messages: AiChatMessage[],
  usage: AiUsageContext,
  temperature: number
): Promise<string> {
  try {
    const response = await aiRouter.completeChat("study_plan", {
      messages,
      temperature,
      usage,
    });
    if (!response.content || !response.content.trim()) {
      throw new CurriculumGenerationError("الموديل رجّع رد فاضي.", {
        retryable: true,
        code: "EMPTY_MODEL_RESPONSE",
      });
    }
    return response.content;
  } catch (error) {
    if (error instanceof CurriculumGenerationError) throw error;
    throw new CurriculumGenerationError("تعذّر الاتصال بمزوّد الذكاء الاصطناعي.", {
      retryable: true,
      code: "PROVIDER_ERROR",
    });
  }
}

/**
 * محاولة + إعادة واحدة. الأخطاء غير القابلة لإعادة المحاولة (زي مادة غير
 * واضحة) بتطلع فوراً، لأن إعادة نفس الطلب مش هتغيّر النتيجة.
 */
async function withOneRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (firstError) {
    if (firstError instanceof CurriculumGenerationError && !firstError.retryable) {
      throw firstError;
    }
  }

  try {
    return await run();
  } catch (secondError) {
    if (secondError instanceof CurriculumGenerationError) throw secondError;
    throw new CurriculumGenerationError("فشل توليد المنهج بعد إعادة المحاولة.", {
      retryable: false,
      code: "GENERATION_FAILED",
    });
  }
}

export async function generateCurriculum(
  input: CurriculumGenerationInput,
  usage: AiUsageContext
): Promise<CurriculumGenerationResult> {
  const outline = await withOneRetry(async () => {
    const raw = await callModel(buildOutlineMessages(input), usage, 0.42);
    return parseOutline(raw, input);
  });

  if (outline.length !== input.lessonCount) {
    throw new CurriculumGenerationError(
      `عدد الدروس الناتج ${outline.length} مختلف عن المطلوب ${input.lessonCount}.`,
      { retryable: false, code: "COUNT_MISMATCH" }
    );
  }

  const batches = chunkOutline(outline);
  const descriptions = new Map<number, string>();

  for (const batch of batches) {
    const batchDescriptions = await withOneRetry(async () => {
      const raw = await callModel(buildEnrichmentMessages(input, batch), usage, 0.32);
      return parseEnrichment(raw, batch);
    });

    for (const [day, description] of batchDescriptions) {
      descriptions.set(day, description);
    }
  }

  const days = buildCurriculumDays(outline, descriptions);
  const startDay = input.startDay ?? 1;

  // تحقق أخير: الترتيب startDay..endDay بدون فجوات أو تكرار.
  for (let index = 0; index < days.length; index++) {
    if (days[index].day !== startDay + index) {
      throw new CurriculumGenerationError("ترتيب الدروس الناتج غير متصل.", {
        retryable: false,
        code: "INVALID_SEQUENCE",
      });
    }
  }

  return {
    course: {
      subject: input.subject,
      level: input.level,
      lessonCount: input.lessonCount,
    },
    days,
    meta: {
      requested: input.lessonCount,
      generated: days.length,
      level: input.level,
      focusTopics: input.focusTopics,
      batches: batches.length,
      reviewDay: startDay + input.lessonCount - 1,
    },
  };
}
