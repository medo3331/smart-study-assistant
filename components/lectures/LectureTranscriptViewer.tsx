"use client";

import { useEffect, useRef } from "react";
import { BookOpen, History } from "lucide-react";

import { useLectureCitation, formatTimestamp } from "./lecture-citation-context";
import type { TimedSegment } from "@/lib/ai/lecture-intensive-prompts";

/* ==========================================================================
   📜 عارض التفريغ الواعي بالمقاطع — Phase 5
   ============================================================================

   ⚠️ **ليه عارض جديد مش تعديل على الـ `<pre>`**: الـ `<pre>` الحالي
      (`app/lectures/page.tsx`) بيطبع `transcript_text` — نص مسطّح مالوش
      حدود مقاطع. والقيمة في الإبراز هي **المقطع** (هو اللي عليه
      التوقيت). فمحتاجين عنصر DOM لكل مقطع.

   ⚠️ **`data-seg` هو المفتاح**: العنصر carry الـ index في الـ attribute
      ⇒ الـ highlight = `querySelector` + toggle class. مفيش state في
      React للـ index، ومفيش خطر الـ index يختلف عن الـ DOM.

   ⚠️ **ليه نرسم المقاطع مش `transcript_text`**: النص المسطّح ممكن يكون
      اتعدّل يدوياً (انظر `app/api/lectures/[id]/transcript/route.ts`)
      فيبقى مختلف عن المقاطع، وربط حرف-حرف هرمّي. فبنرسم المقاطع
      (المصدر الحقيقي) وبنقول للطالب بوضوح إن ده «التفريغ الأصلي».
   ========================================================================== */

/** أقصى عدد محاولات لإيجاد العنصر بعد فتح القسم (ms). */
const SCROLL_RETRY_MS = 600;

/**
 * @param segments المقاطع بتوقيتها — بترتيبها الزمني.
 */
export function LectureTranscriptViewer({
  segments,
  reviewedText,
}: {
  segments: TimedSegment[];
  /** النص بعد التعديل اليدوي — لو موجود بنعرضه فوق original. */
  reviewedText?: string | null;
}) {
  const { activeSeg } = useLectureCitation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  // ⚠️ الـ scroll لازم يحصل **بعد** ما العنصر يبقى مرئي. قسمين بيحصلوا:
  //    ١) القسم نفسه ممكن يكون مقفول (الـ workspace بيقفل الأقسام المركزة).
  //    ٢) لو في نص متعدّل، المصدر الأصلي جوّه `<details>` — ومحتوى
  //       `<details>` المقفول موجود في الـ DOM بس **مش مرئي**، فالـ scroll
  //       عليه ما بيعملش حاجة. فبنفتح الـ details الأول.
  useEffect(() => {
    if (activeSeg === null) return;

    let cancelled = false;
    const startedAt = Date.now();

    const tryScroll = () => {
      if (cancelled) return;

      const details = detailsRef.current;
      if (details && !details.open) {
        details.open = true;
      }

      const container = containerRef.current;
      const el = container?.querySelector<HTMLElement>(`[data-seg="${activeSeg}"]`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        // ⚠️ `tabIndex={-1}` + `focus()` — عشان قارئ الشاشة يمشي مع
        //    القفزة، مش بس العين.
        el.focus({ preventScroll: true });
        return;
      }
      if (Date.now() - startedAt < SCROLL_RETRY_MS) {
        window.setTimeout(tryScroll, 80);
      }
    };

    tryScroll();
    return () => {
      cancelled = true;
    };
  }, [activeSeg]);

  const hasReviewed = Boolean(reviewedText && reviewedText.trim() !== "");

  return (
    <div className="space-y-3">
      {hasReviewed ? (
        <>
          {/* ⚠️ النص المتعدّل هو اللي الطالب يتوقع يشوفه — الأولوية ليه. */}
          <div>
            <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-ink-soft">
              <BookOpen size={13} aria-hidden />
              <span>التفريغ (بعد التعديل)</span>
            </p>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/5 p-3 text-sm leading-relaxed text-ink dark:bg-white/10">
              {reviewedText}
            </pre>
          </div>

          {/* ⚠️ المصدر الأصلي — تحته المقطع بالإبراز. */}
          <details
            ref={detailsRef}
            className="rounded-xl border border-rule bg-black/[0.02] p-3 dark:bg-white/[0.02]"
          >
            <summary className="cursor-pointer text-xs font-semibold text-ink-soft">
              <span className="inline-flex items-center gap-2">
                <History size={13} aria-hidden />
                <span>التفريغ الأصلي (بالتوقيت — هو ده مصدر الـ citations)</span>
              </span>
            </summary>
            <div className="mt-3" ref={containerRef}>
              <SegmentTimeline segments={segments} />
            </div>
          </details>
        </>
      ) : (
        <div ref={containerRef}>
          <SegmentTimeline segments={segments} />
        </div>
      )}
    </div>
  );
}

/**
 * يرسم المقاطع كعناصر قابلة للإبراز.
 *
 * ⚠️ **الفاصل بين المقاطع مسافة واحدة** — زي بالظبط الطريقة اللي
 *    `transcript_text` اتبنى بيها (`lib/ai/transcription.ts:76`:
 *    `segments.map(s => s.text).join(" ")`). فالفراغ بين مقطع وتاني
 *    بيبان زي ما كان في النص الأصلي.
 */
function SegmentTimeline({ segments }: { segments: TimedSegment[] }) {
  const { activeSeg } = useLectureCitation();

  if (segments.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        مفيش مقاطع بتوقيتات في المحاضرة دي.
      </p>
    );
  }

  return (
    <div
      className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/5 p-3 text-sm leading-relaxed text-ink dark:bg-white/10"
      dir="rtl"
    >
      {segments.map((segment, index) => (
        <span key={segment.index}>
          {index > 0 ? " " : null}
          <span
            data-seg={segment.index}
            tabIndex={-1}
            title={`⏱ ${formatTimestamp(segment.start)}`}
            className={
              activeSeg === segment.index
                ? "rounded bg-[var(--accent)]/20 px-0.5 outline outline-2 outline-[var(--accent)]"
                : "rounded px-0.5 outline-none transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            }
          >
            {segment.text}
          </span>
        </span>
      ))}
    </div>
  );
}
