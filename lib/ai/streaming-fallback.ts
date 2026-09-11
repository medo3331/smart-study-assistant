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
  input: AiChatRequest
): AsyncGenerator<AiStreamChunk, void, undefined> {
  const candidates = routeCandidates(task);
  const seen = new Set<AiProviderName>();
  let lastError: Error | null = null;

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
    if (!adapter) continue;
    try {
      yield* adapter.streamChat({
        ...input,
        model: candidates.find((c) => c.provider === provider)?.model ?? input.model,
      });
      return;
    } catch (err) {
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
