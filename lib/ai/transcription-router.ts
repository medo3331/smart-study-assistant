/* ==========================================================================
   🎙️ موجه التفريغ — ElevenLabs أساسي، Groq بديل (بدون Gemini)
   ═════════════════════════════════════════════════════════════════════════

   المنطق:
   1. جرب ElevenLabs أولاً (المزوّد الأساسي).
   2. إذا فشل بخطأ قابل للإعادة (502/503/timeout/network)، جرب Groq Whisper.
   3. إذا فشل كلا المزوّدين، أرجع خطأ آخر محاولة (ElevenLabs) لتوضيح السبب.

   متغيرات البيئة المطلوبة (سيرفر فقط):
   - ELEVENLABS_API_KEY: أساسي (مطلوب دائمًا)
   - GROQ_API_KEY: بديل (اختياري — لو مفقود، لا يُجرّب Groq)

   ⚠️ سيرفر فقط — مفيش استيراد من كومبوننت كلاينت.
   ⚠️ لا يُطبع أي مفتاح سري في اللوجز ولا يُرجع في أي رد.
   ═════════════════════════════════════════════════════════════════════════ */

import {
  TranscriptionError,
  type LectureTranscript,
} from "./transcription-shared";

import {
  transcribeLectureFromUrl as transcribeElevenLabsFromUrl,
  transcribeLecture as transcribeElevenLabsFile,
} from "./transcription";

/** نقطة النهاية الرسمية لتحويل الكلام إلى نص عبر Groq (OpenAI-compatible). */
const GROQ_STT_ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";

/** الموديل المستخدم في Groq Whisper. */
export const GROQ_MODEL_ID = "whisper-large-v3";

/** مهلة الطلب لـ Groq: 5 دقايق. */
const GROQ_TIMEOUT_MS = 5 * 60 * 1000;

/** أكواد الأخطاء اللي يستحق إعادة المحاولة عبر مزوّد بديل. */
const RETRYABLE_CODES = new Set([
  "PROVIDER_TIMEOUT",
  "NETWORK_ERROR",
  "SERVICE_NOT_CONFIGURED",
]);

/** يقرأ مفتاح Groq من البيئة (سيرفر فقط). */
function readGroqApiKey(): string | null {
  const key = process.env.GROQ_API_KEY?.trim();
  return key || null;
}

/** يُحدّد إن كان الخطأ يستحق إعادة المحاولة عبر مزوّد بديل. */
function isRetryable(error: unknown): boolean {
  if (error instanceof TranscriptionError) {
    return RETRYABLE_CODES.has(error.code);
  }
  return true;
}

/** يحوّل رد Groq إلى LectureTranscript موحّد. */
function normalizeGroqResponse(raw: unknown): LectureTranscript {
  const data = raw as {
    text?: string;
    duration?: number;
    language?: string;
  } | null;

  if (!data || typeof data.text !== "string") {
    throw new TranscriptionError(
      "PROVIDER_BAD_RESPONSE",
      "حصلت مشكلة أثناء تحويل المحاضرة. حاول مرة أخرى.",
      502,
    );
  }

  if (data.text.trim() === "") {
    throw new TranscriptionError(
      "EMPTY_TRANSCRIPT",
      "مفيش كلام اتفريغ من الملف ده. تأكد إن التسجيل فيه صوت واضح.",
      422,
    );
  }

  return {
    text: data.text,
    language: data.language ?? null,
    languageProbability: null,
    duration: typeof data.duration === "number" ? data.duration : null,
    segments: [],
    words: [],
    provider: "groq",
    model: GROQ_MODEL_ID,
  };
}

/** نداء Groq Whisper لملف مرفوع مباشرة (مرحلة 1). */
async function transcribeGroqFile(file: File): Promise<LectureTranscript> {
  const apiKey = readGroqApiKey();
  if (!apiKey) {
    throw new TranscriptionError(
      "SERVICE_NOT_CONFIGURED",
      "خدمة التحويل الاحتياطية غير مهيّأة. حاول مرة أخرى لاحقاً.",
      503,
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

  try {
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("model", GROQ_MODEL_ID);
    form.append("response_format", "json");

    const response = await fetch(GROQ_STT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
      signal: controller.signal,
    });

    const raw = await response.text();
    if (!response.ok) {
      console.error(
        `lecture-router: Groq رجّع ${response.status} — ${raw.slice(0, 300)}`,
      );
      if (response.status === 401 || response.status === 403) {
        throw new TranscriptionError(
          "PROVIDER_AUTH",
          "خدمة تحويل المحاضرات غير متاحة حالياً. حاول مرة أخرى لاحقاً.",
          503,
        );
      }
      throw new TranscriptionError(
        "PROVIDER_ERROR",
        "خدمة التحويل الاحتياطية تعرّضت لعطل. حاول مرة أخرى لاحقاً.",
        502,
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      console.error("lecture-router: رد Groq مش JSON صالح");
      throw new TranscriptionError(
        "PROVIDER_BAD_RESPONSE",
        "حصلت مشكلة أثناء تحويل المحاضرة. حاول مرة أخرى.",
        502,
      );
    }

    return normalizeGroqResponse(payload);
  } catch (error) {
    if (error instanceof TranscriptionError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new TranscriptionError(
        "PROVIDER_TIMEOUT",
        "التحويل أخد وقت أوي. جرّب تاني أو استخدم ملف أقصر.",
        502,
      );
    }
    throw new TranscriptionError(
      "NETWORK_ERROR",
      "فيها مشكلة في الاتصال بخدمة التحويل الاحتياطية. اتأكد من النت وحاول تاني.",
      502,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/** نداء Groq Whisper عبر رابط موقّع (مرحلة 2). */
async function transcribeGroqFromUrl(signedUrl: string): Promise<LectureTranscript> {
  const apiKey = readGroqApiKey();
  if (!apiKey) {
    throw new TranscriptionError(
      "SERVICE_NOT_CONFIGURED",
      "خدمة التحويل الاحتياطية غير مهيّأة. حاول مرة أخرى لاحقاً.",
      503,
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

  try {
    const form = new FormData();
    form.append("file", signedUrl);
    form.append("model", GROQ_MODEL_ID);
    form.append("response_format", "json");

    const response = await fetch(GROQ_STT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
      signal: controller.signal,
    });

    const raw = await response.text();
    if (!response.ok) {
      console.error(
        `lecture-router: Groq (url) رجّع ${response.status} — ${raw.slice(0, 300)}`,
      );
      throw new TranscriptionError(
        "PROVIDER_ERROR",
        "خدمة التحويل الاحتياطية تعرّضت لعطل. حاول مرة أخرى لاحقاً.",
        502,
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      console.error("lecture-router: رد Groq (url) مش JSON صالح");
      throw new TranscriptionError(
        "PROVIDER_BAD_RESPONSE",
        "حصلت مشكلة أثناء تحويل المحاضرة. حاول مرة أخرى.",
        502,
      );
    }

    return normalizeGroqResponse(payload);
  } catch (error) {
    if (error instanceof TranscriptionError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new TranscriptionError(
        "PROVIDER_TIMEOUT",
        "التحويل أخد وقت أوي. جرّب تاني أو استخدم ملف أقصر.",
        502,
      );
    }
    throw new TranscriptionError(
      "NETWORK_ERROR",
      "فيها مشكلة في الاتصال بخدمة التحويل الاحتياطية. اتأكد من النت وحاول تاني.",
      502,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * يحوّل ملف محاضرة إلى نص مع دعم Fallback بين مزوّدين.
 *
 * المسار: ElevenLabs أولاً → لو فشل بخطأ قابل للإعادة → جرب Groq.
 *
 * @param file الملف المرفوع (مرحلة 1 — direkten upload)
 * @param signedUrl رابط قراءة موقّع من Supabase Storage (مرحلة 2 — إن وجد)
 */
export async function transcribeLectureWithRouter(
  file: File,
  signedUrl?: string,
): Promise<LectureTranscript> {
  // ١) جرب ElevenLabs أولاً.
  let elevenLabsError: unknown = null;
  try {
    if (signedUrl) {
      return await transcribeElevenLabsFromUrl(signedUrl);
    }
    return await transcribeElevenLabsFile(file);
  } catch (error) {
    elevenLabsError = error;
    if (!isRetryable(error)) {
      // خطأ غير قابل للإعادة (مثل 401/403/422) — لا نكمل Groq.
      throw error;
    }
    console.warn(
      `lecture-router: ElevenLabs فشل، جاري التجربة الاحتياطية عبر Groq — ${
        error instanceof TranscriptionError ? error.code : String(error)
      }`,
    );
  }

  // ٢) جرب Groq كبديل.
  try {
    if (signedUrl) {
      return await transcribeGroqFromUrl(signedUrl);
    }
    return await transcribeGroqFile(file);
  } catch (groqError) {
    // ٣) كلا المزوّدين فشل — أرجع خطأ ElevenLabs الأصلي لتوضيح السبب الرئيسي.
    if (elevenLabsError instanceof TranscriptionError) {
      throw elevenLabsError;
    }
    throw groqError instanceof TranscriptionError
      ? groqError
      : new TranscriptionError(
          "INTERNAL_ERROR",
          "حصلت مشكلة أثناء تحويل المحاضرة. حاول مرة أخرى.",
          500,
        );
  }
}

/** إعادة تصدير أنواع مستخدمة من قبل الراوتر والواجهة. */
export type { LectureTranscript };
export { TranscriptionError };
