// lib/lesson/video-align.ts
//
// 🎯 محاذاة أقسام الدرس بتوقيت الفيديو/التفريغ — P3 (YouTube Intelligence).
//
// الفكرة: أقسام الشرح (headings) بتتطابق مع مقاطع التفريغ بعد التطبيع العربي
// (`normalizeForMatch`) — أول مقطع بيتطابق مع عناوين القسم بيدي `video_t`
// (ثوانٍ) يُستخدم في روابط `&t=` (بدون enablejsapi — القرار المقفول §7.1-1).
//
// الملف نقّي (pure) — قابل للاختبار مباشرة بـ vitest.

import { normalizeForMatch, type TimedSegment } from "@/lib/ai/lecture-intensive";

/** أقل درجة تطابق تقبل بها محاذاة قسم لمقطع. */
export const ALIGN_THRESHOLD = 0.5;

/** أقل طول لِـ token يُحسب في التطابق — كلمات الوصل القصيرة مش مؤشر. */
const MIN_TOKEN_LENGTH = 2;

/** توكنات دالة للتطابق — بعد التطبيع والفلترة. */
function significantTokens(text: string): string[] {
  return normalizeForMatch(text)
    .split(" ")
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

/**
 * alignHeadingsToTranscript — يربط كل عنوان قسم بأول مقطع بيتطابق معاه.
 *
 * الدرجة = نسبة توكنات العنوان الموجودة في المقطع (بعد التطبيع العربي).
 * القسم اللي مالوش تطابق كافٍ (< 0.5) بيرجع `null` بصدق — بنوّرع بدل ما
 * نديّ توقيت غلط. المقاطع بتتراجع بالترتيب — أول أفضل تطابق بيكسب.
 */
export function alignHeadingsToTranscript(
  headings: string[],
  segments: TimedSegment[]
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  if (!Array.isArray(segments) || segments.length === 0) {
    for (const heading of headings) out[heading] = null;
    return out;
  }

  // نحضّر توكنات المقاطع مرة واحدة — التفريغ ممكن يكون طويل.
  const prepared = segments.map((segment) => ({
    start: typeof segment.start === "number" ? segment.start : null,
    tokens: new Set(significantTokens(typeof segment.text === "string" ? segment.text : "")),
  }));

  for (const heading of headings) {
    const headingTokens = significantTokens(heading);
    if (headingTokens.length === 0) {
      out[heading] = null;
      continue;
    }
    let bestScore = 0;
    let bestStart: number | null = null;
    for (const segment of prepared) {
      if (segment.start == null || segment.tokens.size === 0) continue;
      let shared = 0;
      for (const token of headingTokens) {
        if (segment.tokens.has(token)) shared += 1;
      }
      const score = shared / headingTokens.length;
      if (score > bestScore) {
        bestScore = score;
        bestStart = segment.start;
      }
    }
    out[heading] = bestScore >= ALIGN_THRESHOLD && bestStart != null ? Math.floor(bestStart) : null;
  }
  return out;
}
