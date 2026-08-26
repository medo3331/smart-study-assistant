import type { AiProviderName } from "./types";
import { AiProviderError } from "./types";
import { AiRouteError } from "./routing";

/**
 * تصنيف أخطاء AI الموحّد — الحدّ الفاصل بين السيرفر والكلاينت.
 *
 * القاعدة: الكلاينت بيشوف بس الكود + رسالة آمنة بالعربية + هل يستاهل يعيد،
 * وكل التفاصيل التقنية (أسماء المزوّدين الأصليين، أجسام الاستجابة، الستاك)
 * بتتسجل في لوجز السيرفر فقط من الراوت اللي امسك الخطأ.
 */
export type AiErrorCode =
  | "RATE_LIMIT"
  | "AUTH_ERROR"
  | "MODEL_UNAVAILABLE"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "INVALID_REQUEST"
  | "CONTENT_ERROR"
  | "CONFIGURATION_ERROR"
  | "MEDIA_MODEL_UNAVAILABLE"
  | "UNKNOWN";

/** الشكل الوحيد المسموح بيه خروجًا من سيرفر AI ناحية الواجهة. */
export type AiPublicError = {
  code: AiErrorCode;
  message: string;
  retryable: boolean;
};

/** رسائل المستخدم الآمنة — بدون أي تفاصيل تقنية أو أسماء مزوّدين. */
const USER_MESSAGES: Record<AiErrorCode, string> = {
  RATE_LIMIT: "الخدمة مشغولة حاليًا، جرّب مرة تانية بعد شوية.",
  AUTH_ERROR: "خدمة الذكاء الاصطناعي غير متاحة حاليًا. جرّب تاني لاحقًا.",
  MODEL_UNAVAILABLE: "الموديل المطلوب غير متاح دلوقتي. جرّب تاني بعد شوية.",
  TIMEOUT: "الطلب اتأخر أكتر من اللازم. جرّب تاني.",
  NETWORK_ERROR: "فيه مشكلة في الاتصال. اتأكد من النت وحاول تاني.",
  INVALID_REQUEST: "الطلب مش صالح — راجع البيانات المبعوتة وحاول تاني.",
  CONTENT_ERROR: "المساعد مقدرش يكمل الرد ده. جرّب تعيد صياغة السؤال.",
  CONFIGURATION_ERROR: "خدمة الذكاء الاصطناعي غير مُهيّأة حاليًا.",
  MEDIA_MODEL_UNAVAILABLE: "خدمة إنشاء الوسائط غير متاحة حاليًا.",
  UNKNOWN: "حصل خطأ غير متوقع. جرّب تاني بعد شوية.",
};

const RETRYABLE_CODES: ReadonlySet<AiErrorCode> = new Set([
  "RATE_LIMIT",
  "TIMEOUT",
  "NETWORK_ERROR",
  "MODEL_UNAVAILABLE",
  "CONTENT_ERROR",
]);

/** خطأ الراوتر: كل المرشحين فشلوا مع تسجيل محاولاتهم (بدون أي محتوى حساس). */
export class AiAllProvidersFailedError extends Error {
  readonly code: AiErrorCode;
  /** ملخص المحاولات — HTTP status فقط، آمن للوجز والقياس. */
  readonly attemptsSummary: Array<{ provider: AiProviderName | string; ok: boolean; reason?: string }>;

  constructor(
    task: string,
    attemptsSummary: Array<{ provider: AiProviderName | string; ok: boolean; reason?: string }>
  ) {
    super(`All AI candidates failed for task "${task}".`);
    this.name = "AiAllProvidersFailedError";
    this.code = classifyStatus(attemptsSummary.find((a) => !a.ok)?.reason ?? "");
    this.attemptsSummary = attemptsSummary;
  }
}

/** خطأ جاهز الكود — الراوتات ترميه مباشرة لما تعرف التصنيف بنفسها. */
export class AiCodedError extends Error {
  readonly code: AiErrorCode;
  constructor(code: AiErrorCode, detail?: string) {
    super(detail ?? USER_MESSAGES[code]);
    this.name = "AiCodedError";
    this.code = code;
  }
}

/**
 * أخطاء الوسائط (Task 3B): مفيش موديل مجاني متحقق منه → MEDIA_MODEL_UNAVAILABLE
 * برسالة عربية آمنة بدون أي تفاصيل مزوّدين.
 */
export class AiMediaUnavailableError extends Error {
  constructor() {
    super(USER_MESSAGES.MEDIA_MODEL_UNAVAILABLE);
    this.name = "AiMediaUnavailableError";
  }
}

function mediaAwarePublicError(error: unknown): AiPublicError | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "MediaModelUnavailableError"
  ) {
    return {
      code: "MEDIA_MODEL_UNAVAILABLE",
      message: USER_MESSAGES.MEDIA_MODEL_UNAVAILABLE,
      retryable: false,
    };
  }
  return undefined;
}

/**
 * تحويل أي خطأ (من الراوتر أو المزوّدين) إلى الشكل العام الآمن.
 * دي النقطة الوحيدة اللي الراوتات المفروض تستخدمها عند الفشل.
 */
export function toAiPublicError(error: unknown): AiPublicError {
  const mediaError = mediaAwarePublicError(error);
  if (mediaError) return mediaError;

  if (error instanceof AiRouteError) {
    // كل المرشحين فشلوا — نصنّف من أول محاولة فاشلة فعلية.
    const failed = error.reasons.find((attempt) => !attempt.ok);
    const code =
      failed?.reason === "EMPTY_RESPONSE"
        ? "CONTENT_ERROR"
        : classifyStatus(failed?.reason ?? "");
    return { code, message: USER_MESSAGES[code], retryable: RETRYABLE_CODES.has(code) };
  }

  if (error instanceof AiProviderError) {
    // reasonCode أدق من الـ status — خصوصًا EMPTY_RESPONSE (استجابة 200 فاضية)
    // وTIMEOUT (مهلة شبكية مش حالة HTTP).
    if (error.reasonCode === "EMPTY_RESPONSE") {
      return { code: "CONTENT_ERROR", message: USER_MESSAGES.CONTENT_ERROR, retryable: true };
    }
    return statusToPublicError(error.status);
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    (error as { code: string }).code in USER_MESSAGES
  ) {
    const code = (error as { code: AiErrorCode }).code;
    return { code, message: USER_MESSAGES[code], retryable: RETRYABLE_CODES.has(code) };
  }

  return { code: "UNKNOWN", message: USER_MESSAGES.UNKNOWN, retryable: false };
}

/** حالة HTTP قادمة من مزوّد → الخطأ العام المطابق لها. */
export function statusToPublicError(status: number): AiPublicError {
  const code = classifyStatusCode(status);
  return { code, message: USER_MESSAGES[code], retryable: RETRYABLE_CODES.has(code) };
}

function classifyStatus(reason: string): AiErrorCode {
  const match = reason.match(/HTTP\s+(\d{3})/i);
  if (match) return classifyStatusCode(Number(match[1]));
  return "UNKNOWN";
}

export function classifyStatusCode(status: number): AiErrorCode {
  if (status === 429 || status === 402) return "RATE_LIMIT";
  if (status === 401 || status === 403) return "AUTH_ERROR";
  if (status === 404) return "MODEL_UNAVAILABLE";
  if (status === 400 || status === 413 || status === 422) return "INVALID_REQUEST";
  if (status === 408 || status === 504) return "TIMEOUT";
  if (status === 503) return "CONFIGURATION_ERROR";
  if (status >= 500) return "NETWORK_ERROR";
  return "UNKNOWN";
}

/** هل الحالة دي تستحق تجربة مرشّح تاني في الـ fallback؟ (سياسة الراوتر نفسها). */
export function isFallbackEligibleStatus(status: number): boolean {
  return status !== 400 && status !== 413 && status !== 422;
}
