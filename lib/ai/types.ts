import type { AiUsageContext } from "./usage-context";

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
  | "video_generation"
  /**
   * 🔥 **توليد الامتحانات** — مهمة مخصوصة (مش `chat`).
   *
   * ⚠️ **ليه مهمة مستقلة**: التوليد = نداءات **JSON طويلة متتابعة**
   *    (ملخص + أسئلة لكل قطعة). الموديلات الاستدلالية (gpt-oss-120b) بطيئة
   *    فيها ⇒ مهلة + توكنز محروقة + 502/503. فالتوليد له موديلاته
   *    السريعة (gpt-oss-20b ← Groq) والشرح له موديلاته القوية.
   */
  | "exam_generation";

export type AiChatMessageContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | AiChatMessageContentPart[];
};

export type AiChatRequest = {
  messages: AiChatMessage[];
  model?: string;
  temperature?: number;
  /**
   * 🔢 سقف توكنات المخرج (اختياري).
   *
   * ⚠️ **ليه مهم**: موديلات الاستدلال (reasoning) زي
   *    `openai/gpt-oss-120b` بتبني «تفكيرها» جوه ميزانية المخرج. من
   *    غير سقف صريح، المزوّد بيحط سقف افتراضي صغير فالموديل بيصرف
   *    كله على التفكير ويطلع `content` **فاضي** — وده اللي كان بيقتل
   *    مسار «الشرح المكثف» (رد JSON مبتقطع).
   *
   * ⚠️ **اختياري بالكامل**: المسارات اللي مش بتبعت السقف دي بتفضل
   *    بالسلوك القديم بالظبط (مفيش `max_tokens` في جسم الطلب).
   */
  maxTokens?: number;
  /**
   * ⏱️ مهلة الطلب الواحد بالـms — **اختياري بالكامل**.
   *
   * ⚠️ **ليه**: المسارات الطويلة (توليد امتحان: ملخص لكل قطعة ← دمج ←
   *    أسئلة لكل قطعة ← إصلاح) والمهلة الافتراضية (20–30 ثانية) كانت
   *    بتقطع النداء في النص ⇒ 504 ⇒ الـ router بيجرّب مزوّد تاني ⇒ وفي
   *    الآخر 503 «كل المزوّدات فشلوا». مع `maxDuration = 300` على الراوت
   *    يبقى عندنا مساحة فعلًا نحتاج مهلة أطول للنداء الواحد.
   *
   * ⚠️ **اختياري بالكامل**: المسارات التانية بتفضل بالسلوك القديم بالظبط.
   *    المزوّد بيقراه ويحدّه بسقف أقصى (120s) عشان ما نعديش سقف المنصة.
   */
  timeoutMs?: number;
  /**
   * 🧾 سياق الطلب المنطقي (Phase 5-C3) — **اختياري بالكامل**.
   *
   * ⚠️ **مش للمزوّد**: الـ adapters بيشوفوا `messages`/`model` بس،
   *   فالحقل ده بتجاهله من غير قصد ومالهوش أي تأثير على الطلب الخارج.
   *
   * 🧭 ليه هنا بالظبط: ده **أضيق تغيير ممكن** ينقل السياق من الـ route
   *   لحدّ `completeChatInner` — بيعدّي مع `AiChatRequest` الموجودة من
   *   غير ما نلمس signature واحد في `service.ts` ولا في أي feature.
   *
   * ⚠️ مافيش حدّ-request context بيتولّد هنا — لو غاب، المسجّل بيشتغل
   *   ومافيش تسجيل. بتولّده الـ routes عند حدّ الطلب الحقيقي بس.
   */
  usage?: AiUsageContext;
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
  | "NETWORK"
  /** كوتة المزوّد (429) — حالة مؤقتة قابلة لإعادة المحاولة. */
  | "RATE_LIMIT";

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

// ============================================================================
// AI SUPPORT (Phase 1) — أنواع نظام الدعم الذكي
// ============================================================================

/** الفئات الرئيسية لتصنيف مشكلات الدعم (مطابقة لمفاتيح SUPPORT_CATEGORIES). */
export type SupportCategory =
  | "account"
  | "subscriptions"
  | "credits"
  | "coins"
  | "lessons"
  | "aiTools"
  | "files"
  | "community"
  | "technical"
  | "complaints";

/** الفئات الفرعية المسطحة لكل فئات الدعم. */
export type SupportSubCategory =
  // account
  | "login"
  | "password"
  | "verification"
  | "profile"
  // subscriptions
  | "activation"
  | "expiration"
  | "statusMismatch"
  // credits
  | "missingPurchased"
  | "incorrectDeduction"
  | "aiOperationFailed"
  // coins
  | "lessonRewards"
  | "adRewards"
  | "storeTransactions"
  // lessons
  | "lessonAccess"
  | "videoProblems"
  | "quizProblems"
  | "contentLoading"
  // aiTools
  | "generationFailure"
  | "unexpectedErrors"
  | "usageIssues"
  // files
  | "uploadFailure"
  | "pdfProcessing"
  | "fileAccess"
  // community
  | "messageDelivery"
  | "messageRequests"
  | "blocking"
  | "conversationAccess"
  // technical
  | "performance"
  | "brokenPages"
  | "general"
  // complaints
  | "ux"
  | "featureRequests"
  | "generalComplaints";

/** نتيجة تصنيف مشكلة الدعم. */
export type SupportClassification = {
  category: SupportCategory;
  subcategory: SupportSubCategory;
  shortProblemSummary: string;
  /** ثقة التصنيف بين 0 و 1. */
  confidenceScore: number;
  severity: "low" | "medium" | "high";
  missingInformation: string[];
  recommendedNextStep: string;
  suggestedKnowledgeArticleIds: string[];
  requiresHuman: boolean;
  escalationReason: string;
};

/** سؤال تشخيصي منظّم يُعرض على الطالب. */
export type SupportDiagnosticQuestion = {
  key: string;
  label: string;
  question: string;
  options: string[];
  required: boolean;
};

/** ملخّص تصعيد الحالة لموظف دعم بشري. */
export type SupportEscalationSummary = {
  reason: string;
  summary: string;
  escalatedBy: string;
  escalatedAt: string;
};

/** نص قالب رد التأكيد الفوري. */
export type AcknowledgementTemplate = string;

/** حالة إرسال رد التأكيد (لمنع التكرار). */
export type AcknowledgementState = {
  eventId: string;
  lastSentAt: string;
  template?: string;
};

/** حالة تذكرة الدعم الذكية عبر خطوات المعالجة. */
export type SupportAiCaseStatus =
  | "received"
  | "acknowledged"
  | "classifying"
  | "diagnosing"
  | "awaiting_student"
  | "attempting_resolution"
  | "resolved_pending_confirmation"
  | "escalated"
  | "closed";

/** سجل حالة دعم ذكية. */
export type SupportAiCase = {
  id: string;
  eventSource: string;
  externalEventId: string;
  status: SupportAiCaseStatus;
  currentStep: string;
  aiRunId: string | null;
  humanEscalationSummary: string | null;
  aiVerificationResult: string | null;
  created_at: string;
  updated_at: string;
  createdBy: string;
  ai_suggested_at: string | null;
  human_answered_at: string | null;
  _relatedUserIds: string[];
  _eventPayload: Record<string, unknown>;
  _escalatedBy: string | null;
};

/** نوع استدعاء نموذج الذكاء الاصطناعي في مسار الدعم. */
export type SupportAiRunType =
  | "acknowledgement"
  | "classification"
  | "diagnosis"
  | "action_attempt"
  | "escalation";

/** حالة استدعاء النموذج. */
export type SupportAiRunStatus = "processing" | "completed" | "failed";

/** سجل استدعاء نموذج ذكاء اصطناعي ونتيجته. */
export type SupportAiRun = {
  id: string;
  caseId: string;
  runType: SupportAiRunType;
  modelName: string;
  provider: string | null;
  promptLengthTokens: number | null;
  responseLengthTokens: number | null;
  inputSnippet: string | null;
  outputSnippet: string | null;
  classificationJsonb: Record<string, unknown> | null;
  responseText: string | null;
  confidenceScore: number | null;
  isLowConfidence: boolean;
  status: SupportAiRunStatus;
  errorMessage: string | null;
  started_at: string;
  finished_at: string | null;
};

/** سجل منع معالجة حدث الدعم مرتين — المفتاح (eventSource, externalEventId). */
export type SupportEventDeduplicationEntry = {
  id: string;
  eventSource: string;
  externalEventId: string;
  eventKind: string;
  eventPayload: Record<string, unknown>;
  processed_at: string;
  processed_by: string;
  duplicate_count: number;
};

/** مقالة قاعدة معرفة الدعم. */
export type KnowledgeArticle = {
  id: string;
  slug: string;
  title: string;
  body: string;
  category: SupportCategory;
  subcategory: SupportSubCategory;
  problemDescription: string;
  symptoms: string[];
  searchKeywords: string[];
  diagnosticQuestions: SupportDiagnosticQuestion[];
  approvedSolution: string;
  resolutionSteps: string[];
  allowedActionKey: string | null;
  verificationSteps: string;
  escalationConditions: string;
  sourceType: "admin_provided" | "ai_suggestion";
  requiredStaffRole: string;
  status: "draft" | "published" | "archived";
  version: number;
  createdBy: string;
  reviewedBy: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  sourceNote: string;
  createdAt: string;
  updatedAt: string;
};

/** استعلام بحث قاعدة المعرفة. */
export type KnowledgeSearchQuery = {
  terms: string | string[];
  category?: SupportCategory;
  limit?: number;
};

/** نتيجة بحث قاعدة المعرفة. */
export type KnowledgeSearchResult = {
  results: KnowledgeArticle[];
  query: KnowledgeSearchQuery;
};

/** سكيما إدخال إجراء آمن (JSON Schema مبسّطة). */
export type SafeActionInputSchema = {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
};

/** طريقة التحقق من نجاح إجراء آمن. */
export type SafeActionResultVerification = {
  name: string;
  successCondition: string;
  onFailure: string;
};

/** إجراء آمن مسموح لمحرك الدعم (allowlist). */
export type SafeActionDefinition = {
  key: string;
  labelAr: string;
  descriptionAr: string;
  risk: "low" | "medium" | "high";
  requiresPermissions: string[];
  inputSchema: SafeActionInputSchema;
  verification: SafeActionResultVerification;
};
