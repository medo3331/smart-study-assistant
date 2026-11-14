/* ==========================================================================
   🔗 Citations للدرس — التوليد المبني على تفريغ المحاضرة (الخطوة 3)
   ============================================================================

   نفس النمط اللي شغّال في «الشرح المكثف» للمحاضرات (`lib/ai/lecture-intensive.ts`)
   ومعمَّم على الدرس:

   • الموديل **مش بيطلّع توقيت** — بيطلّع `seg` (رقم المقطع) + `quote`
     (اقتباس حرفي)، والسيرفر بيثبّت إن الاقتباس موجود فعلاً في المقطع ده
     **قبل ما يحفظه** (عتبة تداخل 0.6 — نفس عتبة المحاضرات بالظبط).
   • `start` بيتحسب عندنا من `segments[seg].start` — التوقيت مستحيل
     يتخترع.
   • المرجع الغلط ⇒ الجملة بتفضل **بدون مرجع** (seg: null) — الطالب
     يستفيد من الشرح واللي ناقصه هو الثقة. بس لو نسبة المرجع المرفوض
     عالية (>30%) ⇒ الرد كله بيرفض (مش بنقدّم «أرقام مراجع» وهمية).

   الملف **نقي** (pure): مافيش fetch ولا process.env — كلها نصوص ودوال
   صافية، فينفع يت اختبار بال vitest مباشرة.
   ========================================================================== */

import type { AiChatMessage } from "@/lib/ai/types";
import {
  extractSegments,
  formatTimestamp,
  normalizeForMatch,
  parseJsonPayload,
  quoteOverlap,
  QUOTE_OVERLAP_THRESHOLD,
  type TimedSegment,
} from "@/lib/ai/lecture-intensive";
import { GROUNDING_RULES } from "@/lib/ai/lecture-prompts";
import {
  MAX_CLAIM_CHARS,
  MAX_CLAIMS_PER_SECTION,
  MAX_HEADING_CHARS,
  MAX_QUOTE_CHARS,
  MAX_SECTIONS,
} from "@/lib/ai/lecture-intensive-prompts";

export { extractSegments, formatTimestamp, normalizeForMatch, type TimedSegment };

/* ═══════════════════════════ الأنواع ═══════════════════════════ */

/** جملة شرحة — ليها مرجع متحقَّق منه أو من غيره (`seg: null`). */
export type LessonCitedClaim = {
  text: string;
  seg: number | null;
  start: number | null;
  /** الاقتباس الحرفي من المقطع — موجود فقط مع مرجع متحقَّق منه. */
  quote: string;
};

export type LessonCitedSection = {
  heading: string;
  claims: LessonCitedClaim[];
};

/** الشكل المخزَّن في `lesson_content.cited_explanation`. */
export type LessonCitedExplanation = {
  sections: LessonCitedSection[];
};

export type CitedParseResult =
  | {
      ok: true;
      cited: LessonCitedExplanation;
      summary: string | null;
      stats: { totalClaims: number; citedClaims: number };
    }
  | { ok: false; reason: "BAD_SHAPE" | "EMPTY" | "BAD_HONESTY" };

/* ═══════════════════════════ الحدود ═══════════════════════════ */

/** أقصى مقاطع بتتبعت في البرومبت — فوقه بنقتطع (التفريغ الطويل). */
export const MAX_PROMPT_SEGMENTS = 240;

/** أقصى حروف نص المقاطع في البرومبت (ميزانية المدخل). */
export const MAX_PROMPT_CHARS = 16_000;

/** أقصى طول الملخص المقبول (حروف). */
export const MAX_SUMMARY_CHARS = 800;

/** نسبة المرجع المرفوض اللي بيوقف الرد كله (نفس فكرة CHUNK_REJECTION_LIMIT). */
export const CITATION_REJECTION_LIMIT = 0.3;

/** أقل عدد جمل تنطبق عليهم قاعدة النسبة — تحته النسبة مش موثوقة. */
const MIN_CLAIMS_FOR_HONESTY_CHECK = 5;

/* ═══════════════════════════ البرومبت ═══════════════════════════ */

/** الشكل المطلوب — ملخص + أقسام بمرجع. */
export const CITED_SCHEMA = `{
  "summary": "ملخص قصير للدرس في سطرين",
  "sections": [
    {
      "heading": "عنوان القسم",
      "claims": [
        { "text": "الجملة المشرحة", "seg": 12, "quote": "اقتباس حرفي من المقطع" }
      ]
    }
  ]
}`;

const CITED_SYSTEM = [
  "أنت «ماجيكلي»، مدرّس جامعي. مهمتك تشرح درس لطالب باستخدام **تفريغ محاضرة مرفوعة** — كل جملة بتقولها لازم يكون ليها **مصدر** في التفريغ نفسه.",
  "",
  "المطلوب:",
  "• قسّم الشرح إلى أقسام بترتيب الأفكار زي ما وردت في التفريغ.",
  "• في كل قسم جمل قصيرة، كل واحدة بتفسّر فكرة واحدة، ومربوطة ببعض.",
  "• استخدم الأمثلة والأرقام اللي في التفريغ فعلاً — متملاش من عندك.",
  "• `summary` = ملخص الدرس كله في سطرين (للاسترجاع السريع).",
  "",
  "⚠️ قواعد المرجع (دي اللي بتفرق — التزم بيها):",
  "• كل جملة لازم يكون ليها `seg`: **رقم المقطع** اللي الجملة اتاخدت منه — الرقم اللي مكتوب قبل النص بحرف S، انقله زي ما هو بالظبط.",
  "• كل جملة لازم يكون ليها `quote`: **اقتباس حرفي** من المقطع المشار إليه (من ٨ لـ ٢٠ كلمة)، من غير أي تعديل ولا إعادة صياغة.",
  "• لو مش متأكد من رقم المقطع، متكذبش — استخدم `seg: 0` و `quote: \"\"` (والتحقق بيرفض المرجع ويسيب الجملة بدونه).",
  "",
  GROUNDING_RULES,
  "",
  `أرجع JSON فقط بالشكل ده، بلا أي شرح خالص:\n${CITED_SCHEMA}`,
  "",
  `الحدود: أقسام=${MAX_SECTIONS} بحد أقصى، جمل=${MAX_CLAIMS_PER_SECTION} بحد أقصى للقسم.`,
].join("\n");

/**
 * تقليم المقاطع لحجم مناسب للبرومبت.
 *
 * ⚠️ بنحافظ على **الأرقام الأصلية** (`segment.index`) — الموديل بينقل
 * `S<رقم>` زي ما هو، والتحقق بيتمّ على نفس الأرقام اللي اتبعتت.
 */
export function capSegmentsForPrompt(segments: TimedSegment[]): TimedSegment[] {
  const picked: TimedSegment[] = [];
  let chars = 0;
  for (const segment of segments) {
    if (picked.length >= MAX_PROMPT_SEGMENTS) break;
    chars += segment.text.length;
    if (chars > MAX_PROMPT_CHARS && picked.length > 0) break;
    picked.push(segment);
  }
  return picked;
}

/** بنبني رسائل التوليد (نظام + مستخدم) من التفريغ والموضوع. */
export function buildCitedMessages(input: {
  topic: string;
  subject: string;
  /** وصف الدرس من study_days — سياق إضافي للـ AI (اختياري). */
  description?: string;
  segments: TimedSegment[];
}): AiChatMessage[] {
  const { topic, subject, description } = input;
  const segments = capSegmentsForPrompt(input.segments);

  const lines = segments.map((segment) => `[S${segment.index}] ${segment.text}`);

  const header = [
    `الدرس: "${topic}"${subject ? ` — مادة ${subject}` : ""}.`,
    description ? `وصف الدرس: ${description.slice(0, 500)}` : "",
    "هذا تفريغ المحاضرة (كل سطر: رقم المقطع S<رقم> ثم النص):",
    "استخدم الأرقام دي بالظبط في `seg`.",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [header, "", ...lines].join("\n");

  return [
    { role: "system", content: CITED_SYSTEM },
    { role: "user", content: user },
  ];
}

/* ═══════════════════════════ التحقق ═══════════════════════════ */

/**
 * تحقّق + تحويل رد الموديل لـ cited explanation جاهزة للحفظ.
 *
 * الطبقات (نفس فلسفة المحاضرات):
 *  ١) الشكل — JSON صالح، sections/claims arrays، نصوص داخل الحدود.
 *  ٢) وجود المقطع — `seg` لازم يكون رقمًا صحيحًا **جوّه المقاطع المُرسلة**.
 *  ٣) أمانة الاقتباس — `quoteOverlap(quote, segment.text) >= 0.6`.
 *  ٤) النسبة — لو أكتر من 30% من المرجع مرفوض ⇒ الرد كله يترفض.
 *
 * المرجع الغلط **بيترفض لوحده** مش الجملة: الجملة تفضل `seg: null`
 * (تُعرض بدون علامة) — الطالب يستفيد من الشرح واللي ناقصه الثقة.
 */
export function parseCitedExplanation(raw: string, segments: TimedSegment[]): CitedParseResult {
  let parsed: unknown;
  try {
    parsed = parseJsonPayload(raw);
  } catch {
    return { ok: false, reason: "BAD_SHAPE" };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "BAD_SHAPE" };
  }
  const record = parsed as Record<string, unknown>;

  // ملخص اختياري — نص بس، مقصوص.
  const rawSummary = typeof record.summary === "string" ? record.summary.trim() : "";
  const summary = rawSummary ? rawSummary.slice(0, MAX_SUMMARY_CHARS) : null;

  if (!Array.isArray(record.sections) || record.sections.length === 0) {
    return { ok: false, reason: "EMPTY" };
  }

  const byIndex = new Map<number, TimedSegment>();
  for (const segment of segments) byIndex.set(segment.index, segment);

  const sections: LessonCitedSection[] = [];
  let totalClaims = 0;
  let rejectedRefs = 0;

  for (const rawSection of record.sections.slice(0, MAX_SECTIONS)) {
    if (rawSection === null || typeof rawSection !== "object" || Array.isArray(rawSection)) continue;
    const section = rawSection as Record<string, unknown>;

    const heading =
      typeof section.heading === "string" && section.heading.trim()
        ? section.heading.trim().slice(0, MAX_HEADING_CHARS)
        : `قسم ${sections.length + 1}`;

    if (!Array.isArray(section.claims)) continue;

    const claims: LessonCitedClaim[] = [];
    for (const rawClaim of section.claims.slice(0, MAX_CLAIMS_PER_SECTION)) {
      if (rawClaim === null || typeof rawClaim !== "object" || Array.isArray(rawClaim)) continue;
      const claim = rawClaim as Record<string, unknown>;

      const text = typeof claim.text === "string" ? claim.text.trim().slice(0, MAX_CLAIM_CHARS) : "";
      if (!text) continue;
      totalClaims += 1;

      // المرجع: seg + quote — بدونهم (أو بمرجع مرفوض) الجملة تفضل بدونه.
      let cited: LessonCitedClaim = { text, seg: null, start: null, quote: "" };
      const seg = claim.seg;
      const quote = typeof claim.quote === "string" ? claim.quote.trim().slice(0, MAX_QUOTE_CHARS) : "";
      if (
        typeof seg === "number" &&
        Number.isInteger(seg) &&
        quote.length > 0 &&
        byIndex.has(seg) &&
        quoteOverlap(quote, byIndex.get(seg)!.text) >= QUOTE_OVERLAP_THRESHOLD
      ) {
        cited = { text, seg, start: byIndex.get(seg)!.start, quote };
      } else {
        rejectedRefs += 1;
      }
      claims.push(cited);
    }

    if (claims.length > 0) sections.push({ heading, claims });
  }

  if (sections.length === 0) return { ok: false, reason: "EMPTY" };

  // ٤) النسبة: مرجع مرفوض عالي = الرد مش موثوق كله.
  if (
    totalClaims >= MIN_CLAIMS_FOR_HONESTY_CHECK &&
    rejectedRefs / totalClaims > CITATION_REJECTION_LIMIT
  ) {
    return { ok: false, reason: "BAD_HONESTY" };
  }

  return {
    ok: true,
    cited: { sections },
    summary,
    stats: { totalClaims, citedClaims: totalClaims - rejectedRefs },
  };
}
