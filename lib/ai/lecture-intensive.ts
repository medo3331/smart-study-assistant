/* ==========================================================================
   🧠 الشرح المكثف مع المراجع الزمنية — Phase 5
   ============================================================================

   **سيرفر بس.** الدخول من الراوت بس.

   ═══ ⚠️ ليه التوليد جزء-جزء (on-demand) ═══
   أول نسخة كانت بتولّد كل القطع **بالتوازي** (`Promise.allSettled`).
   ده كان غلط، والسبب مش «النص كبير»:

   مزوّد Groq عليه **حدّ ٨٠٠٠ توكن في الدقيقة** (TPM) للموديل
   `openai/gpt-oss-120b`. والقطعة الواحدة ≈ ٦٠٠٠ حرف (≈ ٢٥٠٠ توكن
   مدخل) + مخرج JSON (≈ ١٠٠٠ توكن) ⇒ **≈ ٣٥٠٠ توكن للنداء الواحد**.
   سبع قطع بالتوازي = ~٢٤٥٠٠ توكن/دقيقة ≫ ٨٠٠٠ ⇒ كل النداءات
   الباقية رجعت **429**، ونتج عنها نوعين من الفشل:
     - `AiRouteError: All AI candidates failed` (الثلاثة مرشّحين 429)
     - `AiStructuredOutputError: malformed JSON` (ردود مقطوعة)

   ⇒ **نداء واحد لكل طلب**. spatio-temporal: الطلب الواحد بيمثّل
   جزء واحد بس، فالاستهلاك داخل حدّ الـ TPM، والطلب سريع (مش timeout)،
   والطالب يتحكم في السرعة ⇒ والـ credits بتتصرف على اللي بيقراه فعلاً.

   ═══ سلسلة التحقق (٤ طبقات) ═══
   أي JSON جاي من موديل = بيانات غير موثوقة. فلازم نشوف إن المرجع
   ده **حقيقي** قبل ما نعرضه للطالب:

     ١) الشكل       — `expectObject`/`expectArray`/`expectString` + رفض أي
                      مفتاح مش متوقّع (`lib/ai/structured.ts`).
     ٢) وجود المقطع — `seg` لازم يكون رقم صحيح جوه مدى **القطعة دي**.
                      تشيك set-membership: مش fuzzy، مش مفيش مجال للاختراع.
     ٣) أمانة المقطع — الاقتباس `quote` لازم يكون فعلاً من نص المقطع
                      المشار إليه. بُقارَن بعد التطبيع (تطبيع عربي).
     ٤) sanity الوقت — `start` لازم يكون جوه `[0, duration]`.

   طبقة ٣ هي اللي بتمنع «الموديل قعد في القطعة ٥ وقال كلام القطعة ٤٠».
   وطبقة ٢ هي اللي بتمنع «الموديل اخترع رقم». **التوقيت نفسه مش جاي
   من الموديل خالص** — إحنا بنقراه من `segments[seg].start`.
   ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AiTaskInput } from "./tasks/types";
import type { AiUsageContext } from "./usage-context";
import {
  AiStructuredOutputError,
  expectArray,
  expectObject,
  expectString,
  extractJson,
  rejectUnknownKeys,
} from "./structured";
import {
  buildIntensiveMessages,
  INTENSIVE_CHUNK_CHARS,
  INTENSIVE_MAX_TOKENS,
  MAX_CLAIMS_PER_SECTION,
  MAX_CLAIM_CHARS,
  MAX_HEADING_CHARS,
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

/**
 * ⚠️ **الشكل المخزَّن — version 2.**
 *
 * v1 كان `{ version: 1, sections: [...] }` (كل الأجزاء مع بعض).
 * v2 بيخزّن **أجزاء** كل واحد بحالته — عشان التوليد يبقى on-demand
 * والطالب مايخسرش تقدمه لو عمل refresh.
 *
 * `parts[i].claims[].seg` لسه **فهرس عام** في `transcript_data.segments`
 * (مش فهرس جوّه القطعة) — عشان الإبراز في الـ UI يبقى فوري.
 */
export type IntensivePart = {
  index: number;
  /** ready = اتولّد | pending = لسه | failed = فشل وعادي نعيده. */
  status: "ready" | "pending" | "failed";
  /** أول توقيت في القطعة (ثواني). */
  start: number;
  /** آخر توقيت في القطعة (ثواني). */
  end: number;
  /** أرقام المقاطع العامة اللي في القطعة دي. */
  segments: number[];
  generated_at: string | null;
  /** رسالة الخطأ (لو فشل) — قصيرة وآمنة. */
  error: string | null;
  sections: IntensiveSection[];
};

export type IntensiveExplanation = {
  version: 2;
  generated_at: string;
  model: string;
  total_parts: number;
  parts: IntensivePart[];
};

/* ═══════════════════════════ الأخطاء ═══════════════════════════ */

/** خطأ معروف للراوت يترجمه لـ HTTP + رسالة عربية آمنة. */
export class IntensiveError extends Error {
  readonly code: string;
  readonly status: number;
  /** ثواني لازم الطالب يستنى قبل ما يعيد (لو الرمي كان rate limit). */
  readonly retryAfter: number | undefined;

  constructor(
    code: string,
    message: string,
    status: number,
    retryAfter?: number,
  ) {
    super(message);
    this.name = "IntensiveError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/* ═══════════════════════════ استخراج المقاطع ═══════════════════════════ */

/**
 * يقرأ المقاطع من `transcript_data` بترتيبها الزمني.
 *
 * ⚠️ **ليه بنقرأ `transcript_data` مش `transcript_text`**: النص المسطّح
 *    مالوش حدود مقاطع، فمفيش حاجة نـ highlight عليها. المقاطع هي
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

/* ═══════════════════════════ تقسيم المحاضرة لأجزاء ═══════════════════════════ */

/**
 * ⚠️ **الشكل المخزَّن — بخطوات.**
 *
 * كل جزء = قطعة من المقاطع (٥..١٠ دقايق محتوى ≈ ٦٠٠٠ حرف) + حالة.
 * `status` بتتحكم في إعادة التوليد والعرض.
 */
export type IntensivePartPlan = {
  index: number;
  segments: TimedSegment[];
  start: number;
  end: number;
};

/**
 * ⚠️ **مقطع أكبر من ميزانية القطعة** ⇒ نقسّمه لقطع، **كلها بنفس الـ
 * `index`**.
 *
 * ⚠️ **ليه ده لازم**: مقاطع الـ STT مش متساوية — في محاضرات عندنا
 *    مقطع وحده ١٣٢٩٦ حرف (متوسط ٣٠٥١). والـ chunker ما بيقسمش مقطع
 *    (عشان الـ anchor ما يتكسرش)، فكان بيطلع part بـ ٤٢٠٠ حرف ⇒ مدخل
 *    ~٤٢٠٠ توكن ⇒ **المزوّد رفضه بـ 413** («Request too large») لأن
 *    المدخل + سقف المخرج عدّى حدّ الـ TPM (٨٠٠٠/دقيقة).
 *
 * ⚠️ **ليه نفس الـ index**: المقطع في البيانات واحد — لو قسّمناه في
 *    البريزنر، الـ anchor يفضل واحد (المرجع بيفضل يشير لنفس المقطع
 *    الأصلي)، والاقتباس بيتحقّق من نص المقطع **الكامل** (مش الجزء
 *    المقسَّم). فالمزايا كلها بتفضل شغالة.
 */
function splitOversizedSegment(
  segment: TimedSegment,
  maxChars: number,
): TimedSegment[] {
  if (segment.text.length <= maxChars) return [segment];

  const words = segment.text.split(/\s+/).filter(Boolean);
  const pieces: TimedSegment[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (current !== "" && candidate.length > maxChars) {
      pieces.push({ ...segment, text: current });
      current = word;
      continue;
    }
    current = candidate;
  }
  if (current !== "") pieces.push({ ...segment, text: current });

  return pieces.length > 0 ? pieces : [segment];
}

/**
 * يقسّم المقاطع لأجزاء — **على حدود المقاطع فقط**.
 *
 * ⚠️ **ليه مش على حدود الجمل زي `chunkTranscript`**: هناك المقطع وحدة
 *    نص (نص مسطّح). هنا المقطع هو **الـ anchor** — لو قسّينا جوّه
 *    المقطع، النص بينقسم على جزئين والـ anchor يبقى في واحد بس،
 *    فالموجز يبقى ناقص.
 *
 * ⚠️ **الفهرس عام**: `segment.index` هو الفهرس في المحاضرة كلها (مش
 *    في الجزء). ده اللي يخلي أرقام `S<n>` مستقرة، فالـ validation
 *    يقدر يشيك على مدى الجزء بالظبط.
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

  for (const raw of segments) {
    // ⚠️ المقطع الكبير بيتكسّر لقطع بنفس الـ index (شوف
    //    `splitOversizedSegment`).
    for (const segment of splitOversizedSegment(raw, limit)) {
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
  }
  if (current.length > 0) chunks.push(current);

  return chunks;
}

/** بيحوّل القطع لـ خطة أجزاء (مع التوقيتات). */
export function planParts(
  segments: TimedSegment[],
  maxCharsPerChunk: number = INTENSIVE_CHUNK_CHARS,
): IntensivePartPlan[] {
  return chunkSegments(segments, maxCharsPerChunk).map((chunk, index) => ({
    index,
    segments: chunk,
    start: chunk[0]?.start ?? 0,
    end: chunk[chunk.length - 1]?.end ?? 0,
  }));
}

/* ═══════════════════════════ التحقق ═══════════════════════════ */

/**
 * تطبيع عربي للمطابقة بين الاقتباس ونص المقطع.
 *
 * ⚠️ **ليه مش `normalizeForCompare` من `lecture-study.ts`**: الدالة دي
 *    بتشيّل **كل** المسافات (عشان تقارن أسماء قصيرة زي «الـ LP»
 *    و«الLP»). ده ممتاز للمقارنة الكاملة، بس هنا بنقارن **كلمات** — فلو
 *    شِلنا المسافات بقى كل نص كلمة واحدة، والمقارنة ماهتشتغلش خالص.
 *    فبنكتب تطبيع خاص: نفس قواعد الحروف، بس **المسافات بتتبقى**.
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
 */
function validateClaim(
  value: unknown,
  part: TimedSegment[],
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

  // ٢) المقطع لازم يكون **جوّه الجزء ده** — تشيك set-membership صارم.
  //    الموديل مالوش أي سبب يذكر رقم برّه الجزء اللي قدامه.
  const inPart = part.some((segment) => segment.index === seg);
  if (!inPart) return { ok: false, reason: "SEG_OUT_OF_RANGE" };

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
 * يتحقق من رد الموديل كله (طبقة ١ + ٢ + ٣ + ٤) ويحوّله لأقسام.
 *
 * ⚠️ **ليه بنرمي throw مش بنرجّع error**: الشكل غلط (مش JSON، مفتاح
 *    مش متوقّع، نص طويل أوي) = الموديل مالوش الشغل — ده فشل الجزء.
 *    بس **المرجع** الغلط = جملة بتفقد الـ chip بس.
 */
export function validateIntensiveOutput(
  value: unknown,
  part: TimedSegment[],
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
      const result = validateClaim(rawClaim, part, segmentsByIndex, durationSeconds);
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

/**
 * يقرأ نص الجملة من شكل خام — للحالة اللي التحقق فشل.
 *
 * ⚠️ **ليه دالة منفصلة**: `validateClaim` بترمي لو النص مش نص أصلاً
 *    (ده فشل شكل مش فشل مرجع). فلو وصلنا هنا، النص **سليم** — بس
 *    القراءة بتأمن نفسها من `expectString` اللي بترمي.
 */
function readClaimText(value: unknown): string {
  if (typeof value !== "object" || value === null) return "";
  const text = (value as { text?: unknown }).text;
  return typeof text === "string" ? text.trim().slice(0, MAX_CLAIM_CHARS) : "";
}

/* ═══════════════════════════ التوليد ═══════════════════════════ */

/** اعتمادات قابلة للحقن — في الاختبارات بنمرّر mock بدل المزوّد الحقيقي. */
export type IntensiveDeps = {
  runTask: (task: "chat", input: AiTaskInput) => Promise<{ content: string; model?: string }>;
  chunkChars: number;
};

/**
 * ⚠️ **نسبة الرفض اللي بتعتبر الجزء فاشل**: لو أكتر من 30% من
 *    مراجع الجزء اترفضت، فالموديل ضاع منه الربط بين الجملة والمقطع.
 *    عندها كل الجمل هتطلع بدون مصدر، وده أسوأ من فشل واضح.
 */
export const CHUNK_REJECTION_LIMIT = 0.3;

/**
 * يولّد **جزء واحد بس** من المحاضرة.
 *
 * ⚠️ **نداء واحد بالظبط** — وده هو سبب نجاح الميزة على المحاضرات
 *    الطويلة: الـ TPM بتاع المزوّد (٨٠٠٠/دقيقة) بيتقاس على النداءات
 *    المتزامنة، والجزء الواحد ≈ ٣٥٠٠ توكن فبيعدّي.
 */
export async function generateIntensivePart(input: {
  part: IntensivePartPlan;
  segments: TimedSegment[];
  durationSeconds: number | null;
  deps: IntensiveDeps;
  totalParts: number;
  /** سياق الاستخدام — لازم يعدّي للنداء عشان يتسجّل صح. */
  usage?: AiUsageContext;
}): Promise<{ sections: IntensiveSection[]; model: string; aiCalls: number }> {
  const { part, segments, durationSeconds, deps, totalParts, usage } = input;

  const segmentsByIndex = new Map(segments.map((segment) => [segment.index, segment]));

  const response = await deps.runTask("chat", {
    usage,
    messages: buildIntensiveMessages({
      chunk: part.segments,
      chunkIndex: part.index,
      chunkCount: totalParts,
    }),
    // ⚠️ **السقف لازم** — موديل gpt-oss استدلال، ومن غير سقف صريح
    //    المزوّد بيحط سقف افتراضي صغير فالموديل بيصرفه كله على التفكير
    //    ويطلع `content` فاضي (الرد كان بيتقطع ⇒ «مفيش JSON صالح»).
    options: { temperature: 0.3, maxTokens: INTENSIVE_MAX_TOKENS },
  });

  const parsed = parseJsonPayload(response.content);
  const validated = validateIntensiveOutput(
    parsed,
    part.segments,
    segmentsByIndex,
    durationSeconds,
  );

  const rejectionRate =
    validated.total === 0 ? 1 : validated.rejected / validated.total;
  if (rejectionRate > CHUNK_REJECTION_LIMIT) {
    throw new IntensiveError(
      "PART_INVALID",
      "الجزء ده اتولّد بس مراجعه مقدرناش نتحقق منها. جرّب تاني.",
      502,
    );
  }

  return {
    sections: validated.sections,
    model: response.model ?? "",
    aiCalls: 1,
  };
}

/**
 * يستخرج JSON من رد الموديل.
 *
 * ⚠️ **ليه `extractJson` من `structured.ts` مش parser صارم**: الردود
 *    بتتحط في ```json fences، وأحياناً بيبقى فيها كلام قبل الـ JSON.
 *    الـ parser الصارم (يشترط النص يبدأ بـ `{`) كان بيرفضها وهي
 *    سليمة. `extractJson` بيلاقي أول كائن **متوازن** — وهو الآمن
 *    (بيعدّي الـ strings صح).
 */
export function parseJsonPayload(content: string): unknown {
  const trimmed = content.trim();
  if (trimmed === "") {
    throw new AiStructuredOutputError("Empty model response");
  }
  // بنستخدم المستخرِج المتسامح من المشروع (بيعدّي الـ fences ويلاقي
  // أول كائن متوازن) — واللي بيرمي لو مافيش JSON خالص.
  try {
    return extractJson(trimmed);
  } catch (error) {
    // ⚠️ لوج تشخيصي **من غير محتوى**: الشكل بس (الطول + هل بدأ بـ
    //    `{` + هل فيه fence). المحتوى نفسه (نص المحاضرة) ما بيتسجّلش.
    console.error(
      `lecture-intensive: رد الموديل مش JSON صالح — len=${trimmed.length} startsWithBrace=${trimmed.startsWith("{")} hasFence=${trimmed.includes("```")}`,
    );
    throw error;
  }
}

/* ═══════════════════════════ كشف حدّ الطلبات ═══════════════════════════ */

/**
 * هل الخطأ ده **حدّ طلبات المزوّد** (مش خطأ في الكود)؟
 *
 * ⚠️ **ليه مهم**: مزوّد Groq المجاني عليه ٨٠٠٠ توكن/دقيقة (TPM) لكل
 * Org. نداء واحد ≈ ٥٠٠٠ توكن ⇒ **نداء ونص في الدقيقة**. فلما الطالب
 * يضغط «الجزء التالي» بسرعة، بيجي 429 من المزوّد، والراوتر بيحاول
 * المرشّحين كلهم فيفشلوا ⇒ بيرمي `AiRouteError`/`AiProviderError`.
 *
 * الـ 429 ده **مش خطأ** — هو إ.signal «استنى». فالواجهة لازم تعرض
 * رسالة صالحة مع `Retry-After`، مش «حصل خطأ»Generic.
 *
 * ⚠️ **كيف بنعرفه**: الراوتر بيسجّل سبب كل محاولة في
 *    `RouterAttempt.reason` — والـ 429 بيبقى `"HTTP 429"`. ولو كل
 *    المرشّحين فشلوا من غير سبب واضح، الـ status بيبقى 503
 *    (`AiProviderError("All AI providers failed")`).
 */
export function isProviderRateLimit(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  // ١) الراوتر: سبب كل محاولة.
  const reasons = (error as { reasons?: Array<{ reason?: unknown }> }).reasons;
  if (Array.isArray(reasons) && reasons.length > 0) {
    if (reasons.some((r) => /429/.test(String(r.reason ?? "")))) return true;
  }

  // ٢) المزوّد: 429 مباشر.
  const status = (error as { status?: unknown }).status;
  if (status === 429) return true;

  // ٣) «كل المرشّحين فشلوا» (503) — في حالتنا ده حدّ الطلبات.
  const message = (error as { message?: unknown }).message;
  if (status === 503 && typeof message === "string") {
    return /All AI providers failed|All AI candidates failed/i.test(message);
  }
  return false;
}

/* ═══════════════════════════ الحالة المخزَّنة ═══════════════════════════ */

/** حالة فارغة (مفيش شرح متولّد بعد). */
export function emptyExplanation(plan: IntensivePartPlan[]): IntensiveExplanation {
  return {
    version: 2,
    generated_at: new Date().toISOString(),
    model: "",
    total_parts: plan.length,
    parts: plan.map((p) => ({
      index: p.index,
      status: "pending" as const,
      start: p.start,
      end: p.end,
      // ⚠️ **لازم**: أرقام مقاطع الجزء — من غيرها الـ UI مش هيعرف
      //    يربط مرجع الجزء بالمقطع في التفريغ.
      segments: p.segments.map((seg) => seg.index),
      generated_at: null,
      error: null,
      sections: [],
    })),
  };
}

/**
 * يقرأ الحالة المخزَّنة ويطابقها مع خطة الأجزاء الحالية.
 *
 * ⚠️ **ليه بنعيد التوليد**: لو عدد الأ_parts اتغيّر (لأن تفريغ اتعدّل
 *    يدوياً ⇒ `segments` اتغيّرت ⇒ التقسيم اتغيّر)، الأجزاء القديمة
 *    بتبقى بمراجع بتوقيتات قديمة ⇒ بنبدأ من جديد. ده آمن: الأجزاء
 *    بتتولّد on-demand فلما غير المستخدم بيلاقي حالة parts جديدة.
 */
export function reconcileExplanation(
  stored: unknown,
  plan: IntensivePartPlan[],
): IntensiveExplanation {
  const base = emptyExplanation(plan);
  if (typeof stored !== "object" || stored === null) return base;
  const s = stored as Partial<IntensiveExplanation>;

  // v1 (كل الأجزاء مع بعض) — مش متوافق مع التوليد on-demand ⇒ نبدأ من جديد.
  if (s.version !== 2) return base;
  if (!Array.isArray(s.parts) || s.parts.length !== plan.length) return base;

  const parts: IntensivePart[] = plan.map((p) => {
    const old = s.parts?.[p.index];
    // ⚠️ لو مقاطع الجزء اتغيّرت ⇒ مراجعه القديمة بقت لغيره ⇒ نبدأ من جديد.
    const sameSegments =
      old &&
      Array.isArray(old.segments) &&
      old.segments.length === p.segments.length &&
      old.segments.every((idx, i) => idx === p.segments[i]?.index);
    if (!sameSegments) {
      return {
        index: p.index,
        status: "pending" as const,
        start: p.start,
        end: p.end,
        segments: p.segments.map((seg) => seg.index),
        generated_at: null,
        error: null,
        sections: [],
      };
    }
    return {
      index: p.index,
      status: old.status,
      start: p.start,
      end: p.end,
      segments: p.segments.map((seg) => seg.index),
      generated_at: old.generated_at ?? null,
      error: old.error ?? null,
      sections: old.sections ?? [],
    };
  });

  return {
    version: 2,
    generated_at: s.generated_at ?? base.generated_at,
    model: s.model ?? "",
    total_parts: plan.length,
    parts,
  };
}

/* ═══════════════════════════ الحفظ ═══════════════════════════ */

/**
 * يحفظ حالة الشرح المكثف.
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
  INTENSIVE_MAX_TOKENS,
  MAX_INTENSIVE_CHUNKS,
  type TimedSegment,
} from "./lecture-intensive-prompts";
