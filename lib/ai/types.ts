/**
 * The stable contract between product features (and future agents) and AI
 * providers.  Provider SDKs and their response formats must not leak past
 * this boundary.
 */
export type AiProviderName = "groq" | "gemini";

export type AiTaskType =
  | "chat"
  | "content"
  | "marketing_copy"
  | "coding"
  | "file_analysis"
  | "image_analysis"
  | "data_analysis"
  | "planning"
  | "business_plan"
  | "marketing_plan"
  | "roadmap"
  | "image_generation";

export type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiChatRequest = {
  messages: AiChatMessage[];
  model?: string;
  temperature?: number;
};

/** The part of an OpenAI-compatible response used by the current chat UI. */
export type AiChatPayload = Record<string, unknown> & {
  choices?: Array<{ message?: { content?: unknown } }>;
};

/** Token counts when the provider reports them; feeding future credits. */
export type AiTokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
};

export type AiChatResponse = {
  provider: AiProviderName;
  model: string;
  content: string;
  /** Kept temporarily so existing API clients retain their response shape. */
  payload: AiChatPayload;
  usage?: AiTokenUsage;
};

export type AiMediaAnalysisRequest = { data: string; mimeType: string; prompt: string };

export type AiImageGenerationRequest = { prompt: string };

export type AiImageGenerationResponse = {
  provider: AiProviderName;
  model: string;
  /** Base64-encoded image bytes without the data-URL prefix. */
  data: string;
  mimeType: string;
};

export interface AiTextProvider {
  readonly name: AiProviderName;
  completeChat(input: AiChatRequest): Promise<AiChatResponse>;
}

export interface AiMediaProvider extends AiTextProvider {
  analyzeMedia(input: AiMediaAnalysisRequest): Promise<AiChatResponse>;
}

/** Only providers whose models actually generate images implement this. */
export interface AiImageProvider {
  readonly name: AiProviderName;
  generateImage(input: AiImageGenerationRequest): Promise<AiImageGenerationResponse>;
}

/**
 * Expected provider failures carry only a safe status for the route layer.
 * Provider response bodies are deliberately logged on the server only.
 */
export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly provider: AiProviderName
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}
