import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODELS, GROQ_MODELS } from "../ai-config";
import { orderedGroqKeys, reportGroqKeyOutcome } from "./groq";
import { nvidiaApiKey, NVIDIA_TIMEOUT_MS } from "./nvidia";
import { openrouterApiKey, OPENROUTER_TIMEOUT_MS } from "./openrouter";
import type { AiChatMessage, AiChatRequest, AiProviderName, AiTokenUsage } from "./types";
import { AiProviderError } from "./types";

/** نقطة البث عند NVIDIA — نفس واجهة OpenAI-compatible مع stream:true. */
const NVIDIA_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

/** نقطة البث عند OpenRouter — نفس واجهة OpenAI-compatible مع stream:true. */
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * مهلة اتصال البث عند Groq. أطول من مهلة الطلب العادي لأن التوليد نفسه
 * بياخد وقت، لكنها موجودة عشان البث مايفضلش مفتوح للأبد لو المزوّد وقف.
 */
export const GROQ_STREAM_TIMEOUT_MS = 120_000;

/**
 * تجريف البتّ الموحّد: كل chunk إما دفعة نص أو نهاية البث مع الاستهلاك.
 * الوكلاء المستقبلية بتستهلك ده من غير ما تعرف المزوّد اللي وراه.
 */
export type AiStreamChunk =
  | { type: "text"; value: string }
  | { type: "end"; provider: AiProviderName; model: string; usage?: AiTokenUsage };

export interface AiStreamingProvider {
  readonly name: AiProviderName;
  /** بيرمي AiProviderError بنفس دلالات completeChat — الحالات والرسائل متطابقة. */
  streamChat(input: AiChatRequest): AsyncGenerator<AiStreamChunk, void, undefined>;
}

function requireKey(provider: AiProviderName, envVar: string): string {
  const apiKey = process.env[envVar]?.trim();
  if (!apiKey) {
    console.error(`ai/stream: ${envVar} غير معرف`);
    throw new AiProviderError(
      provider === "groq" ? "Groq is not configured" : "Gemini is not configured",
      503,
      provider
    );
  }
  return apiKey;
}

/* ------------------------------------------------------------------ */
/* Groq — OpenAI-compatible SSE                                        */
/* ------------------------------------------------------------------ */

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

/** يقرّأ SSE ويطلّع قيم data: سطرًا بسطر (من غير أي تبعية خارجية). */
async function* sseDataLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line.startsWith("data:")) yield line.slice(5).trim();
    }
  }
}

type GroqStreamChoice = { delta?: { content?: unknown } };
type GroqStreamPayload = {
  choices?: GroqStreamChoice[];
  model?: string;
  x_groq?: { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } };
};

/**
 * يفتح اتصال البث مع تدوير المفاتيح: 429/401/403 على مفتاح بينقلّب للتالي
 * تلقائيًا (بنفس منطق completeChat)، وأي حالة تانية بتترمي فورًا.
 */
async function fetchWithGroqKeyRotation(
  input: AiChatRequest,
  model: string,
  onKey: (key: string) => void
): Promise<Response> {
  const keys = orderedGroqKeys();
  let sawRateLimit = false;
  for (const apiKey of keys) {
    let response: Response;
    try {
      response = await fetch(GROQ_CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: input.messages,
          temperature: input.temperature ?? 0.7,
          stream: true,
        }),
        signal: AbortSignal.timeout(GROQ_STREAM_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new AiProviderError("Groq request timed out", 504, "groq");
      }
      // خطأ شبكة عام — تبديل المفتاح مش هيفيد، بنرمي زي completeChat بالظبط.
      throw error;
    }
    if (!response.ok && (response.status === 429 || response.status === 401 || response.status === 403)) {
      sawRateLimit ||= response.status === 429;
      reportGroqKeyOutcome(apiKey, { ok: false, status: response.status });
      await response.body?.cancel().catch(() => {});
      continue; // المفتاح ده مرفوض — جرب التالي.
    }
    onKey(apiKey);
    return response;
  }
  throw new AiProviderError(
    sawRateLimit ? "Groq rate limited on all keys" : "Groq rejected all configured keys",
    sawRateLimit ? 429 : 401,
    "groq"
  );
}

export class GroqStreamingAdapter implements AiStreamingProvider {
  readonly name = "groq" as const;

  async *streamChat(input: AiChatRequest): AsyncGenerator<AiStreamChunk, void, undefined> {
    const keys = orderedGroqKeys();
    if (keys.length === 0) {
      console.error("ai/groq-stream: لا يوجد أي GROQ_API_KEY معرف");
      throw new AiProviderError("Groq is not configured", 503, this.name);
    }
    const model = input.model ?? GROQ_MODELS.advanced;

    let response: Response;
    let usedKey = keys[0];
    try {
      response = await fetchWithGroqKeyRotation(input, model, (key) => (usedKey = key));
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      console.error("ai/groq-stream: request failed", error);
      throw new AiProviderError("Groq request failed", 502, this.name);
    }

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      console.error("ai/groq-stream: API error", response.status, detail.slice(0, 300));
      reportGroqKeyOutcome(usedKey, { ok: false, status: response.status });
      throw new AiProviderError("Groq returned an error", response.status, this.name);
    }

    let sawContent = false;
    let usage: AiTokenUsage | undefined;
    try {
      for await (const data of sseDataLines(response.body)) {
        if (data === "[DONE]") break;
        let payload: GroqStreamPayload;
        try {
          payload = JSON.parse(data) as GroqStreamPayload;
        } catch {
          continue; // سطر تالف من غير محتوى — نتجاهله بدل ما نكسر البث.
        }
        const delta = payload.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          sawContent = true;
          yield { type: "text", value: delta };
        }
        const reported = payload.x_groq?.usage;
        if (reported) {
          usage = {
            promptTokens: typeof reported.prompt_tokens === "number" ? reported.prompt_tokens : undefined,
            completionTokens: typeof reported.completion_tokens === "number" ? reported.completion_tokens : undefined,
          };
        }
      }
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      console.error("ai/groq-stream: stream interrupted", error);
      throw new AiProviderError("Groq stream failed", 502, this.name);
    }

    if (!sawContent) {
      console.error("ai/groq-stream: stream ended with no content");
      throw new AiProviderError("Groq returned an empty response", 502, this.name);
    }
    reportGroqKeyOutcome(usedKey, { ok: true });
    yield { type: "end", provider: this.name, model, usage };
  }
}

/* ------------------------------------------------------------------ */
/* Gemini — SDK streaming                                              */
/* ------------------------------------------------------------------ */

function toGeminiContents(messages: AiChatMessage[]) {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
}

export class GeminiStreamingAdapter implements AiStreamingProvider {
  readonly name = "gemini" as const;

  async *streamChat(input: AiChatRequest): AsyncGenerator<AiStreamChunk, void, undefined> {
    const apiKey = requireKey(this.name, "GEMINI_API_KEY");
    const model = input.model ?? GEMINI_MODELS.analysis;
    const contents = toGeminiContents(input.messages);
    if (contents.length === 0) {
      throw new AiProviderError("Gemini needs a user message", 400, this.name);
    }

    const systemInstruction = input.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n")
      .trim();

    let stream: Awaited<ReturnType<GoogleGenAI["models"]["generateContentStream"]>>;
    try {
      stream = await new GoogleGenAI({ apiKey }).models.generateContentStream({
        model,
        contents,
        config: {
          ...(systemInstruction ? { systemInstruction } : {}),
          temperature: input.temperature ?? 0.3,
        },
      });
    } catch (error) {
      console.error("ai/gemini-stream: request failed", error);
      throw new AiProviderError("Gemini request failed", 502, this.name);
    }

    let sawContent = false;
    let reportedModel = model;
    let usage: AiTokenUsage | undefined;
    try {
      for await (const chunk of stream) {
        const text = chunk.text;
        if (typeof text === "string" && text.length > 0) {
          sawContent = true;
          yield { type: "text", value: text };
        }
        const meta = chunk.usageMetadata;
        if (meta?.promptTokenCount || meta?.candidatesTokenCount) {
          usage = {
            promptTokens: meta.promptTokenCount,
            completionTokens: meta.candidatesTokenCount,
          };
        }
        if (chunk.modelVersion) reportedModel = chunk.modelVersion;
      }
    } catch (error) {
      console.error("ai/gemini-stream: stream interrupted", error);
      throw new AiProviderError("Gemini stream failed", 502, this.name);
    }

    if (!sawContent) {
      console.error("ai/gemini-stream: stream ended with no content");
      throw new AiProviderError("Gemini returned an empty response", 502, this.name);
    }
    yield { type: "end", provider: this.name, model: reportedModel, usage };
  }
}

/** محوّلات البث المعروفة — نفس مجموعة المزوّدات النصية الحالية. */
export function streamingAdapterFor(provider: AiProviderName): AiStreamingProvider | undefined {
  switch (provider) {
    case "groq":
      return new GroqStreamingAdapter();
    case "nvidia":
      return new NvidiaStreamingAdapter();
    case "openrouter":
      return new OpenRouterStreamingAdapter();
    case "gemini":
      return new GeminiStreamingAdapter();
    default:
      return undefined;
  }
}

/* ------------------------------------------------------------------ */
/* OpenRouter — OpenAI-compatible SSE                                  */
/* ------------------------------------------------------------------ */

export class OpenRouterStreamingAdapter implements AiStreamingProvider {
  readonly name = "openrouter" as const;

  async *streamChat(input: AiChatRequest): AsyncGenerator<AiStreamChunk, void, undefined> {
    const apiKey = openrouterApiKey();
    if (!apiKey) {
      console.error("ai/openrouter-stream: OPENROUTER_API_KEY غير معرف");
      throw new AiProviderError("OpenRouter is not configured", 503, this.name);
    }
    // الموديل بيتحدد من الراوتر من السجل المركزي — القيمة هنا احتياط فقط.
    const model = input.model ?? "nvidia/nemotron-3.5-lightning:free";

    let response: Response;
    try {
      response = await fetch(OPENROUTER_CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000",
          "X-Title": "Magicly AI Core",
        },
        body: JSON.stringify({
          model,
          messages: input.messages,
          temperature: input.temperature ?? 0.7,
          stream: true,
        }),
        signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new AiProviderError("OpenRouter request timed out", 504, this.name, "TIMEOUT");
      }
      console.error("ai/openrouter-stream: request failed", error);
      throw new AiProviderError("OpenRouter request failed", 502, this.name);
    }

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      console.error("ai/openrouter-stream: API error", response.status, detail.slice(0, 300));
      throw new AiProviderError("OpenRouter returned an error", response.status, this.name);
    }

    let sawContent = false;
    let usage: AiTokenUsage | undefined;
    try {
      for await (const data of sseDataLines(response.body)) {
        if (data === "[DONE]") break;
        let payload: GroqStreamPayload & { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } };
        try {
          payload = JSON.parse(data) as typeof payload;
        } catch {
          continue;
        }
        const delta = payload.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          sawContent = true;
          yield { type: "text", value: delta };
        }
        const reported = payload.usage ?? payload.x_groq?.usage;
        if (reported) {
          usage = {
            promptTokens: typeof reported.prompt_tokens === "number" ? reported.prompt_tokens : undefined,
            completionTokens: typeof reported.completion_tokens === "number" ? reported.completion_tokens : undefined,
          };
        }
      }
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      console.error("ai/openrouter-stream: stream interrupted", error);
      throw new AiProviderError("OpenRouter stream failed", 502, this.name);
    }

    if (!sawContent) {
      console.error("ai/openrouter-stream: stream ended with no content");
      throw new AiProviderError("OpenRouter returned an empty response", 200, this.name, "EMPTY_RESPONSE");
    }
    yield { type: "end", provider: this.name, model, usage };
  }
}

/* ------------------------------------------------------------------ */
/* NVIDIA — OpenAI-compatible SSE                                      */
/* ------------------------------------------------------------------ */

export class NvidiaStreamingAdapter implements AiStreamingProvider {
  readonly name = "nvidia" as const;

  async *streamChat(input: AiChatRequest): AsyncGenerator<AiStreamChunk, void, undefined> {
    const apiKey = nvidiaApiKey();
    if (!apiKey) {
      console.error("ai/nvidia-stream: NVIDIA_API_KEY غير معرف");
      throw new AiProviderError("NVIDIA is not configured", 503, this.name);
    }
    // الموديل بيتحدد من الراوتر من السجل المركزي — القيمة هنا احتياط فقط.
    const model = input.model ?? "nvidia/nemotron-3.5-lightning-30b-a3b";

    let response: Response;
    try {
      response = await fetch(NVIDIA_CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: input.messages,
          temperature: input.temperature ?? 0.7,
          stream: true,
        }),
        signal: AbortSignal.timeout(NVIDIA_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new AiProviderError("NVIDIA request timed out", 504, this.name, "TIMEOUT");
      }
      console.error("ai/nvidia-stream: request failed", error);
      throw new AiProviderError("NVIDIA request failed", 502, this.name);
    }

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      console.error("ai/nvidia-stream: API error", response.status, detail.slice(0, 300));
      throw new AiProviderError("NVIDIA returned an error", response.status, this.name);
    }

    let sawContent = false;
    let usage: AiTokenUsage | undefined;
    try {
      for await (const data of sseDataLines(response.body)) {
        if (data === "[DONE]") break;
        let payload: GroqStreamPayload;
        try {
          payload = JSON.parse(data) as GroqStreamPayload;
        } catch {
          continue; // سطر تالف من غير محتوى — نتجاهله بدل ما نكسر البث.
        }
        const delta = payload.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          sawContent = true;
          yield { type: "text", value: delta };
        }
        const reported = payload.x_groq?.usage ?? (payload as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } }).usage;
        if (reported) {
          usage = {
            promptTokens: typeof reported.prompt_tokens === "number" ? reported.prompt_tokens : undefined,
            completionTokens: typeof reported.completion_tokens === "number" ? reported.completion_tokens : undefined,
          };
        }
      }
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      console.error("ai/nvidia-stream: stream interrupted", error);
      throw new AiProviderError("NVIDIA stream failed", 502, this.name);
    }

    if (!sawContent) {
      // HTTP 200 بدون أي محتوى مُبث = فشل صريح (EMPTY_RESPONSE)، مش نجاح فاضي.
      console.error("ai/nvidia-stream: stream ended with no content");
      throw new AiProviderError("NVIDIA returned an empty response", 200, this.name, "EMPTY_RESPONSE");
    }
    yield { type: "end", provider: this.name, model, usage };
  }
}
