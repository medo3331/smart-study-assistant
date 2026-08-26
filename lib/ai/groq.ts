import { GROQ_MODELS } from "../ai-config";
import type { AiChatPayload, AiChatRequest, AiChatResponse, AiTextProvider } from "./types";
import { AiProviderError } from "./types";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

/** مهلة كل طلب Groq — بعدها بنعتبره TIMEOUT (504) فيسمح بالـ fallback للراوتر. */
export const GROQ_TIMEOUT_MS = 20_000;

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

/** Groq's OpenAI-compatible API adapter. This module is server-only by use. */
export class GroqProvider implements AiTextProvider {
  readonly name = "groq" as const;

  async completeChat(input: AiChatRequest): Promise<AiChatResponse> {
    const keys = orderedGroqKeys();
    if (keys.length === 0) {
      console.error("ai/groq: لا يوجد أي GROQ_API_KEY معرف");
      throw new AiProviderError("Groq is not configured", 503, this.name);
    }

    const model = input.model ?? GROQ_MODELS.advanced;
    let sawRateLimit = false;

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
          }),
          signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
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
        if (response.status === 429 || response.status === 401 || response.status === 403) {
          sawRateLimit ||= response.status === 429;
          continue; // مشكلة المفتاح ده تحديدًا — جرب المفتاح التالي.
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
    throw new AiProviderError(
      sawRateLimit ? "Groq rate limited on all keys" : "Groq rejected all configured keys",
      sawRateLimit ? 429 : 401,
      this.name
    );
  }
}
