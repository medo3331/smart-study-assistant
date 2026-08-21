import { GROQ_MODELS } from "../ai-config";
import type { AiChatPayload, AiChatRequest, AiChatResponse, AiTextProvider } from "./types";
import { AiProviderError } from "./types";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

function isPayload(value: unknown): value is AiChatPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Groq's OpenAI-compatible API adapter. This module is server-only by use. */
export class GroqProvider implements AiTextProvider {
  readonly name = "groq" as const;

  async completeChat(input: AiChatRequest): Promise<AiChatResponse> {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
      console.error("ai/groq: GROQ_API_KEY غير معرف");
      throw new AiProviderError("Groq is not configured", 503, this.name);
    }

    const model = input.model ?? GROQ_MODELS.advanced;
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
        }),
      });
    } catch (error) {
      console.error("ai/groq: request failed", error);
      throw new AiProviderError("Groq request failed", 502, this.name);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("ai/groq: API error", response.status, detail.slice(0, 500));
      throw new AiProviderError("Groq returned an error", response.status, this.name);
    }

    const payload = await response.json().catch(() => null);
    if (!isPayload(payload)) {
      console.error("ai/groq: invalid API response");
      throw new AiProviderError("Groq returned an invalid response", 502, this.name);
    }

    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      console.error("ai/groq: API response has no assistant content");
      throw new AiProviderError("Groq returned an empty response", 502, this.name);
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
}
