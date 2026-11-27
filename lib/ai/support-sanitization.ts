// ============================================================================
// MAGICLY — Sanitization Helpers (Phase 1)
// ============================================================================
// مساعدة لاستيراد الدخول (student messages, logs, queries) إلى AI layer
// مع الحفاظ على سيادة الخصوصية.
//
// القواعد:
//   - لا تُسجّل كلمات سر، رموز تسجيل دخول، أو تفاصيل دفع.
//   - لا تُعاد هوية مستخدم آخر في السجل أو الرسائل الخصوصية.
//   - تسجيل الدخول يتطلب: معرف المستخدم (مدخلات) فقط، ملف تعريف
//     متوافق، و.assertRaises بهدف التحقق من مشاكل الدعم.
// ============================================================================

/**
 * تلميح آمن للمتغير (سير) للثلاثة أنواع التي لا نُسجلها:
 * - خادم بيانات مستخدم (مثلاً: رمز الدخول، الرمز السري، والملفات الشخصية)
 * - معرف المستخدم حرج
 * - رمز متاح (مثلاً: رمز تذكرة)
 */
export function redactSensitiveValue(
  value: unknown,
  fieldName: string
): string {
  const sensitiveFields = new Set([
    "password",
    "passwd",
    "secret",
    "token",
    "auth",
    "credit_card",
    "cvc",
    "cvv",
    "payment",
    "payment_secret",
    "api_key",
    "app_secret",
    "session",
    "cookie",
    "private_key",
    "private_key_pem",
  ]);

  const lower = fieldName.toLowerCase();

  if (sensitiveFields.has(lower)) {
    return `[REDACTED:${fieldName}]`;
  }

  if (typeof value === "string") {
    // لا تُسجّل références تحمل معرف ملفات شخصية (نمط mail@)
    if (value.includes("@") && value.length < 64) {
      return `[REDACTED:email-like-value]`;
    }
    // لا تُسجّل المعرفات المميزة الطويلة
    if (value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      return `[REDACTED:uuid-like-value]`;
    }
  }

  return value === undefined || value === null ? "[null]" : String(value);
}

/**
 * تنظيف كامل للمدخلات: سلسلة، كائن، أو مصفوفة.
 */
export function sanitizeInput(value: unknown): unknown {
  if (typeof value === "string") {
    // إزالة المحتوى الزائد
    const trimmed = value.trim();
    return trimmed.length > 2000 ? trimmed.slice(0, 2000) : trimmed;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeInput);
  }

  if (value !== null && typeof value === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      // تجاهل الحقول الحساسة مع إشعار
      if (/^password/i.test(key) || /secret/i.test(key) || /token/i.test(key)) {
        cleaned[key] = `[REDACTED:${key}]`;
      } else if (typeof val === "string" && val.length > 5000) {
        cleaned[key] = val.slice(0, 5000);
      } else {
        cleaned[key] = sanitizeInput(val);
      }
    }
    return cleaned;
  }

  return value;
}

/**
 * تسجيل آمن لخطأ (no credentials, no PII in log).
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // استخراج المعرف المميز إذا وجد، مع الحفاظ على نمط السجل
    const match = error.message.match(
      /([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/
    );
    if (match) {
      return `[TID:${match[1]}] ${error.message}`;
    }
    return error.message;
  }
  if (typeof error === "string") return error;
  return String(error);
}
