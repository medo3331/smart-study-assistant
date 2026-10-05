import { recordAiUsage, type UsageStatus } from "./usage-accounting";
import { scheduleUsageRecording } from "./usage-scheduler";
import type { AiUsageContext } from "./usage-context";
import type { AiChatRequest, AiProviderName, AiTaskType } from "./types";
import { AiProviderError } from "./types";
import { streamingAdapterFor, type AiStreamChunk, type AiStreamingProvider } from "./streaming";
import { routeCandidates } from "./routing";

type AdapterLookup = (provider: AiProviderName) => AiStreamingProvider | undefined;
let adapterLookup: AdapterLookup = streamingAdapterFor;

/** @internal — حقن محوّلات وهمية في الاختبارات فقط. */
export function __setStreamingAdapterLookupForTests(lookup: AdapterLookup | null) {
  adapterLookup = lookup ?? streamingAdapterFor;
}

/**
 * Try streaming adapters in route-candidate order.
 * On 429 / 5xx / empty adapter, continue to the next provider.
 */
export async function* streamWithFallback(
  task: Extract<AiTaskType, "chat" | "content" | "coding" | "explain" | "tutor">,
  input: AiChatRequest,
  usage?: AiUsageContext,
): AsyncGenerator<AiStreamChunk, void, undefined> {
  const candidates = routeCandidates(task);
  const seen = new Set<AiProviderName>();
  let lastError: Error | null = null;
  let attemptsMade = 0;

  const ordered: AiProviderName[] = [];
  for (const c of candidates) {
    if (!seen.has(c.provider)) {
      seen.add(c.provider);
      ordered.push(c.provider);
    }
  }
  if (ordered.length === 0) {
    ordered.push("groq", "nvidia", "openrouter", "gemini");
  }

  for (const provider of ordered) {
    const adapter = adapterLookup(provider);
    // 🚫 التخطي قبل أي نداء: مزوّد مش مُهيّأ / cooldown.
    //    **مش** بيستهلك رقم محاولة — وده شرط "محاولة فعلية = سطر".
    if (!adapter) continue;

    // 🔒 `attemptNo` ثابت للطبقة دي من هنا لحد ما المحاولة تنتهي.
    //
    // ⚠️ **السبب الحقيقي للـ bug السابق:** الـ `recordAttempt` كان بيقرا
    //    `attemptNo` المتغيّرة وقت **التنفيذ**، والكتابة بتتأجل لحد ما
    //    الـ `scheduleUsageRecording` callback تشتغل — وده بيحصل **بعد**
    //    اللوب يخلص. فكل السطور كانت بتاخد آخر قيمة للـ counter.
    //    الإصلاح: التقاط الرقم في ثابت محلي قبل النداء.
    const attemptNo = attemptsMade++;

    const startedAt = Date.now();
    const recordAttempt = (status: UsageStatus) => {
      if (!usage) return;
      scheduleUsageRecording(() =>
        recordAiUsage({
          userId: usage.userId ?? null,
          feature: usage.feature ?? task,
          operationId: usage.operationId,
          idempotencyKey: usage.idempotencyKey,
          attemptNo,
          provider,
          model: candidates.find((c) => c.provider === provider)?.model ?? input.model ?? null,
          status,
          units: 1,
          latencyMs: Date.now() - startedAt,
          metadata: { path: "stream", source: usage.source, ...usage.diagnostics },
        }),
      );
    };
    try {
      yield* adapter.streamChat({
        ...input,
        model: candidates.find((c) => c.provider === provider)?.model ?? input.model,
      });
      recordAttempt("completed");
      return;
    } catch (err) {
      recordAttempt(
        err instanceof AiProviderError && err.reasonCode === "EMPTY_RESPONSE"
          ? "failed_after_response"
          : err instanceof AiProviderError
            ? "failed_no_response"
            : "error",
      );
      lastError = err as Error;
      const status = err instanceof AiProviderError ? err.status : 0;
      if (status === 400 || status === 413 || status === 422) throw err;
      const safeMsg = lastError.message.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 80);
      console.warn(`[Stream Fallback] ${provider} failed (${status || safeMsg}), trying next…`);
    }
  }

  throw new AiProviderError(
    `All stream providers failed. Last error: ${lastError?.message ?? "unknown"}`,
    lastError instanceof AiProviderError ? lastError.status : 502,
    lastError instanceof AiProviderError ? lastError.provider : "groq"
  );
}
