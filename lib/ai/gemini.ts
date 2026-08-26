import { ApiError, GoogleGenAI } from "@google/genai";
import { GEMINI_MODELS } from "../ai-config";
import type { AiChatMessage, AiChatRequest, AiChatResponse, AiImageGenerationRequest, AiImageGenerationResponse, AiImageProvider, AiMediaAnalysisRequest, AiMediaProvider, AiTokenUsage } from "./types";
import { AiProviderError } from "./types";

function toGeminiContents(messages: AiChatMessage[]) {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
}

function toUsage(response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } }): AiTokenUsage | undefined {
  const meta = response.usageMetadata;
  if (!meta?.promptTokenCount && !meta?.candidatesTokenCount) return undefined;
  return {
    promptTokens: meta.promptTokenCount,
    completionTokens: (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0) || undefined,
  };
}

/**
 * Server-side adapter for the current Google Gen AI SDK. It deliberately
 * exposes only the provider-neutral text contract; file/image payloads and
 * image generation are introduced with their dedicated flows in later phases.
 */
export class GeminiProvider implements AiMediaProvider, AiImageProvider {
  readonly name = "gemini" as const;

  async completeChat(input: AiChatRequest): Promise<AiChatResponse> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      console.error("ai/gemini: GEMINI_API_KEY غير معرف");
      throw new AiProviderError("Gemini is not configured", 503, this.name);
    }

    const systemInstruction = input.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n")
      .trim();
    const contents = toGeminiContents(input.messages);
    if (contents.length === 0) {
      throw new AiProviderError("Gemini needs a user message", 400, this.name);
    }

    const model = input.model ?? GEMINI_MODELS.analysis;
    try {
      const client = new GoogleGenAI({ apiKey });
      const response = await client.models.generateContent({
        model,
        contents,
        config: {
          ...(systemInstruction ? { systemInstruction } : {}),
          temperature: input.temperature ?? 0.3,
        },
      });
      const content = response.text?.trim();
      if (!content) {
        console.error("ai/gemini: API response has no text content");
        throw new AiProviderError("Gemini returned an empty response", 502, this.name);
      }

      // The public chat API currently expects OpenAI-compatible `choices`.
      // This compatibility envelope is only returned by routes that opt in.
      return {
        provider: this.name,
        model: response.modelVersion ?? model,
        content,
        payload: { choices: [{ message: { content } }] },
        usage: toUsage(response),
      };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      const status = error instanceof ApiError ? error.status : 502;
      console.error("ai/gemini: API error", status, error);
      throw new AiProviderError("Gemini request failed", status, this.name);
    }
  }

  async analyzeMedia(input: AiMediaAnalysisRequest): Promise<AiChatResponse> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new AiProviderError("Gemini is not configured", 503, this.name);
    try {
      const response = await new GoogleGenAI({ apiKey }).models.generateContent({
        model: GEMINI_MODELS.analysis,
        contents: [{ role: "user", parts: [{ inlineData: { data: input.data, mimeType: input.mimeType } }, { text: input.prompt }] }],
        config: { temperature: 0.2 },
      });
      const content = response.text?.trim();
      if (!content) throw new AiProviderError("Gemini returned an empty response", 502, this.name);
      return { provider: this.name, model: response.modelVersion ?? GEMINI_MODELS.analysis, content, payload: { choices: [{ message: { content } }] }, usage: toUsage(response) };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError("Gemini media request failed", error instanceof ApiError ? error.status : 502, this.name);
    }
  }

  /**
   * Task 3B: نفس محرك توليد الصور الحقيقي الحالي تحت العقد الموحّد الجديد —
   * مش مزوّد جديد ولا سلوك جديد، بس غلاف متوافق مع Media Router.
   */
  async generateMedia(input: import("./types").AiMediaGenerationRequest & { model?: string }): Promise<import("./types").AiMediaResult> {
    if (input.imageInput) {
      // تعديل صورة بموديل الصورة الحالي غير مدعوم فعليًا — بنقولها بصراحة.
      throw new AiProviderError("Gemini image model does not support image editing", 400, this.name);
    }
    const generated = await this.generateImage({ prompt: input.prompt });
    return {
      type: "image",
      provider: generated.provider,
      model: generated.model,
      base64: generated.data,
      mimeType: generated.mimeType,
    };
  }

  async generateImage(input: AiImageGenerationRequest): Promise<AiImageGenerationResponse> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new AiProviderError("Gemini is not configured", 503, this.name);
    const prompt = input.prompt.trim();
    if (prompt.length < 3) throw new AiProviderError("Image prompt is too short", 400, this.name);

    try {
      const response = await new GoogleGenAI({ apiKey }).models.generateContent({
        model: GEMINI_MODELS.image,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { responseModalities: ["IMAGE"] },
      });
      const part = response.candidates?.[0]?.content?.parts?.find((candidate) => candidate.inlineData?.data);
      const inline = part?.inlineData;
      if (!inline?.data) {
        console.error("ai/gemini: image model returned no image part");
        throw new AiProviderError("Gemini did not return an image", 502, this.name);
      }
      return { provider: this.name, model: response.modelVersion ?? GEMINI_MODELS.image, data: inline.data, mimeType: inline.mimeType || "image/png" };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError("Gemini image generation failed", error instanceof ApiError ? error.status : 502, this.name);
    }
  }
}
