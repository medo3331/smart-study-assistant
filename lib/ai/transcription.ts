/* ==========================================================================
   🎙️ تفريغ المحاضرات — نداء ElevenLabs Speech-to-Text (Scribe v2)
   ═══════════════════════════════════════════════════════════════════════

   ⚠️ **سيرفر بس.** الملف ده بيقرأ `ELEVENLABS_API_KEY` من `process.env`
   وبيرسل الملف لـ `https://api.elevenlabs.io/v1/speech-to-text`.
   ممنوع أي استيراد له من كومبوننت كلاينت. العقد (الأنواع + حدود الملفات)
   اللي محتاجه الكلاينت في `lib/ai/transcription-shared.ts` — وده مفيهوش
   `process.env` ولا `fetch`.

   ⚠️ الأمن: المفتاح بيتقرأ جوّه دالة وقت الطلب (مش وقت تحميل الموديول)،
   ومش بتترجع في أي رد، ومش بتتطبع في اللوجز (بنطبع status ورسالة المزوّد
   بس). ممنوع أي `NEXT_PUBLIC_ELEVENLABS_API_KEY` نهائياً.

   ليه الملف منفصل عن الراوت: الراوت = حدود HTTP + رموز الحالة. وده =
   كلام المزوّد. تغيير طريقة النداء أو الموديل يبقى تعديل هنا بس، والواجهة
   مش بتتأثر خالص لأنها شايفة العقد المتطبّع مش رد الـ API.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  assertLectureFile,
  TranscriptionError,
  type LectureTranscript,
  type TranscriptWord,
} from "./transcription-shared";

/** نقطة النهاية الرسمية لتحويل الكلام إلى نص. */
const STT_ENDPOINT = "https://api.elevenlabs.io/v1/speech-to-text";

/** الموديل المستخدم — Scribe v2. */
export const SCRIBE_MODEL_ID = "scribe_v2";

/** إعادة تصدير العقد عشان الراوت ياخد كل حاجة من استيراد واحد. */
export { TranscriptionError, MAX_LECTURE_FILE_BYTES } from "./transcription-shared";
export type {
  LectureTranscript,
  TranscriptSegment,
  TranscriptWord,
} from "./transcription-shared";

/* ───────────────────────── نداء ElevenLabs ───────────────────────── */

/** مهلة الطلب: 5 دقايق. ملف محاضرة ساعة بياخد وقت، والحد الأقصى على
 *  Vercel Hobby 300 ثانية فمفيش فايدة من طلب أطول منه. */
const STT_TIMEOUT_MS = 5 * 60 * 1000;

/** فاصل المقطع بالثواني: أي سكتة أطول من ده (أو تغيّر متحدث) معناها مقطع
 *  جديد. 1.6 ثانية تقريباً متوسط الفاصل بين جمل الكلام الطبيعية. */
const SEGMENT_GAP_SECONDS = 1.6;

/** أقصى عدد مقاطع بنرجّعهم — حماية من رد ضخم (محاضرة 10 ساعات). */
const MAX_SEGMENTS = 600;

/** أقصى عدد كلمات بنحتفظ بيهم — النص الكامل بيفضل موجود في text. */
const MAX_WORDS = 20_000;

/** يقرأ المفتاح من البيئة. منفصل عن transcribe عشان مايتقراش
 *  process.env وقت تحميل الموديول. */
function readApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) {
    // نفس صياغة /api/demo لما GROQ_API_KEY مفقود، عشان أي حد بيراقب
    // اللوجز يعرف إن ده إعداد مفقود مش عطل عشوائي.
    console.error(
      "lecture-transcription: ELEVENLABS_API_KEY غير معرّف في البيئة — الخدمة هترجّع 503",
    );
    throw new TranscriptionError(
      "SERVICE_NOT_CONFIGURED",
      "خدمة تحويل المحاضرات غير متاحة حالياً. حاول مرة أخرى لاحقاً.",
      503,
    );
  }
  return key;
}

/** أي خطأ من ElevenLabs بيتحوّل لـ TranscriptionError برسالة عربية.
 *  ⚠️ بنسجّل status ورسالة المزوّد في اللوجز (مفيد للتشخيص) — بس مش
 *  المفتاح ولا جسم الطلب (الملف نفسه). */
function mapUpstreamError(status: number, upstreamBody: string): TranscriptionError {
  // آخر 300 حرف كفاية للتشخيص وبتخلّي اللوج محدود الحجم.
  const snippet = upstreamBody.slice(0, 300);
  console.error(`lecture-transcription: ElevenLabs رجّع ${status} — ${snippet}`);

  if (status === 401 || status === 403) {
    return new TranscriptionError(
      "PROVIDER_AUTH",
      "خدمة تحويل المحاضرات غير متاحة حالياً. حاول مرة أخرى لاحقاً.",
      502,
      `upstream ${status}`,
    );
  }
  if (status === 429) {
    return new TranscriptionError(
      "PROVIDER_RATE_LIMIT",
      "خدمة التحويل مشغولة دلوقتي. استنى شوية وحاول تاني.",
      503,
      `upstream ${status}`,
    );
  }
  if (status === 413) {
    return new TranscriptionError(
      "FILE_TOO_LARGE",
      "حجم الملف أكبر من الحد المسموح بيه.",
      413,
      `upstream ${status}`,
    );
  }
  if (status === 400 || status === 422) {
    return new TranscriptionError(
      "PROVIDER_REJECTED",
      "الملف ده مش قادر يتحوّل لنص. جرّب ملف تاني أو تأكد إن التسجيل سليم.",
      422,
      `upstream ${status}`,
    );
  }
  return new TranscriptionError(
    "PROVIDER_ERROR",
    "حصلت مشكلة أثناء تحويل المحاضرة. حاول مرة أخرى.",
    502,
    `upstream ${status}`,
  );
}

/** يحوّل كلمات ElevenLabs لمقاطع مقروءة: مقطع لكل متحدث/سكتة. */
function buildSegments(words: TranscriptWord[]) {
  const segments: Array<{
    text: string;
    start: number;
    end: number;
    speaker: string | null;
  }> = [];
  let current: (typeof segments)[number] | null = null;
  let lastEnd = 0;

  for (const word of words) {
    const isNewSpeaker =
      current !== null &&
      current.speaker !== null &&
      word.speaker !== null &&
      word.speaker !== current.speaker;
    const isLongPause = current !== null && word.start - lastEnd > SEGMENT_GAP_SECONDS;

    if (current === null || isNewSpeaker || isLongPause) {
      current = { text: "", start: word.start, end: word.end, speaker: word.speaker };
      segments.push(current);
    }

    // المسافة بتتحسب من حالة النص: لو الكلمة اتلحقت من غير فاصل، نضيف
    // مسافة وحدة. ده بيسيب النص العربي مقروء بدل ما تلزق الكلمات في بعض.
    const needsSpace = current.text !== "" && !/\s$/.test(current.text);
    current.text += `${needsSpace ? " " : ""}${word.text}`;
    current.end = Math.max(current.end, word.end);
    lastEnd = word.end;

    if (segments.length >= MAX_SEGMENTS) break;
  }

  return segments.map((segment) => ({
    ...segment,
    text: segment.text.replace(/\s+/g, " ").trim(),
  }));
}

/** يقرأ حقل من رد المزوّد بشكل آمن (من غير casts متسرّعة). */
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** شكل جزء من رد ElevenLabs — الحقول دي ممكن تتغيّر، فبنقراها دايمًا
 *  بحارس نوع مش بـ cast. */
type UpstreamWord = {
  text?: unknown;
  start?: unknown;
  end?: unknown;
  speaker_id?: unknown;
  speaker?: unknown;
};

type UpstreamResponse = {
  text?: unknown;
  language_code?: unknown;
  language_probability?: unknown;
  words?: unknown;
};

/** يطبّع رد ElevenLabs على LectureTranscript — نقطة الحقيقة الوحيدة. */
function normalizeUpstream(payload: UpstreamResponse): LectureTranscript {
  const words: TranscriptWord[] = Array.isArray(payload.words)
    ? (payload.words as UpstreamWord[]).slice(0, MAX_WORDS).map((word) => ({
        text: str(word.text) ?? "",
        start: num(word.start) ?? 0,
        end: num(word.end) ?? 0,
        // ElevenLabs بيرجّع speaker_id في الحالتين (single و multi channel)
        speaker: str(word.speaker_id) ?? str(word.speaker),
      }))
    : [];

  // النص: لو المزوّد رجّعه بنستخدمه زي ما هو (هو المصدر الأدق للترقيم
  // والعلامات). لو مش موجود، نركّبه من الكلمات كشبكة أمان.
  const upstreamText = str(payload.text);
  const text =
    upstreamText ?? words.map((word) => word.text).join("").replace(/\s+/g, " ").trim();

  const lastWordEnd = words.length > 0 ? words[words.length - 1].end : null;

  return {
    text,
    language: str(payload.language_code),
    languageProbability: num(payload.language_probability),
    duration: lastWordEnd !== null && lastWordEnd > 0 ? Math.round(lastWordEnd) : null,
    segments: buildSegments(words),
    words,
    model: SCRIBE_MODEL_ID,
    provider: "elevenlabs",
  };
}

/**
 * الطلب المشترك لـ ElevenLabs — بياخد مصدر الملف من الدالة اللي فوقاه.
 *
 * ⚠️ المفتاح هنا بس (`readApiKey`)، وكل حاجة تانية (التطبيع، ترجمة الأخطاء)
 * مشتركة بين المسارين — عشان الضمانة الحقيقية إن المرحلة 1 والمرحلة 2
 * بيرجّعوا **نفس** `LectureTranscript` بالظبط. أي اختلاف هنا معناه اختلاف
 * في اللي الواجهة بتعرضه.
 */
async function callElevenLabs(buildForm: (apiKey: string) => FormData): Promise<LectureTranscript> {
  const apiKey = readApiKey();
  // FormData بتولّد الـ boundary بنفسها — متحطّش Content-Type يدوي،
  // الـ boundary لازم يفضل زي ما Node كتبه بالظبط.
  const form = buildForm(apiKey);

  let response: Response;
  try {
    response = await fetch(STT_ENDPOINT, {
      method: "POST",
      headers: {
        // ⚠️ المفتاح من السيرفر بس. لا يتحوّل لـ NEXT_PUBLIC_ أبداً.
        "xi-api-key": apiKey,
        Accept: "application/json",
      },
      body: form,
      signal: AbortSignal.timeout(STT_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    console.error(
      `lecture-transcription: فشل الاتصال بـ ElevenLabs (${timedOut ? "timeout" : "network"})`,
    );
    throw new TranscriptionError(
      timedOut ? "PROVIDER_TIMEOUT" : "NETWORK_ERROR",
      timedOut
        ? "التحويل أخد وقت أوي. جرّب تاني أو استخدم ملف أقصر."
        : "فيها مشكلة في الاتصال بخدمة التحويل. اتأكد من النت وحاول تاني.",
      502,
      timedOut ? "timeout" : "network",
    );
  }

  const raw = await response.text();
  if (!response.ok) {
    throw mapUpstreamError(response.status, raw);
  }

  let payload: UpstreamResponse;
  try {
    payload = JSON.parse(raw) as UpstreamResponse;
  } catch {
    console.error("lecture-transcription: رد ElevenLabs مش JSON صالح");
    throw new TranscriptionError(
      "PROVIDER_BAD_RESPONSE",
      "حصلت مشكلة أثناء تحويل المحاضرة. حاول مرة أخرى.",
      502,
    );
  }

  const transcript = normalizeUpstream(payload);

  if (transcript.text.trim() === "") {
    throw new TranscriptionError(
      "EMPTY_TRANSCRIPT",
      "مفيش كلام اتفريغ من الملف ده. تأكد إن التسجيل فيه صوت واضح.",
      422,
    );
  }

  return transcript;
}

/** الحقول المشتركة في الطلب — نفس القيم في المسارين. */
function appendCommonFields(form: FormData): void {
  form.append("model_id", SCRIBE_MODEL_ID);
  // تسمية الأحداث الصوتية (ضحك، خطوات) بتبوّخ النص اللي الطالب عايز يذاكره
  // — فبنقفلها عن قصد. والتوقيتات على مستوى الكلمة هي اللي بتحوّل الرد
  // لمقاطع مقروءة.
  form.append("tag_audio_events", "false");
  form.append("timestamps_granularity", "word");
  // language_code مش مبعوت: ElevenLabs بيكتشف اللغة لوحده وده أفضل من
  // افتراض إن كل محاضراتنا عربية. لو حبيت فرض العربي، ضيف هنا
  // form.append("language_code", "ara").
}

/**
 * يحوّل ملف محاضرة إلى نص عبر ElevenLabs Scribe v2 — **رفع مباشر من
 * المتصفح** (المرحلة 1).
 *
 * ⚠️ المسار ده بيمرّ بجسم طلب الفانكشن، فمحدود بحوالي 4.5 ميجا على
 * Vercel. بيشتغل كـ fallback بس للمسارات الصغيرة (وللبيئات اللي
 * Supabase Storage مش مهيّأة فيها). للمسارات الكبيرة استخدم
 * `transcribeLectureFromUrl` من `/api/lecture-transcription/transcribe`.
 */
export async function transcribeLecture(file: File): Promise<LectureTranscript> {
  assertLectureFile(file);
  return callElevenLabs(() => {
    const form = new FormData();
    appendCommonFields(form);
    form.append("file", file, file.name);
    return form;
  });
}

/**
 * يحوّل ملف محاضرة إلى نص من **رابط موقّع** على تخزين — المرحلة 2.
 *
 * ⚠️ ليه ده مهم: ElevenLabs بيقبل `cloud_storage_url` كبديل للـ `file`
 * ("Exactly one of the file or cloud_storage_url"). لما نديه الرابط هو
 * **هو** بيسحب الملف من Supabase — يعني الملف مش بيلمس الفانكشن خالص
 * في الاتجاهين:
 *   - في الفانكشن: بعت بس form فيه رابط (حوالي 200 بايت).
 *   - من ElevenLabs: سحب مباشر من Supabase برابط موقّع.
 *
 * ده اللي بيشيل حد الـ 4.5 ميجا نهائياً، مش بيخفّيه.
 *
 * @param signedUrl رابط قراءة موقّع (مش public) من `createSignedReadUrl`
 */
export async function transcribeLectureFromUrl(
  signedUrl: string,
): Promise<LectureTranscript> {
  if (typeof signedUrl !== "string" || !signedUrl.startsWith("https://")) {
    throw new TranscriptionError(
      "INVALID_URL",
      "رابط الملف المرفوع غير صالح. حاول ترفع المحاضرة من جديد.",
      400,
    );
  }
  return callElevenLabs(() => {
    const form = new FormData();
    appendCommonFields(form);
    form.append("cloud_storage_url", signedUrl);
    return form;
  });
}
