/**
 * lib/ai/provider-retry.ts — إعادة محاولة موحّدة لمزوّدات الـAI
 * ═══════════════════════════════════════════════════════════════════════
 * الغرض: كل مزوّد (Groq / OpenRouter) ياخد نفس سلوك الإعادة:
 *   - التباعد الأسي: 1s ⇒ 2s ⇒ 4s … (سقف 30s).
 *   - احترام هيدر `retry-after` (ثواني أو تاريخ HTTP) بدل الحساب اليدوي.
 *   - كل الأخطاء المؤقتة (429/500/502/503/504) قابلة لإعادة المحاولة،
 *     وأخطاء التهيئة (400/401/403) **مش** (تكرارها مش هيفيد).
 *
 * ⚠️ **ليه هنا مش في كل مزوّد**: السلوك لازم يكون واحد في كل Gambling —
 *    الاختلاف بين المزوّدات في إزاي بيرموا الخطأ، مش في سياسة الإعادة.
 */

/** أساس التباعد الافتراضي (ms) — 1 ثانية. */
export const PROVIDER_RETRY_BASE_MS = 1_000;

/** سقف الانتظار بين أي محاولتين (ms). */
export const PROVIDER_RETRY_MAX_MS = 30_000;

/** عدد المحاولات الكلي (المحاولة الأولى + الإعادات). */
export const PROVIDER_RETRY_MAX_ATTEMPTS = 3;

/**
 * الحالات المؤقتة اللي تستاهل إعادة محاولة.
 *
 * ⚠️ **500 مؤقتة**: مزوّداتской occasionally بترجع 500 بسبب ضغط momentي —
 *    إعادة المحاولة بتنقذ الطلب بدل ما نخسره.
 */
export function isRetryableProviderStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/** status من أي خطأ (من SDK بتاع المزوّد أو خطأ عادي). */
export function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
  if (typeof record.status === "number") return record.status;
  if (typeof record.statusCode === "number") return record.statusCode;
  if (record.response && typeof record.response.status === "number") return record.response.status;
  return undefined;
}

/** رسالة الخطأ (من أي شكل معروف). */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as { message?: unknown };
    if (typeof record.message === "string") return record.message;
  }
  return "unknown error";
}

/**
 * يقرأ هيدر `retry-after` — رقم ثواني أو تاريخ HTTP.
 *
 * ⚠️ **ليه مهم**: المزوّد بيقول us متى نرجع بالظبط ⇒ بنستخدم قيمته بدل
 *    الحساب اليدوي (بس محدودة بسقف 30 ثانية).
 */
export function parseRetryAfterMs(
  header: string | null | undefined,
  now: number = Date.now()
): number | null {
  if (typeof header !== "string") return null;
  const trimmed = header.trim();
  if (!trimmed) return null;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));

  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
}

/** مدة الانتظار قبل المحاولة رقم `attempt` (1 = بعد أول فشل). */
export function backoffDelayMs(
  attempt: number,
  retryAfterMs?: number | null,
  baseMs: number = PROVIDER_RETRY_BASE_MS,
  maxMs: number = PROVIDER_RETRY_MAX_MS
): number {
  if (typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs)) {
    return Math.min(Math.max(retryAfterMs, 0), maxMs);
  }
  const exponential = baseMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(exponential, maxMs);
}

export interface WithRetryOptions {
  /** عدد المحاولات الكلي (الأولى + الإعادات). */
  maxAttempts?: number;
  /** أساس التباعد (ms). */
  baseDelayMs?: number;
  /** سقف الانتظار (ms). */
  maxDelayMs?: number;
  /** دالة الانتظار (للاختبارات). */
  sleep?: (ms: number) => Promise<void>;
  /** هل الخطأ ده مؤقت ويستاهل إعادة محاولة؟ */
  isRetryable?: (error: unknown) => boolean;
  /** callback قبل كل إعادة محاولة (لوجز/قياس). */
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

/**
 * `withRetry` — يلفّ أي نداء مزوّد بإعادة محاولة وتباعد أسي.
 *
 * ⚠️ **fail-open**: أي خطأ مش مؤقت بيترمي فورًا (مافيش إعادة محاولة
 *    على 400/401/403 — تكرارها مش هيفيد).
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: WithRetryOptions = {}
): Promise<T> {
  const maxAttempts = Math.max(1, Math.trunc(options.maxAttempts ?? PROVIDER_RETRY_MAX_ATTEMPTS));
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? PROVIDER_RETRY_BASE_MS);
  const maxDelayMs = Math.max(0, options.maxDelayMs ?? PROVIDER_RETRY_MAX_MS);
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const isRetryable =
    options.isRetryable ??
    ((error: unknown) => {
      const status = errorStatus(error);
      return typeof status === "number" && isRetryableProviderStatus(status);
    });

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryable(error)) throw error;
      const retryAfterMs = (error as { retryAfterMs?: number | null } | null)?.retryAfterMs ?? null;
      const delayMs = backoffDelayMs(attempt, retryAfterMs, baseDelayMs, maxDelayMs);
      options.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
  throw lastError;
}

/* -------------------------------------------------------------------------- */
/* الواجهة القديمة (مستخدمة في كتل قديمة) — بتوجّه للمكتبة الموحّدة            */
/* -------------------------------------------------------------------------- */

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

/** الاسم القديم — سلوك IDENTICAL + احترام `retry-after`. */
export async function withProviderRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  return withRetry(async () => fn(), {
    maxAttempts: opts.maxAttempts,
    baseDelayMs: opts.baseDelayMs,
    maxDelayMs: opts.maxDelayMs,
  });
}
