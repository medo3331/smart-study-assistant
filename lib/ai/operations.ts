import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiProviderName, AiTaskType, AiTokenUsage } from "./types";
import type { RouterAttempt } from "./routing";

/**
 * تقديرات تقريبية بالدولار لكل مليون توكن — أساس أولي للـ credits لا للفاتورة.
 * لو مفيش usage من الـ provider بيتسجل تقدير بالنص المُرجَّع فقط.
 */
const USD_PER_MILLION_TOKENS: Record<AiProviderName, { prompt: number; completion: number }> = {
  groq: { prompt: 0.25, completion: 0.59 },
  gemini: { prompt: 0.30, completion: 2.5 },
  // نقطة NVIDIA المجانية — تكلفة مقدَّرة صفر؛ لو الموديلات اتغيرت لمدفوعة
  // يتراجع المدخل ده مع تحديث freeEndpoint في السجل.
  nvidia: { prompt: 0, completion: 0 },
  // OpenRouter بيتسخدم بس بموديلات free متحقق منها (بوابة free-only)، فالتقدير صفر.
  openrouter: { prompt: 0, completion: 0 },
};

/** توليد الصور بيتحسب بالصورة مش بالتوكن — تقدير تقريبي لكل صورة. */
const USD_PER_IMAGE = 0.04;

function estimateCost(provider: AiProviderName, taskType: AiTaskType, usage: AiTokenUsage, contentLength: number): number | undefined {
  if (taskType === "image_generation") return USD_PER_IMAGE;
  const promptTokens = usage.promptTokens ?? Math.ceil(contentLength / 4);
  const completionTokens = usage.completionTokens ?? 0;
  if (!promptTokens && !completionTokens) return undefined;
  const rates = USD_PER_MILLION_TOKENS[provider];
  return Number(((promptTokens * rates.prompt + completionTokens * rates.completion) / 1_000_000).toFixed(6));
}

export type AiOperationRecord = {
  userId: string;
  provider: AiProviderName;
  model: string;
  taskType: AiTaskType;
  status: "completed" | "failed";
  usage?: AiTokenUsage;
  contentLength?: number;
  /** زمن التنفيذ الكلي بالميلي ثانية (اختياري). */
  latencyMs?: number;
  /** مسار المحاولات لو حصل fallback فعلي — بدون أي محتوى طلب/استجابة. */
  fallbackAttempts?: RouterAttempt[];
};

/** Best-effort audit record; AI responses must not fail if analytics migration is pending. */
export async function recordAiOperation(
  supabase: SupabaseClient,
  operation: AiOperationRecord
) {
  const usage = operation.usage ?? {};
  const tokenUsage =
    usage.promptTokens !== undefined || usage.completionTokens !== undefined
      ? { prompt_tokens: usage.promptTokens ?? null, completion_tokens: usage.completionTokens ?? null }
      : null;
  const estimatedCost =
    operation.status === "completed"
      ? estimateCost(operation.provider, operation.taskType, usage, operation.contentLength ?? 0)
      : undefined;
  const usedFallback = Boolean(operation.fallbackAttempts?.length);
  const baseRow = {
    user_id: operation.userId,
    provider: operation.provider,
    model: operation.model,
    task_type: operation.taskType,
    status: operation.status,
    token_usage: tokenUsage,
    estimated_cost: estimatedCost ?? null,
  };
  // الأعمدة الموسّعة اختيارية؛ لو migration لسه ما اتعملتش نرجّع للصف الأساسي
  // بدل ما نفقد التسجيل كله — التسجيل best-effort بالتصميم.
  const extendedRow = {
    ...baseRow,
    ...(operation.latencyMs !== undefined ? { latency_ms: operation.latencyMs } : {}),
    ...(usedFallback && operation.fallbackAttempts ? { fallback_attempts: operation.fallbackAttempts } : {}),
  };

  let { error } = await supabase.from("ai_operations").insert(extendedRow);
  if (error && (extendedRow.latency_ms !== undefined || extendedRow.fallback_attempts)) {
    console.warn("ai operations: extended columns rejected, falling back to base row:", error.message);
    ({ error } = await supabase.from("ai_operations").insert(baseRow));
  }
  if (error) console.warn("ai operations: could not record", error.message);
}

/**
 * تلميح مراقبة خفيف بدون أي بيانات حساسة — للسجلات فقط، مش بديل عن جدول
 * ai_operations. بيشتغل حتى لو مفيش Supabase (بيطبع للـ server logs).
 */
export function logAiTelemetry(event: {
  taskType: AiTaskType;
  provider?: AiProviderName;
  model?: string;
  ok: boolean;
  latencyMs?: number;
  fallbackUsed?: boolean;
}) {
  const parts = [
    `task=${event.taskType}`,
    event.provider && `provider=${event.provider}`,
    event.model && `model=${event.model}`,
    `ok=${event.ok}`,
    event.latencyMs !== undefined && `latency=${event.latencyMs}ms`,
    event.fallbackUsed && "fallback=used",
  ].filter(Boolean);
  console.info(`ai-telemetry ${parts.join(" ")}`);
}
