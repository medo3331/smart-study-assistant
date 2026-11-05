/**
 * Magicly — Standardized Error Taxonomy
 *
 * Stable error codes used across the unified AI chat. Maps internal
 * exceptions to safe, user-facing Arabic messages.
 */

export type MagicErrorCode =
  | "ATTACHMENT_MISMATCH"
  | "UNSUPPORTED_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "PDF_PARSE_FAILED"
  | "PDF_NO_TEXT"
  | "OCR_NOT_CONFIGURED"
  | "OCR_TIMEOUT"
  | "OCR_UPSTREAM_FAILED"
  | "VISION_UNAVAILABLE"
  | "VISION_PROVIDER_FAILED"
  | "MODEL_UNAVAILABLE"
  | "RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "AI_PROVIDER_FAILED"
  | "REQUEST_VALIDATION_FAILED"
  | "AUTH_REQUIRED"
  | "UNKNOWN_INTERNAL_ERROR";

export interface MagicError {
  code: MagicErrorCode;
  userMessage: string;
  retryable: boolean;
  httpStatus: number;
}

export const ERROR_CATALOG: Record<MagicErrorCode, MagicError> = {
  ATTACHMENT_MISMATCH: {
    code: "ATTACHMENT_MISMATCH",
    userMessage: "لا يمكن إرسال ملف وصورة معاً. أرسل ملفاً أو صورة واحدة في المرة.",
    retryable: true,
    httpStatus: 400,
  },
  UNSUPPORTED_FILE_TYPE: {
    code: "UNSUPPORTED_FILE_TYPE",
    userMessage: "نوع الملف غير مدعوم. الأنواع المدعومة: PDF، DOCX، TXT، الصور.",
    retryable: true,
    httpStatus: 415,
  },
  FILE_TOO_LARGE: {
    code: "FILE_TOO_LARGE",
    userMessage: "الملف كبير جداً. الحد الأقصى 2MB.",
    retryable: true,
    httpStatus: 413,
  },
  PDF_PARSE_FAILED: {
    code: "PDF_PARSE_FAILED",
    userMessage: "مقدرتش أفتح ملف الـ PDF ده. لو محمي بباسورد شيل الحماية وجرّب تاني.",
    retryable: true,
    httpStatus: 422,
  },
  PDF_NO_TEXT: {
    code: "PDF_NO_TEXT",
    userMessage: "مفيش نص اتقرا من الملف ده.",
    retryable: true,
    httpStatus: 422,
  },
  OCR_NOT_CONFIGURED: {
    code: "OCR_NOT_CONFIGURED",
    userMessage: "تحليل الصور غير متاح حالياً. يرجى المحاولة لاحقاً.",
    retryable: false,
    httpStatus: 503,
  },
  OCR_TIMEOUT: {
    code: "OCR_TIMEOUT",
    userMessage: "انتهت مهلة تحليل الملف. جرّب ملفاً أصغر أو حاول لاحقاً.",
    retryable: true,
    httpStatus: 504,
  },
  OCR_UPSTREAM_FAILED: {
    code: "OCR_UPSTREAM_FAILED",
    userMessage: "تعذّر تحليل الملف. جرّب ملفاً آخر أو حاول لاحقاً.",
    retryable: true,
    httpStatus: 502,
  },
  VISION_UNAVAILABLE: {
    code: "VISION_UNAVAILABLE",
    userMessage: "فهم الصور غير متاح حالياً. يرجى المحاولة لاحقاً أو أرسل نصاً فقط.",
    retryable: false,
    httpStatus: 503,
  },
  VISION_PROVIDER_FAILED: {
    code: "VISION_PROVIDER_FAILED",
    userMessage: "فشل معالج الصور. يرجى المحاولة مرة أخرى.",
    retryable: true,
    httpStatus: 502,
  },
  MODEL_UNAVAILABLE: {
    code: "MODEL_UNAVAILABLE",
    userMessage: "النموذج المحدد غير متاح حالياً. جرّب نموذجاً آخر.",
    retryable: true,
    httpStatus: 404,
  },
  RATE_LIMITED: {
    code: "RATE_LIMITED",
    userMessage: "لقد تجاوزت الحد المسموح. يرجى الانتظار قليلاً.",
    retryable: true,
    httpStatus: 429,
  },
  PROVIDER_TIMEOUT: {
    code: "PROVIDER_TIMEOUT",
    userMessage: "انتهت مهلة الاتصال بالخدمة. جرّب مرة أخرى.",
    retryable: true,
    httpStatus: 504,
  },
  AI_PROVIDER_FAILED: {
    code: "AI_PROVIDER_FAILED",
    userMessage: "تعذّر الحصول على رد من الخدمة. جرّب مرة أخرى.",
    retryable: true,
    httpStatus: 502,
  },
  REQUEST_VALIDATION_FAILED: {
    code: "REQUEST_VALIDATION_FAILED",
    userMessage: "الطلب غير صحيح. تحقق من البيانات وأعد المحاولة.",
    retryable: true,
    httpStatus: 400,
  },
  AUTH_REQUIRED: {
    code: "AUTH_REQUIRED",
    userMessage: "يرجى تسجيل الدخول للمتابعة.",
    retryable: false,
    httpStatus: 401,
  },
  UNKNOWN_INTERNAL_ERROR: {
    code: "UNKNOWN_INTERNAL_ERROR",
    userMessage: "حدث عطل فني. يرجى المحاولة مرة أخرى أو إبلاغ الدعم.",
    retryable: true,
    httpStatus: 500,
  },
};

export function getErrorByCode(code: string): MagicError | undefined {
  return ERROR_CATALOG[code as MagicErrorCode];
}

export function isRetryable(code: string): boolean {
  return ERROR_CATALOG[code as MagicErrorCode]?.retryable ?? true;
}

export function getHttpStatus(code: string): number {
  return ERROR_CATALOG[code as MagicErrorCode]?.httpStatus ?? 500;
}

/**
 * Generate a unique incident ID (server-side only).
 * Format: ERR-XXXXXX (6 hex chars)
 */
export function generateIncidentId(): string {
  const bytes = new Uint8Array(3);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 3; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return "ERR-" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

import { sanitizeErrorMessage as sanitizeRuntime } from "@/lib/runtime-errors";

// Re-export the centralized sanitizer under the error-taxonomy name for backward
// compatibility. Returns "" on failure so callers can use it without null checks.
export function sanitizeErrorMessage(msg: string): string {
  try {
    return sanitizeRuntime(msg) ?? "";
  } catch {
    return "";
  }
}
