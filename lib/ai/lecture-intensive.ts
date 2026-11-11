/* ==========================================================================
   🧠 الشرح المكثف مع المراجع الزمنية — Phase 5
   ============================================================================

   **سيرفر بس.** الدخول من الراوت بس.

   ═══ ليه مسار مستقل ═══
   مسار الملخص/الشرح القديم (`lib/ai/lecture-analysis.ts`) بيبعت النص
   **مسطّح** — `transcript_text` — للموديل. النص المسطّح مالوش توقيتات،
   فالـ citations مستحيلة عليه. فالمسار ده بياخد **`transcript_data`**:
   المقاطع وكل واحد بتوقيته.

   ═══ سلسلة941 التحقق (٤ طبقات) ═══
   أي JSON جاي من موديل = بيانات غير موثوقة. فلازم نشوف إن المرجع
   ده **حقيقي** قبل ما نعرضه للطالب:

     ١) الشكل       — `expectObject`/`expectArray`/`expectString` + رفض أي
                      مفتاح مش متوقّع (`lib/ai/structured.ts`).
     ٢) وجود المقطع — `seg` لازم يكون رقم صحيح جوه مدى القطعة دي بالظبط.
                      تشيك set-membership: مش fuzzy، مش مفيش مجال للاختراع.
     ٣) أمانة المقطع — الاقتباس `quote` لازم يكون فعلاً من نص المقطع
                      المشار إليه. بُقارَن بعد التطبيع (نفس دالة تطبيع
                      العربية في `lecture-study.ts`).
     ٤) sanity الوقت — `start` لازم يكون جوه `[0, duration]`.

   طبقة ٣ هي اللي بتمنع «الموديل قعد في القطعة ٥ وقال كلام القطعة ٤٠».
   وطبقة ٢ هي اللي بتمنع «الموديل اخترع رقم». **التوقيت نفسه مش جاي
   من الموديل خالص** — إحنا بنقراه من `segments[seg].start`.

   ═══ ليه عزل القطع (per-chunk isolation) ═══
   مسار الشرح القديم رامي لو أي قطعة فشلت (مفيش partial — `lecture-analysis.ts:98`).
   هنا القرار مختلف: محاضرة ساعة فيها ٣ قطع، لو واحدة فشلت، الطالب
   يستفيد بالاتنين التانيين. فالتجزئة معزولة، والرد بيرجع `chunks.failed`
   والواجهة بتقوله «تمّ توليد ٢ من ٣ أجزاء».
   ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AiTaskInput } from "./tasks/types";
import {
  AiStructuredOutputError,
  expectArray,
  expectObject,
  expectString,
  rejectUnknownKeys,
} from "./structured";
import {
  buildIntensiveMessages,
  MAX_CLAIMS_PER_SECTION,
  MAX_CLAIM_CHARS,
  MAX_HEADING_CHARS,
  MAX_INTENSIVE_CHUNKS,
  MAX_QUOTE_CHARS,
  MAX_SECTIONS,
  type TimedSegment,
} from "./lecture-intensive-prompts";
/* ═══════════════════════════ الأنواع ═══════════════════════════ */

/** جملة واحدة في الشرح المكثف — ومعها مرجعها. */
export type IntensiveClaim = {
  /** نص الجملة المشرحة (من الموديل). */
  text: string;
  /**
   * فهرس المقطع في `transcript_data.segments` — **المرجع الأساسي**.
   * التوقيت بيتقرا منه عند العرض.
   *
   * ⚠️ `null` = المرجع **ما تقدرش يتحقَّق منه** (الموديل غلط في الرقم أو
   *    في الاقتباس). الجملة نفسها بتفضل — الطالب بيستفيد من الشرح، واللي
   *    ناقصه هو *الثقة* في المصدر. فالواجهة بتعرضها **من غير chip**.
   */
  seg: number | null;
  /**
   * ⚠️ نسخة (denormalized) من توقيت المقطع وقت التوليد.
   * عشان العرض يبقى صحيح حتى لو المقاطع اتغيّرت بعدين.
   */
  start: number | null;
};

/** قسم واحد في الشرح المكثف. */
export type IntensiveSection = {
  heading: string;
  claims: IntensiveClaim[];
};

/** الشكل المخزَّن في `lectures.intensive_explanation`. */
export type IntensiveExplanation = {
  version: 1;
  generated_at: string;
  model: string;
  chunks: { ok: number; failed: number };
  sections: IntensiveSection[];
};

/* ═══════════════════════════ الأخطاء ═══════════════════════════ */

/** خطأ معروف للراوت يترجمه لـ HTTP + رسالة عربية آمنة. */
export class IntensiveError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "IntensiveError";
    this.code = code;
    this.status = status;
  }
}

/* ═══════════════════════════ استخراج المقاطع ═══════════════════════════ */

/**
 * يقرأ المقاطع من `transcript_data` بترتيبها الزمني.
 *
 * ⚠️ **ليه بنقرأ `transcript_data` مش `transcript_text`**: النص المسطّح
 *    مالوش حدود مقاطع، فمفيش حاجة ن-highlight عليها. المقاطع هي
 *    الوحدة اللي فيها التوقيت.
 *
 * ⚠️ **ليه بنقبل الحقول الناقصة**: الـ segments الحقيقية شكلها
 *    `{ end, text, start, speaker }` — بس ملفات قديمة أو بيانات ناقصة
 *    ممكن تخلّي `end` أو `start` ناقصين. المقطع بنقصه وقت بيبقى بلا
 *    مرجع (مش بيتنسب لقطعة)، بس **مش** لازم يوقع المحاضرة كلها.
 */
export function extractSegments(transcriptData: unknown): TimedSegment[] {
  if (typeof transcriptData !== "object" || transcriptData === null) return [];
  const data = transcriptData as { segments?: unknown };
  if (!Array.isArray(data.segments)) return [];

  const segments: TimedSegment[] = [];
  for (const raw of data.segments) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw as { text?: unknown; start?: unknown; end?: unknown };
    if (typeof item.text !== "string") continue;
    const text = item.text.trim();
    if (text === "") continue;

    const start = typeof item.start === "number" && Number.isFinite(item.start) ? item.start : null;
    const end = typeof item.end === "number" && Number.isFinite(item.end) ? item.end : null;
    // ⚠️ مقطع بلا وقت = مش قابل للاستشهاد. بنتخطّاه: الأحسن نخسر
    //    مرجع واحد من غير citations على مرجع كامل.
    if (start === null) continue;

    segments.push({
      index: segments.length,
      start,
      end: end ?? start,
      text,
    });
  }
  return segments;
}

/* ═══════════════════════════ التقسيم ═══════════════════════════ */

/**
 * يقسّم المقاطع لقطع — **على حدود المقاطع فقط**.
 *
 * ⚠️ **ليه مش على حدود الجمل زي `chunkTranscript`**: هناك المقطع وحدة
 *    نص (نص مسطّح). هنا المقطع هو **الـ anchor** — لو قسّينا جوّه
 *    المقطع، النص بينقسم على قطعتين والـ anchor يبقى في واحدة بس،
 *    فالموجز يبقى ناقص.
 *
 * ⚠️ **الفهرس عام**: `segment.index` هو الفهرس في المحاضرة كلها (مش
 *    في القطعة). ده اللي يخلي أرقام `S<n>` مستقرة عبر القطع، فالـ
 *    validation يقدر يشيك على مدى القطعة بالظبط.
 */
export function chunkSegments(
  segments: TimedSegment[],
  maxCharsPerChunk: number,
): TimedSegment[][] {
  if (segments.length === 0) return [];
  const limit = Math.max(1, maxCharsPerChunk);

  const chunks: TimedSegment[][] = [];
  let current: TimedSegment[] = [];
  let currentChars = 0;

  for (const segment of segments) {
    const cost = segment.text.length + 1;
    if (current.length > 0 && currentChars + cost > limit) {
      chunks.push(current);
      current = [segment];
      currentChars = cost;
      continue;
    }
    current.push(segment);
    currentChars += cost;
  }
  if (current.length > 0) chunks.push(current);

  return chunks;
}

/* ═══════════════════════════ التحقق ═══════════════════════════ */

/**
 * تطبيع عربي للمطابقة بين الاقتباس ونص المقطع.
 *
 * ⚠️ **ليه مش `normalizeForCompare` من `lecture-study.ts`**: الدالة دي
 *    بتشيّل **كل** المسافات (بـ regex بيشيل أي مسافة حوالين أي حرف)
 *    عشان تقارن أسماء قصيرة زي «الـ LP» و«الLP». ده ممتاز للمقارنة
 *    الكاملة، بس هنا بنقارن **كلمات** — فلو شِلنا المسافات بقى كل نص
 *    كلمة واحدة، والمقارنة ماهتشتغلش خالص. فبنكتب تطبيع خاص: نفس قواعد
 *    الحروف، بس **المسافات بتتبقى**.
 *
 * القواعد: توحيد الهمزات (أ/إ/آ/ٱ → ا)، وتوحيد التاء المربوطة
 * (ة → ه) والألف المقصورة (ى → ي)، وشيل التشكيل والتطويل
 * (U+064B–U+065F و U+0670 و U+0640)، وشيل الترقيم، وضمّ المسافات.
 */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    // تشكيل + علامة المد + التطويل
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[؟?!.،,:؛;"«»()[\]{}'"`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * نسبة تداخل الاقتباس مع نص المقطع.
 *
 * ⚠️ **ليه مش substring صارم**: تفريغ الـ STT العربي فيه تفاوت في
 *    المسافات، والتطبيع بيوسّع المسافات بس. فمقارنة التوكنات أأمن من
 *    مقارنة حرف-بحرف.
 *
 * ⚠️ **العتبة 0.6**: اقتباس حقيقي بيبقى فوقها بكتير (طويل)، والسوء
 *    البسيط (كلمة واحدة اتغيرت) بيبقى تحت. الحسبة: نسبة التوكنات
 *    المشتركة على طول الاقتباس (مش على union) — عشان اقتباس قصير جاي
 *    من نفس المقطع counts 1.0.
 */
export function quoteOverlap(quote: string, segmentText: string): number {
  const quoteTokens = normalizeForMatch(quote).split(" ").filter(Boolean);
  if (quoteTokens.length === 0) return 0;
  const segmentTokens = new Set(normalizeForMatch(segmentText).split(" ").filter(Boolean));
  if (segmentTokens.size === 0) return 0;

  let shared = 0;
  for (const token of quoteTokens) {
    if (segmentTokens.has(token)) shared += 1;
  }
  return shared / quoteTokens.length;
}

/** عتبة القبول الافتراضية لطبقة الأمانة. */
export const QUOTE_OVERLAP_THRESHOLD = 0.6;

/** سبب رفض مرجع — بيتبعت للأرقام (تشخيص) مش للطالب. */
export type CitationRejection = "BAD_SHAPE" | "NO_SEGMENT" | "SEG_OUT_OF_RANGE" | "BAD_QUOTE";

/**
 * يتحقق من claim واحد — الطبقات ٢ و٣ و٤.
 *
 * ⚠️ **ليه بنرجّع الجملة لو فشل التحقق**: الجملة نفسها ممكن تكون
 *    سليمة حتى لو المرجع غلط. الطالب بيستفيد من الشرح، واللي ناقصه
 *    هو *الثقة* في المصدر. فبنرمي **المرجع** ونسيب الجملة بدون chip.
 *    لو الغالبية بتفشل ⇒ الموديل ضاع منه الربط ⇒ القطعة كلها فاشلة.
 */
function validateClaim(
  value: unknown,
  chunk: TimedSegment[],
  segmentsByIndex: Map<number, TimedSegment>,
  durationSeconds: number | null,
): { ok: true; claim: IntensiveClaim } | { ok: false; reason: CitationRejection } {
  const obj = expectObject(value);
  rejectUnknownKeys(obj, ["text", "seg", "quote"], "claim");

  const text = expectString(obj.text, "text");
  if (text.length > MAX_CLAIM_CHARS) {
    throw new AiStructuredOutputError("Claim text is too long");
  }

  // ٢) وجود المقطع — `seg` رقم صحيح.
  if (typeof obj.seg !== "number" || !Number.isInteger(obj.seg)) {
    return { ok: false, reason: "NO_SEGMENT" };
  }
  const seg = obj.seg;

  // ٢) المقطع لازم يكون **جوّه القطعة دي** — تشيك set-membership صارم.
  //    الموديل مالوش أي سبب يذكر رقم برّه القطعة اللي قدامه.
  const inChunk = chunk.some((segment) => segment.index === seg);
  if (!inChunk) return { ok: false, reason: "SEG_OUT_OF_RANGE" };

  const target = segmentsByIndex.get(seg);
  if (!target) return { ok: false, reason: "NO_SEGMENT" };

  // ٣) أمانة المقطع — الاقتباس لازم يكون من المقطع المشار إليه.
  const quote = typeof obj.quote === "string" ? obj.quote.trim() : "";
  if (quote === "") return { ok: false, reason: "BAD_QUOTE" };
  if (quote.length > MAX_QUOTE_CHARS) {
    throw new AiStructuredOutputError("Quote is too long");
  }
  if (quoteOverlap(quote, target.text) < QUOTE_OVERLAP_THRESHOLD) {
    return { ok: false, reason: "BAD_QUOTE" };
  }

  // ٤) sanity الوقت.
  if (durationSeconds !== null && (target.start < 0 || target.start > durationSeconds + 5)) {
    return { ok: false, reason: "NO_SEGMENT" };
  }

  return {
    ok: true,
    claim: { text, seg, start: target.start },
  };
}

/**
 * يقرأ نص الجملة من شكل خام — لل(use) في الحالة اللي التحقق فشل.
 *
 * ⚠️ **ليه دالة منفصلة**: `validateClaim` بترمي لو النص مش نص أصلاً
 *    (ده فشل شكل مش فشل مرجع). فلو وصلنا هنا، النص **سليم** — بس
 *    القراءة بتأمن ourselves من `expectString` اللي بترمي.
 */
function readClaimText(value: unknown): string {
  if (typeof value !== "object" || value === null) return "";
  const text = (value as { text?: unknown }).text;
  return typeof text === "string" ? text.trim().slice(0, MAX_CLAIM_CHARS) : "";
}

/**
 * يتحقق من رد الموديل كله (طبقة ١ + ٢ + ٣ + ٤) ويحوّله لأقسام.
 *
 * ⚠️ **ليه بنرمي throw مش بنرجّع error**: الشكل غلط (مش JSON، مفتاح
 *    مش متوقّع، نص طويل أوي) = الموديل مالوش الشغل — ده فشل القطعة.
 *    بس **المرجع** الغلط = جملة بتفقد الـ chip بس.
 */
export function validateIntensiveOutput(
  value: unknown,
  chunk: TimedSegment[],
  segmentsByIndex: Map<number, TimedSegment>,
  durationSeconds: number | null,
): { sections: IntensiveSection[]; rejected: number; total: number } {
  const obj = expectObject(value);
  rejectUnknownKeys(obj, ["sections"], "intensive");
  const rawSections = expectArray(obj.sections);

  if (rawSections.length > MAX_SECTIONS) {
    throw new AiStructuredOutputError("Too many sections");
  }

  const sections: IntensiveSection[] = [];
  let rejected = 0;
  let total = 0;

  for (const rawSection of rawSections) {
    const sectionObj = expectObject(rawSection);
    rejectUnknownKeys(sectionObj, ["heading", "claims"], "section");

    const heading = expectString(sectionObj.heading, "heading");
    if (heading.length > MAX_HEADING_CHARS) {
      throw new AiStructuredOutputError("Section heading is too long");
    }

    const rawClaims = expectArray(sectionObj.claims);
    if (rawClaims.length > MAX_CLAIMS_PER_SECTION) {
      throw new AiStructuredOutputError("Too many claims in a section");
    }

    const claims: IntensiveClaim[] = [];
    for (const rawClaim of rawClaims) {
      total += 1;
      const result = validateClaim(rawClaim, chunk, segmentsByIndex, durationSeconds);
      if (result.ok) {
        claims.push(result.claim);
      } else {
        rejected += 1;
        // ⚠️ الجملة بتفضل — المرجع بس هو اللي بيتشال. الطالب بيستفيد
        //    من الشرح، واللي ناقصه هو الثقة في المصدر (فبتظهر من غير chip).
        claims.push({ text: readClaimText(rawClaim), seg: null, start: null });
      }
    }

    // قسم من غير ولا جملة = قسم فاضي. بنشيله — أقسام فاضية بتلوّث
    // الشكل وبتدي الطالب إحساس إن في محتوى اتنقص.
    if (claims.length > 0) {
      sections.push({ heading, claims });
    }
  }

  return { sections, rejected, total };
}

/* ═══════════════════════════ التوليد ═══════════════════════════ */

/** اعتمادات قابلة للحقن — في الاختبارات بنمرّر mock بدل المزوّد الحقيقي. */
export type IntensiveDeps = {
  runTask: (task: "chat", input: AiTaskInput) => Promise<{ content: string; model?: string }>;
  chunkChars: number;
};

/**
 * ⚠️ **نسبة الرفض اللي بتعتبر القطعة فاشلة**: لو أكتر من 30% من
 *    مراجع القطعة اترفضت، فالموديل ضاع منه الربط بين الجملة والمقطع.
 *    عندها كل الجمل هتطلع بدون مصدر، وده أسوأ من فشل واضح.
 */
export const CHUNK_REJECTION_LIMIT = 0.3;

/** نتيجة توليد القطعة الواحدة. */
type ChunkResult = {
  sections: IntensiveSection[];
  ok: boolean;
};

/**
 * يولّد الشرح المكثف من المقاطع.
 *
 * ⚠️ **ليه `Promise.all` مش loop**: القطع مستقلة عن بعض (كل واحدة
 *    نداء لوحدها) فالتنفيذ المتوازي بيخلي الزمن = أبطأ قطعة مش مجموع
 *    القطع. وميزانية الوقت (300 ثانية) بتتصرف أحرى بكتير.
 *
 * ⚠️ **ليه مفيش نداء دمج**: نداء الدمج بياخد نصوص وبيعيد صياغتها، فلو
 *    دمجنا الشرح المكثف كان الموديل لازم يعيد كتابة أرقام المقاطع من
 *    ذاكرته — وغالباً هيسقط منها. فبنرصّ الأقسام بالترتيب الزمني بس.
 */
export async function generateIntensiveExplanation(input: {
  segments: TimedSegment[];
  durationSeconds: number | null;
  deps: IntensiveDeps;
  usage?: { feature?: string };
}): Promise<{ explanation: IntensiveExplanation; aiCalls: number }> {
  const { segments, durationSeconds, deps } = input;

  const chunks = chunkSegments(segments, deps.chunkChars);
  if (chunks.length === 0) {
    throw new IntensiveError(
      "NO_TIMINGS",
      "المحاضرة دي مفيهاش توقيتات، فمقدرناش نضيف مصادر. ارفعها من جديد أو راجعها.",
      422,
    );
  }
  if (chunks.length > MAX_INTENSIVE_CHUNKS) {
    throw new IntensiveError(
      "CHUNK_LIMIT_EXCEEDED",
      "المحاضرة دي طويلة أوي على الشرح المكثف. جرّب محاضرة أقصر.",
      422,
    );
  }

  const segmentsByIndex = new Map(segments.map((segment) => [segment.index, segment]));

  const runChunk = async (
    chunk: TimedSegment[],
    chunkIndex: number,
  ): Promise<ChunkResult & { model: string }> => {
    const response = await deps.runTask("chat", {
      messages: buildIntensiveMessages({
        chunk,
        chunkIndex,
        chunkCount: chunks.length,
      }),
      options: { temperature: 0.3 },
    });

    const parsed = parseJsonPayload(response.content);
    const validated = validateIntensiveOutput(
      parsed,
      chunk,
      segmentsByIndex,
      durationSeconds,
    );

    // ⚠️ نسبة الرفض — لو الموديل فقد الربط، القطعة دي مالهاش لازمة.
    const rejectionRate =
      validated.total === 0 ? 1 : validated.rejected / validated.total;
    if (rejectionRate > CHUNK_REJECTION_LIMIT) {
      return { sections: [], ok: false, model: response.model ?? "" };
    }
    return { sections: validated.sections, ok: true, model: response.model ?? "" };
  };

  // ⚠️ `Promise.allSettled` مش `Promise.all`: قطعة واحدة فشلت (الموديل
  //    رجّع JSON مش صالح مثلاً) ماينفعش تسقط الباقي. العزل ده مقصود.
  const settled = await Promise.allSettled(
    chunks.map((chunk, index) => runChunk(chunk, index)),
  );

  const sections: IntensiveSection[] = [];
  let ok = 0;
  let failed = 0;
  let model = "";

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      if (result.value.ok) {
        ok += 1;
        sections.push(...result.value.sections);
        // ⚠️ الموديل بيتسجّل من أول قطعة نجحت — الراوتر بيختار نفس
        //    الموديل لكل القطع في الطلب الواحد، فده كافي.
        if (model === "") model = result.value.model;
      } else {
        failed += 1;
      }
      return;
    }
    failed += 1;
    console.error(
      `lecture-intensive: القطعة ${index + 1}/${chunks.length} فشلت — ${String(result.reason)}`,
    );
  });

  if (sections.length === 0) {
    throw new IntensiveError(
      "NO_VALID_SECTIONS",
      "مقدرناش نولّد شرح مصحوب بمصادر من المحاضرة دي. جرّب تاني.",
      502,
    );
  }

  return {
    explanation: {
      version: 1,
      generated_at: new Date().toISOString(),
      model: model || "unknown",
      chunks: { ok, failed },
      sections,
    },
    aiCalls: chunks.length,
  };
}

/**
 * يستخرج JSON من رد الموديل.
 *
 * ⚠️ **ليه مش `extractJson` من `structured.ts`**: دي بتدور على أول كائن
 *    متوازن في النص — وده ممكن يلتقط `{` جوّه نص الموديل التفسيري قبل
 *    الـ JSON الحقيقي. إحنا بنطلب JSON **بس**، فبنطلب النص يبدأ بـ `{`
 *    أو `[`، ولو مابدأش = الموديل مش ماشي في التعليمات ⇒ فشل واضح.
 */
export function parseJsonPayload(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    throw new AiStructuredOutputError("Model did not return JSON");
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new AiStructuredOutputError("Model returned malformed JSON");
  }
}

/* ═══════════════════════════ الحفظ ═══════════════════════════ */

/**
 * يحفظ الشرح المكثف.
 *
 * ⚠️ **ليه `intensive_explanation` بس**: عمود واحد محدّد بالحرف. ده
 *    بيضمن عملياً إن `summary` و`explanation` و`transcript_*` ميتمسوش
 *    أبداً — مش نية كويسة، ده مفيش مسار كود يعدّلهم.
 */
export async function saveIntensiveExplanation(input: {
  supabase: SupabaseClient;
  lectureId: string;
  userId: string;
  explanation: IntensiveExplanation;
}): Promise<void> {
  const { supabase, lectureId, userId, explanation } = input;

  const { error } = await supabase
    .from("lectures")
    .update({ intensive_explanation: explanation })
    .eq("id", lectureId)
    .eq("user_id", userId);

  if (error) {
    console.error(
      `lecture-intensive: فشل حفظ الشرح المكثف [${error.code ?? "no-code"}]`,
    );
    throw new IntensiveError(
      "DB_WRITE_FAILED",
      "الشرح اتولّد بس مقدرش نحفظه. جرّب تاني كمان شوية.",
      500,
    );
  }
}

/* ═══════════════════════════ إعادة التصدير ═══════════════════════════ */

export {
  buildIntensiveMessages,
  INTENSIVE_CHUNK_CHARS,
  MAX_INTENSIVE_CHUNKS,
  type TimedSegment,
} from "./lecture-intensive-prompts";
