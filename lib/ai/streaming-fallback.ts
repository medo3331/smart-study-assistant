import type { AiChatRequest, AiProviderName, AiTaskType } from "./types";
import { AiProviderError } from "./types";
import { streamingAdapterFor, type AiStreamChunk } from "./streaming";
import { routeCandidates } from "./routing";

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
    const adapter = streamingAdapterFor(provider);
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
      console.warn(`[Stream Fallback] ${provider} failed (${status || lastError.message}), trying next…`);
    }
  }

  throw lastError ?? new AiProviderError("All stream providers failed", 502, "groq");
}
