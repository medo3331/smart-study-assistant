import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiProviderName, AiTaskType, AiTokenUsage } from "./types";

/**
 * تقديرات تقريبية بالدولار لكل مليون توكن — أساس أولي للـ credits لا للفاتورة.
 * لو مفيش usage من الـ provider بيتسجل تقدير بالنص المُرجَّع فقط.
 */
const USD_PER_MILLION_TOKENS: Record<AiProviderName, { prompt: number; completion: number }> = {
  groq: { prompt: 0.25, completion: 0.59 },
  gemini: { prompt: 0.30, completion: 2.5 },
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

/** Best-effort audit record; AI responses must not fail if analytics migration is pending. */
export async function recordAiOperation(
  supabase: SupabaseClient,
  operation: {
    userId: string;
    provider: AiProviderName;
    model: string;
    taskType: AiTaskType;
    status: "completed" | "failed";
    usage?: AiTokenUsage;
    contentLength?: number;
  }
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
  const { error } = await supabase.from("ai_operations").insert({
    user_id: operation.userId,
    provider: operation.provider,
    model: operation.model,
    task_type: operation.taskType,
    status: operation.status,
    token_usage: tokenUsage,
    estimated_cost: estimatedCost ?? null,
  });
  if (error) console.warn("ai operations: could not record", error.message);
}
