import { GROQ_MODELS } from "../ai-config";
import type { AiChatPayload, AiChatRequest, AiChatResponse, AiMediaAnalysisRequest, AiMediaProvider, AiTextProvider } from "./types";
import { AiProviderError } from "./types";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

/** مهلة كل طلب Groq — بعدها بنعتبره TIMEOUT (504) فيسمح بالـ fallback للراوتر. */
export const GROQ_TIMEOUT_MS = 20_000;

/**
 * سقف المهلة لما الطلب يطلب مهلة أطول (توليد الامتحان مثلًا).
 *
 * ⚠️ **ليه 120 ثانية**: مهلة الـ function على Vercel (مع Fluid Compute)
 *    300 ثانية. مهلة طلب واحد أعلى من كده معناها إن الطلب كله اتقتل
 *    من غير فايدة ⇒ بنحدّه تحت السقف.
 */
export const GROQ_MAX_TIMEOUT_MS = 120_000;

/** المهلة الفعلية للطلب: طلب المُستدعي (اختياري) أو الافتراضية، محدودة بالسقف. */
export function resolveGroqTimeoutMs(requested?: number): number {
  if (typeof requested !== "number" || !Number.isFinite(requested)) return GROQ_TIMEOUT_MS;
  return Math.min(Math.max(Math.trunc(requested), 5_000), GROQ_MAX_TIMEOUT_MS);
}

/* ------------------------------------------------------------------ */
/* إعادة المحاولة مع التباعد الأسي (Exponential Backoff)              */
/* ------------------------------------------------------------------ */

/**
 * أساس التباعد بين المحاولات: 1 ثانية ⇒ 1s, 2s, 4s …
 *
 * ⚠️ **قابل للضبط من البيئة** (`GROQ_RETRY_BASE_MS`) عشان الاختبارات
 *    ما تستناش ثواني حقيقية، ولتشغيل Kia Boat إعدادات مختلفة من غير كود.
 */
export function groqRetryBaseMs(): number {
  const raw = Number(process.env.GROQ_RETRY_BASE_MS);
  return Number.isFinite(raw) && raw >= 0 ? Math.trunc(raw) : GROQ_RETRY_BASE_MS;
}

/** أساس التباعد الافتراضي (ms). */
export const GROQ_RETRY_BASE_MS = 1_000;

/** سقف الانتظار بين أي محاولتين: 30 ثانية. */
export const GROQ_RETRY_MAX_MS = 30_000;

/** عدد المحاولات الكلي (المحاولة الأولى + الإعادات). */
export const GROQ_MAX_ATTEMPTS = 3;

/**
 * خطأ HTTP من المزوّد مع `retry-after` لو المزوّد بعتّه.
 *
 * ⚠️ **ليه خطأ مخصوص**: `withRetry` محتاج يعرف (أ) إن الحالة مؤقتة
 *    و(ب) قد إيه الانتظار. `AiProviderError` مفيهوش مكان للهيدر.
 */
export class GroqHttpError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(status: number, message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = "GroqHttpError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * يقرأ هيدر `retry-after` — رقم ثواني أو تاريخ HTTP.
 *
 * ⚠️ **ليه مهم**: المزوّد بيقول us متى نرجع بالظبط. بنستخدم قيمته بدل
 *    الحساب اليدوي (زي ما طلب المواصفات) — بس بنحدّها بسقف 30 ثانية.
 */
export function parseRetryAfterMs(
  header: string | null | undefined,
  now: number = Date.now()
): number | null {
  if (typeof header !== "string") return null;
  const trimmed = header.trim();
  if (!trimmed) return null;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.round(seconds * 1000));
  }

  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
}

/**
 * مدة الانتظار قبل المحاولة رقم `attempt` (1 = بعد أول فشل).
 *
 * - لو فيه `retry-after` ⇒ بنستخدمه (محدود بالسقف).
 * - وإلا ⇒ تباعد أسي: base × 2^(attempt-1) محدود بالسقف (1s, 2s, 4s, … 30s).
 */
export function backoffDelayMs(
  attempt: number,
  retryAfterMs?: number | null,
  baseMs: number = GROQ_RETRY_BASE_MS,
  maxMs: number = GROQ_RETRY_MAX_MS
): number {
  if (typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs)) {
    return Math.min(Math.max(retryAfterMs, 0), maxMs);
  }
  const exponential = baseMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(exponential, maxMs);
}

/** الحالات المؤقتة اللي تستاهل إعادة محاولة: 429 (كوتة) + بوابات 5xx. */
export function isRetryableProviderStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export interface WithRetryOptions {
  /** عدد المحاولات الكلي (الأولى + الإعادات) — افتراضي 3. */
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
 * `withRetry` — يلفّ أي استدعاء API بإعادة محاولة وتباعد أسي.
 *
 * ⚠️ **الترتيب مهم**: إعادة المحاولة بتلفّ **نفس الطلب** اللي فيه
 *    تدوير المفاتيح — يعني: 429 على مفتاح ⇒ بنجرب المفتاح التاني **في نفس
 *    الطلب**؛ ولو كل المفاتيح اتعيطت ⇒ بنستنى (retry-after أو 1s/2s/4s)
 *    وبنعيد المحاولة من جديد.
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: WithRetryOptions = {}
): Promise<T> {
  const maxAttempts = Math.max(1, Math.trunc(options.maxAttempts ?? GROQ_MAX_ATTEMPTS));
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? groqRetryBaseMs());
  const maxDelayMs = Math.max(0, options.maxDelayMs ?? GROQ_RETRY_MAX_MS);
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const isRetryable =
    options.isRetryable ??
    ((error: unknown) => {
      const status = (error as { status?: unknown } | null)?.status;
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

/* ------------------------------------------------------------------ */
/* تدوير المفاتيح داخل العملية الواحدة                                 */
/* ------------------------------------------------------------------ */

/**
 * ترتيب المفاتيح: GROQ_API_KEY_1 → _2 → _3 → GROQ_API_KEY — نفس ترتيب
 * الراوتات القديمة (exam-plan / demo / generate-plan) عشان السلوك متطابق.
 * مفتاح بيعمل 429/401/403 بيتستبعد مؤقتًا من الدوران والمؤشر بيتحرك للتالي،
 * وأول نجاح بيثبّت المؤشر على المفتاح اللي نجح. الحالة في الذاكرة فقط.
 */
const KEY_BLOCK_MS = 30_000;

let cachedKeys: string[] = [];
let preferredIndex = 0;
const blockedUntil = new Map<string, number>();

function configuredKeys(): string[] {
  const raw = [
    process.env.GROQ_API_KEY_1,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY,
  ].map((key) => key?.trim() ?? "");
  // إزالة التكرار مع الحفاظ على الترتيب.
  return [...new Set(raw.filter(Boolean))];
}

/** يزامن الكاش مع البيئة الحالية — بيُستدعى من كل نقطة دخول قبل قراءة cachedKeys. */
function syncKeyCache(): string[] {
  const keys = configuredKeys();
  if (keys.length !== cachedKeys.length || keys.some((key, index) => key !== cachedKeys[index])) {
    cachedKeys = keys;
    preferredIndex = Math.min(preferredIndex, Math.max(0, keys.length - 1));
  }
  return keys;
}

/** المفاتيح مرتبة للتجربة: المفضّل الحالي أولًا، والمفتاح المبلوك مؤقتًا في الآخر. */
export function orderedGroqKeys(now = Date.now()): string[] {
  const keys = syncKeyCache();
  if (keys.length === 0) return [];
  const usable = keys.filter((key) => (blockedUntil.get(key) ?? 0) <= now);
  const list = usable.length > 0 ? usable : keys; // لو الكل مبلوك: جرّب برضه بالترتيب.
  const preferred = cachedKeys[Math.min(preferredIndex, cachedKeys.length - 1)];
  const start = Math.max(0, list.indexOf(preferred));
  return [...list.slice(start), ...list.slice(0, start)];
}

/** تسجيل نتيجة مفتاح: النجاح يثبّته، والرفض المؤقت (429) أو مفتاح مرفوض (401/403) يبلوكم. */
export function reportGroqKeyOutcome(key: string, outcome: { ok: true } | { ok: false; status: number }): void {
  if (outcome.ok) {
    syncKeyCache();
    const index = cachedKeys.indexOf(key);
    if (index >= 0) preferredIndex = index;
    blockedUntil.delete(key);
    return;
  }
  if (outcome.status === 429 || outcome.status === 401 || outcome.status === 403) {
    blockedUntil.set(key, Date.now() + KEY_BLOCK_MS);
  }
}

function isPayload(value: unknown): value is AiChatPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 429 على **كل** المفاتيح — خطأ `AiProviderError` (يعني الراوتر والراوت
 * بيعرفوا إنه 429) وبي carry قيمة `retry-after` عشان `withRetry` يستنى
 * قد إيه بالظبط.
 */
export class GroqRateLimitedError extends AiProviderError {
  readonly retryAfterMs: number | null;

  constructor(retryAfterMs: number | null) {
    super("Groq rate limited on all keys", 429, "groq", "RATE_LIMIT");
    this.name = "GroqRateLimitedError";
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * هل الخطأ ده يستاهل إعادة محاولة (مع تباعد)؟
 *
 * ⚠️ **المهلة (TIMEOUT) مش قابلة لإعادة محاولة**: مهلة توليد الامتحان
 *    60 ثانية، وتلات محاولات = 180 ثانية بيزوّدوا على ميزانية الراوت
 *    (300 ثانية) من غير فايدة ⇒ بنسلّمها للراوتر (fallback لمزوّد تاني).
 */
function isRetryableGroqError(error: unknown): boolean {
  if (error instanceof AiProviderError && error.reasonCode === "TIMEOUT") return false;
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && isRetryableProviderStatus(status);
}

/** Groq's OpenAI-compatible API adapter. This module is server-only by use. */
export class GroqProvider implements AiTextProvider, AiMediaProvider {
  readonly name = "groq" as const;

  async completeChat(input: AiChatRequest): Promise<AiChatResponse> {
    const model = input.model ?? GROQ_MODELS.advanced;
    // ⏱️ مهلة الطلب: الافتراضية (20s) إلا لو الطلب طلب أطول (توليد امتحان).
    const timeoutMs = resolveGroqTimeoutMs(input.timeoutMs);

    // 🔁 إعادة المحاولة بتلفّ **نفس الطلب** اللي فيه تدوير المفاتيح:
    //    429 على مفتاح ⇒ جرب المفتاح اللي بعده (نفس الطلب)؛ ولو كلهم
    //    اتعيطوا ⇒ استنى (retry-after أو 1s/2s/4s) وارجع تاني.
    return withRetry(
      async (attempt) => this.callGroqWithKeys({ input, model, timeoutMs, attempt }),
      {
        isRetryable: (error) => isRetryableGroqError(error),
        onRetry: ({ attempt: nextAttempt, delayMs, error }) => {
          console.warn("[ai/groq] retrying after transient failure", {
            attempt: nextAttempt,
            delayMs,
            status: (error as { status?: number }).status,
          });
        },
      }
    );
  }

  /**
   * محاولة واحدة بالمفاتيح المتاحة — **تدوير جوه نفس الطلب**.
   *
   * ⚠️ **الترتيب**: 429/401/403 ⇒ المفتاح ده مش هينفع (تكرار الطلب
   *    بالمفتاح نفسه مش هيفيد) ⇒ بنكمّل للمفتاح اللي بعده فورًا. ولو كل
   *    المفاتيح اتعيطت ⇒ بنرمي خطأ 429 **قابل لإعادة المحاولة** ونتكفّل
   *    بـ`withRetry` بالتباعد الأسي.
   */
  private async callGroqWithKeys(args: {
    input: AiChatRequest;
    model: string;
    timeoutMs: number;
    attempt: number;
  }): Promise<AiChatResponse> {
    const { input, model, timeoutMs } = args;
    const keys = orderedGroqKeys();
    if (keys.length === 0) {
      console.error("ai/groq: لا يوجد أي GROQ_API_KEY معرف");
      throw new AiProviderError("Groq is not configured", 503, this.name);
    }

    let sawRateLimit = false;
    let retryAfterMs: number | null = null;

    for (const apiKey of keys) {
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
            // ⚠️ السقف اختياري — من غيره الموديلات اللي betعمل استدلال
            //    (gpt-oss) بتصرف كل الميزانية على التفكير وتطلع فاضية.
            ...(input.maxTokens !== undefined ? { max_tokens: input.maxTokens } : {}),
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        // انتهاء المهلة خطأ شبكة عامًا — تبديل المفتاح مش هيعيد الأنترنت، فبنرمي فورًا.
        if (error instanceof Error && error.name === "TimeoutError") {
          console.error("ai/groq: request timed out");
          throw new AiProviderError("Groq request timed out", 504, this.name);
        }
        console.error("ai/groq: request failed", error);
        throw new AiProviderError("Groq request failed", 502, this.name);
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.error("ai/groq: API error", response.status, detail.slice(0, 500));
        reportGroqKeyOutcome(apiKey, { ok: false, status: response.status });
        if (response.status === 429) {
          // 🔄 كوتة: بنسجّل `retry-after` وبنكمّل للمفتاح اللي بعده فورًا.
          sawRateLimit = true;
          retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after")) ?? retryAfterMs;
          continue;
        }
        if (response.status === 401 || response.status === 403) {
          continue; // المفتاح مرفوض — جرب المفتاح التالي (بدون انتظار).
        }
        throw new AiProviderError("Groq returned an error", response.status, this.name);
      }

      reportGroqKeyOutcome(apiKey, { ok: true });

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

    // كل المفاتيح رفضت — 429 لو الكوتة خلصت، وإلا 401/403 (تهيئة).
    if (sawRateLimit) {
      // ⚠️ الخطأ ده **قابل لإعادة المحاولة** ⇒ `withRetry` يستنى ويجرب تاني.
      throw new GroqRateLimitedError(retryAfterMs);
    }
    throw new AiProviderError("Groq rejected all configured keys", 401, this.name);
  }

  async analyzeMedia(input: AiMediaAnalysisRequest): Promise<AiChatResponse> {
    const keys = orderedGroqKeys();
    if (keys.length === 0) {
      throw new AiProviderError("Groq is not configured", 503, this.name);
    }
    const model = "llama-3.2-11b-vision-preview";
    const dataUrl = `data:${input.mimeType};base64,${input.data}`;
    const messages = [
      { role: "user" as const, content: [
        { type: "text" as const, text: input.prompt },
        { type: "image_url" as const, image_url: { url: dataUrl } },
      ] },
    ];
    let sawRateLimit = false;
    for (const apiKey of keys) {
      let response: Response;
      try {
        response = await fetch(GROQ_CHAT_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 1024 }),
          signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
        });
      } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") {
          throw new AiProviderError("Groq request timed out", 504, this.name);
        }
        throw new AiProviderError("Groq request failed", 502, this.name);
      }
      if (!response.ok) {
        reportGroqKeyOutcome(apiKey, { ok: false, status: response.status });
        if (response.status === 429 || response.status === 401 || response.status === 403) {
          sawRateLimit ||= response.status === 429;
          continue;
        }
        throw new AiProviderError("Groq returned an error", response.status, this.name);
      }
      reportGroqKeyOutcome(apiKey, { ok: true });
      const payload = await response.json().catch(() => null);
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new AiProviderError("Groq returned an empty response", 502, this.name);
      }
      return { provider: this.name, model, content, payload, usage: { promptTokens: payload?.usage?.prompt_tokens, completionTokens: payload?.usage?.completion_tokens } };
    }
    throw new AiProviderError(sawRateLimit ? "Groq rate limited on all keys" : "Groq rejected all configured keys", sawRateLimit ? 429 : 401, this.name);
  }
}
