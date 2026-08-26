import type {
  AiChatPayload,
  AiChatRequest,
  AiChatResponse,
  AiMediaGenerationRequest,
  AiMediaResult,
  AiTextProvider,
} from "./types";
import { AiProviderError } from "./types";

/**
 * OpenRouter عبر واجهته المتوافقة مع OpenAI — مزوّد اختياري بالكامل.
 * غياب OPENROUTER_API_KEY = NOT_CONFIGURED والتطبيق شغّال عادي.
 *
 * القواعد:
 * - نفس نظام الأخطاء الحالي (AiProviderError) — ممنوع تصنيف موازي.
 * - استجابة 200 من غير محتوى = EMPTY_RESPONSE (فشل كامل).
 * - الرؤية (فهم الصور) بتتحدد من input_modalities للسجل، مش من اسم الموديل.
 * - توليد الصور بيمشي بس عبر موديلات image_generation المسجّلة والمتحقق
 *   منها كمجانية — مفيش موديل مجاني مؤكد دلوقتي فالقدرة دي شكلية هنا،
 *   والراوتر هو اللي بيقرر قبل الاستدعاء.
 */

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

/** مهلة كل طلب OpenRouter — بعدها TIMEOUT فيسمح بالـ fallback. */
export const OPENROUTER_TIMEOUT_MS = 30_000;

function isPayload(value: unknown): value is AiChatPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** مفتاح OpenRouter من البيئة — بدون قيمة افتراضية أو طباعة. */
export function openrouterApiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY?.trim() || undefined;
}

type ChatMessageInput = AiChatRequest["messages"][number];

/** يبني رسالة متوافقة مع OpenAI مع دعم الرؤية عند توفر صورة إدخال. */
export function buildVisionMessage(
  message: { role: string; content: string },
  imageData: string,
  mimeType: string
) {
  return {
    role: "user" as const,
    content: [
      { type: "text", text: message.content },
      {
        type: "image_url",
        image_url: { url: imageData.startsWith("data:") ? imageData : `data:${mimeType};base64,${imageData}` },
      },
    ],
  };
}

export class OpenRouterProvider implements AiTextProvider {
  readonly name = "openrouter" as const;

  async completeChat(input: AiChatRequest & { imageDataUrl?: string }): Promise<AiChatResponse> {
    const apiKey = openrouterApiKey();
    if (!apiKey) {
      console.error("ai/openrouter: OPENROUTER_API_KEY غير معرف");
      throw new AiProviderError("OpenRouter is not configured", 503, this.name);
    }

    // الرؤية: لو فيه صورة مبعوتة، آخر رسالة user تتحول لمحتوى multimodal.
    let messages: unknown[] = input.messages;
    const imageDataUrl = (input as { imageDataUrl?: string }).imageDataUrl;
    if (imageDataUrl) {
      const lastUserIndex = [...input.messages].reverse().findIndex((message) => message.role === "user");
      if (lastUserIndex !== -1) {
        const index = input.messages.length - 1 - lastUserIndex;
        const original = input.messages[index];
        messages = [
          ...input.messages.slice(0, index),
          buildVisionMessage(original, imageDataUrl.split(",")[1] ?? "", "image/jpeg"),
          ...input.messages.slice(index + 1),
        ];
        void mimeTypeOf(imageDataUrl);
      }
    }

    let response: Response;
    try {
      response = await fetch(OPENROUTER_CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          // رؤوس تعريف التطبيق — معلومات عامة، مش أسرار.
          "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000",
          "X-Title": "Magicly AI Core",
        },
        body: JSON.stringify({
          // الموديل بيتحدد من الراوتر من السجل المركزي؛ default احتياط فقط.
          model: input.model ?? "nvidia/nemotron-3.5-lightning:free",
          messages,
          temperature: input.temperature ?? 0.7,
        }),
        signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        console.error("ai/openrouter: request timed out");
        throw new AiProviderError("OpenRouter request timed out", 504, this.name, "TIMEOUT");
      }
      console.error("ai/openrouter: request failed", error);
      throw new AiProviderError("OpenRouter request failed", 502, this.name, "NETWORK");
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("ai/openrouter: API error", response.status, detail.slice(0, 500));
      throw new AiProviderError("OpenRouter returned an error", response.status, this.name);
    }

    const payload = await response.json().catch(() => null);
    if (!isPayload(payload)) {
      console.error("ai/openrouter: invalid API response");
      throw new AiProviderError("OpenRouter returned an invalid response", 502, this.name);
    }

    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      console.error("ai/openrouter: API response has no assistant content");
      throw new AiProviderError("OpenRouter returned an empty response", 200, this.name, "EMPTY_RESPONSE");
    }

    const usage = payload.usage as { prompt_tokens?: unknown; completion_tokens?: unknown } | undefined;
    return {
      provider: this.name,
      model: typeof payload.model === "string" ? payload.model : input.model ?? "unknown",
      content,
      payload,
      usage: {
        promptTokens: typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
        completionTokens: typeof usage?.completion_tokens === "number" ? usage.completion_tokens : undefined,
      },
    };
  }

  /**
   * توليد صور عبر chat-completions لموديلات output_modalities:image.
   * بترمي 501-style AiProviderError لما الموديل مايدعمش — لكن الوضع الطبيعي
   * إن الراوتر مايوصلش هنا أصلًا لعدم وجود موديل مجاني متحقق منه.
   */
  async generateMedia(input: AiMediaGenerationRequest): Promise<AiMediaResult> {
    const apiKey = openrouterApiKey();
    if (!apiKey) throw new AiProviderError("OpenRouter is not configured", 503, this.name);
    throw new AiProviderError(
      "No verified free OpenRouter image model is registered; media routing must not reach here.",
      501,
      this.name
    );
  }
}

function mimeTypeOf(dataUrl: string): string {
  const match = /^data:([^;,]+)/.exec(dataUrl);
  return match?.[1] ?? "image/jpeg";
}
