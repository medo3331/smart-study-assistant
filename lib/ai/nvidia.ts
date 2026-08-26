import type {
  AiChatPayload,
  AiChatRequest,
  AiChatResponse,
  AiEmbeddingProvider,
  AiTextProvider,
  AiTokenUsage,
} from "./types";
import { AiProviderError } from "./types";

/**
 * NVIDIA Free Endpoint عبر الـ OpenAI-compatible API بتاع NVIDIA.
 * Server-only by use — المفتاح بيقرأ من البيئة وقت الطلب ومبيخرجش أبدًا.
 *
 * ملاحظات تصميم:
 * - مفيش تدوير مفاتيح هنا: NVIDIA بيتهيأ بمتغير واحد (NVIDIA_API_KEY).
 * - مفيش أي موديل hard-coded: الموديل بييجي من MODEL_REGISTRY عن طريق
 *   الراوتر (candidate.model) — وdefaultModel للعرض/التشخيص فقط.
 * - استجابة 200 من غير محتوى = EMPTY_RESPONSE (فشل) عشان الراوتر يعمل fallback.
 */

const NVIDIA_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_EMBED_URL = "https://integrate.api.nvidia.com/v1/embeddings";

/** مهلة كل طلب NVIDIA — بعدها TIMEOUT فيسمح بالـ fallback للراوتر. */
export const NVIDIA_TIMEOUT_MS = 30_000;

function isPayload(value: unknown): value is AiChatPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** مفتاح NVIDIA من البيئة — بدون أي قيمة افتراضية أو طباعة. */
export function nvidiaApiKey(): string | undefined {
  return process.env.NVIDIA_API_KEY?.trim() || undefined;
}

export class NvidiaProvider implements AiTextProvider, AiEmbeddingProvider {
  readonly name = "nvidia" as const;

  async completeChat(input: AiChatRequest): Promise<AiChatResponse> {
    const apiKey = nvidiaApiKey();
    if (!apiKey) {
      console.error("ai/nvidia: NVIDIA_API_KEY غير معرف");
      throw new AiProviderError("NVIDIA is not configured", 503, this.name);
    }

    const model = input.model ?? "nvidia/nemotron-3.5-lightning-30b-a3b";
    let response: Response;
    try {
      response = await fetch(NVIDIA_CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: input.messages,
          temperature: input.temperature ?? 0.7,
        }),
        signal: AbortSignal.timeout(NVIDIA_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        console.error("ai/nvidia: request timed out");
        throw new AiProviderError("NVIDIA request timed out", 504, this.name, "TIMEOUT");
      }
      console.error("ai/nvidia: request failed", error);
      throw new AiProviderError("NVIDIA request failed", 502, this.name, "NETWORK");
    }

    if (!response.ok) {
      // جسم الاستجابة بيتسجل في اللوجز فقط — مبيرجعش للكلاينت أبدًا.
      const detail = await response.text().catch(() => "");
      console.error("ai/nvidia: API error", response.status, detail.slice(0, 500));
      throw new AiProviderError("NVIDIA returned an error", response.status, this.name);
    }

    const payload = await response.json().catch(() => null);
    if (!isPayload(payload)) {
      console.error("ai/nvidia: invalid API response");
      throw new AiProviderError("NVIDIA returned an invalid response", 502, this.name);
    }

    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      // HTTP 200 من غير محتوى مفيد = فشل صريح، مش نجاح فاضي.
      console.error("ai/nvidia: API response has no assistant content");
      throw new AiProviderError("NVIDIA returned an empty response", 200, this.name, "EMPTY_RESPONSE");
    }

    const usage = payload.usage as { prompt_tokens?: unknown; completion_tokens?: unknown } | undefined;
    return {
      provider: this.name,
      model,
      content,
      payload,
      usage: {
        promptTokens: typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
        completionTokens: typeof usage?.completion_tokens === "number" ? usage.completion_tokens : undefined,
      },
    };
  }

  /** embeddings عبر نقطة /v1/embeddings — أساس مهام RAG لاحقًا. */
  async embed(input: { texts: string[]; model?: string }): Promise<{
    provider: "nvidia";
    model: string;
    vectors: number[][];
    usage?: AiTokenUsage;
  }> {
    const apiKey = nvidiaApiKey();
    if (!apiKey) {
      console.error("ai/nvidia-embed: NVIDIA_API_KEY غير معرف");
      throw new AiProviderError("NVIDIA is not configured", 503, this.name);
    }
    const texts = input.texts.map((text) => text.trim()).filter(Boolean);
    if (texts.length === 0) {
      throw new AiProviderError("NVIDIA embeddings need at least one non-empty text", 400, this.name);
    }
    const model = input.model ?? "nvidia/nemotron-3-embed-1b";

    let response: Response;
    try {
      response = await fetch(NVIDIA_EMBED_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: texts, model, encoding_format: "float" }),
        signal: AbortSignal.timeout(NVIDIA_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new AiProviderError("NVIDIA embeddings timed out", 504, this.name, "TIMEOUT");
      }
      throw new AiProviderError("NVIDIA embeddings request failed", 502, this.name, "NETWORK");
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("ai/nvidia-embed: API error", response.status, detail.slice(0, 500));
      throw new AiProviderError("NVIDIA embeddings failed", response.status, this.name);
    }

    const payload = (await response.json().catch(() => null)) as {
      data?: Array<{ embedding?: unknown; index?: number }>;
      usage?: { prompt_tokens?: unknown };
    } | null;

    const vectors = (payload?.data ?? [])
      .slice()
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((item) => item.embedding)
      .filter((embedding): embedding is number[] => Array.isArray(embedding) && embedding.length > 0);

    if (vectors.length !== texts.length) {
      throw new AiProviderError("NVIDIA returned an empty/mismatched embeddings response", 200, this.name, "EMPTY_RESPONSE");
    }

    const promptTokens = payload?.usage?.prompt_tokens;
    return {
      provider: this.name,
      model,
      vectors,
      usage: typeof promptTokens === "number" ? { promptTokens } : undefined,
    };
  }
}
