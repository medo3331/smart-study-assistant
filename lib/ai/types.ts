/**
 * The stable contract between product features (and future agents) and AI
 * providers.  Provider SDKs and their response formats must not leak past
 * this boundary.
 */
export type AiProviderName = "groq" | "nvidia" | "openrouter" | "gemini";

export type AiTaskType =
  | "chat"
  | "explain"
  | "summarize"
  | "tutor"
  | "agent"
  | "quiz"
  | "flashcards"
  | "study_plan"
  | "lesson_analysis"
  | "mind_map"
  | "rag_embeddings"
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
  | "image_generation"
  | "image_edit"
  | "video_generation";

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
 * reasonCode يصنّف الفشل بدقة أكبر من HTTP status لوحده — الأهم منها
 * EMPTY_RESPONSE: استجابة 200 من غير أي محتوى مفيد بتتعامل كفشل كامل.
 */
export type AiFailureReasonCode =
  | "EMPTY_RESPONSE"
  | "TIMEOUT"
  | "HTTP_STATUS"
  | "NETWORK";

export class AiProviderError extends Error {
  readonly status: number;
  readonly provider: AiProviderName;
  readonly reasonCode?: AiFailureReasonCode;

  constructor(message: string, status: number, provider: AiProviderName, reasonCode: AiFailureReasonCode = "HTTP_STATUS") {
    super(message);
    this.name = "AiProviderError";
    this.status = status;
    this.provider = provider;
    this.reasonCode = reasonCode;
  }
}

/** مزوّد بيدعم الـ embeddings (أساس الـ RAG لاحقًا). */
export interface AiEmbeddingProvider {
  readonly name: AiProviderName;
  embed(input: { texts: string[]; model?: string }): Promise<{
    provider: AiProviderName;
    model: string;
    vectors: number[][];
    usage?: AiTokenUsage;
  }>;
}

/* ------------------------------------------------------------------ */
/* عقود الوسائط (Task 3B) — امتداد للتجريد الحالي مش معمورة منفصلة      */
/* ------------------------------------------------------------------ */

/** طلب توليد/تعديل صورة — البارامترات الاختيارية بتترجم حسب دعم المزوّد فعليًا. */
export type AiMediaGenerationRequest = {
  prompt: string;
  /** للتعديل: صورة الإدخال base64 بدون بادئة data:. */
  imageInput?: string;
  negativePrompt?: string;
  aspectRatio?: string;
  width?: number;
  height?: number;
  quality?: string;
  n?: number;
};

/** نتيجة وسائط موحّدة — URL أو base64، وممنوع نفترض إن المزوّد بيدي الاتنين. */
export type AiMediaResult = {
  type: "image";
  provider: AiProviderName;
  model: string;
  url?: string;
  base64?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
};

/** حالات مهمة الفيديو — التوليد غالبًا async jobs عند المزوّدين. */
export type AiVideoStatus = "queued" | "processing" | "completed" | "failed";

export type AiVideoRequest = {
  prompt: string;
  imageInput?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  resolution?: string;
};

export type AiVideoResult = {
  type: "video";
  status: AiVideoStatus;
  provider: AiProviderName;
  model: string;
  jobId?: string;
  url?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
};

/**
 * موديل/مزوّد بيعرف يولّد أو يعدّل صور. المزوّد اللي مبيعرفش ببساطة
 * ماينفذش الواجهة دي — والراوتر يتأكد من القدرة قبل الاستدعاء.
 */
export interface AiImageGenerationCapable {
  readonly name: AiProviderName;
  /** model اختياري — بيتحدد من Media Router من السجل المركزي. */
  generateMedia(input: AiMediaGenerationRequest & { model?: string }): Promise<AiMediaResult>;
}

/** مزوّد فيديو (sync أو async polling) — اختياري بالكامل. */
export interface AiVideoGenerationCapable {
  readonly name: AiProviderName;
  generateVideo(
    input: AiVideoRequest
  ): Promise<AiVideoResult> | AsyncGenerator<AiVideoResult, void, undefined>;
}
