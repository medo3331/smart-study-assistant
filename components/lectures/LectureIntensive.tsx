"use client";

import { useState } from "react";
import { Clock, Quote, Sparkles, AlertTriangle } from "lucide-react";

import { useLectureCitation, formatTimestamp } from "./lecture-citation-context";
import { useWorkspace } from "./LectureWorkspace";
import type { IntensiveExplanation, IntensiveSection } from "@/lib/ai/lecture-intensive";

/* ==========================================================================
   🧠 الشرح المكثف مع المراجع — Phase 5
   ============================================================================

   ⚠️ **الـ chip مش رقم segment معروض**: التوقيت اللي الطالب بيشوفه
      (`⏱ 12:30`) بيتقرا من `claim.start` — وده **نسخة** من
      `segments[claim.seg].start` وقت التوليد. التوقيت **مش** جاي من
      الموديل خالص (شوف `lib/ai/lecture-intensive.ts`).

   ⚠️ **ليه source card جوّه الصفحة مش modal**: على الموبايل، القفزة
      للتفريغ بتضيّع مكان الطالب في الشرح. الكارت بيجاوب على سؤال
      الثقة *في مكانه*، والقفزة للتفريغ بتبقى اختيارية.

   ⚠️ **ليه مفيش `dangerouslySetInnerHTML`**: نص الجملة نص عادي بيتعرّض
      كـ children — زي بقية عارضات المحتوى في المشروع.
   ========================================================================== */

export function LectureIntensive({
  explanation,
}: {
  explanation: IntensiveExplanation;
}) {
  const { focusSegment } = useLectureCitation();
  const { open: openSection } = useWorkspace();
  const [openClaim, setOpenClaim] = useState<string | null>(null);

  const degraded = explanation.chunks.failed > 0;
  const totalChunks = explanation.chunks.ok + explanation.chunks.failed;

  /**
   * ⚠️ الترتيب مهم: **نفس الـ event** لازم يغيّر الحالتين مع بعض
   *    (فتح قسم التفريغ + تفعيل المقطع). لو اتغيّروا في نداءين
   *    منفصلين، الـ effect بتاع الـ viewer ممكن يركض قبل ما القسم
   *    يتفتح ⇒ مفيش إبراز.
   */
  const goToTranscript = (seg: number) => {
    openSection("transcript");
    focusSegment(seg);
  };

  return (
    <section
      aria-labelledby="lecture-intensive-heading"
      className="overflow-hidden rounded-2xl border border-rule bg-[var(--card-primary)]"
    >
      {/* ───────── الترويسة ───────── */}
      <header className="flex items-start gap-3 border-b border-rule bg-black/[0.03] px-5 py-4 dark:bg-white/[0.03]">
        <span
          aria-hidden
          className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"
        >
          <Sparkles size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id="lecture-intensive-heading"
            className="flex items-center gap-2 text-base font-extrabold text-ink"
          >
            🧠 شرح مكثف
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            شرح مفصّل، وكل معلومة فيه ليها مصدر بتوقيتها في المحاضرة.
          </p>
        </div>
      </header>

      <div className="space-y-5 px-5 py-5">
        {/* ⚠️ تنبيه التوليد الناقص — لازم يبان بوضوح، مش مستخبي. */}
        {degraded && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"
          >
            <AlertTriangle
              size={16}
              className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <p className="text-sm leading-relaxed text-ink">
              تمّ توليد {explanation.chunks.ok} من {totalChunks} أجزاء بس. فيه
              أجزاء ماخلصتش — جرّب تاني لو حاسس إن في كلام ناقص.
            </p>
          </div>
        )}

        {explanation.sections.map((section, sectionIndex) => (
          <IntensiveSectionBlock
            key={`${sectionIndex}-${section.heading}`}
            section={section}
            onOpenClaim={(claimId) => {
              setOpenClaim((current) => (current === claimId ? null : claimId));
            }}
            openClaim={openClaim}
            onFocusSegment={goToTranscript}
          />
        ))}
      </div>
    </section>
  );
}

/** قسم واحد — عنوانه وجمله. */
function IntensiveSectionBlock({
  section,
  openClaim,
  onOpenClaim,
  onFocusSegment,
}: {
  section: IntensiveSection;
  openClaim: string | null;
  onOpenClaim: (claimId: string) => void;
  onFocusSegment: (seg: number) => void;
}) {
  return (
    <div>
      <h4 className="mb-2 text-base font-extrabold text-ink">{section.heading}</h4>
      <ul className="space-y-2.5">
        {section.claims.map((claim, claimIndex) => {
          const claimId = `${section.heading}-${claimIndex}`;
          const isOpen = openClaim === claimId;
          // ⚠️ `seg === null` = المرجع ما تقدرش يتحقَّق منه ⇒ الجملة
          //    بتظهر من غير chip. مخفيين الـ chip أحسن من chip مكسور.
          const hasSource = claim.seg !== null && claim.start !== null;
          return (
            <li key={claimId} className="text-[0.98rem] leading-[1.95] text-ink">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span>{claim.text}</span>
                {hasSource && (
                  <button
                    type="button"
                    onClick={() => onOpenClaim(claimId)}
                    aria-expanded={isOpen}
                    aria-label={`مصدر المعلومة — الدقيقة ${formatTimestamp(claim.start as number)}`}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rule bg-black/[0.04] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink-soft transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] dark:bg-white/[0.06]"
                  >
                    <Clock size={11} aria-hidden />
                    <span>{formatTimestamp(claim.start as number)}</span>
                  </button>
                )}
              </div>

              {isOpen && hasSource && (
                <SourceCard
                  seg={claim.seg as number}
                  start={claim.start as number}
                  onFocusSegment={onFocusSegment}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * كارت المصدر — بيظهر تحت الجملة لما الطالب يضغط على الـ chip.
 *
 * ⚠️ **ليه بيعرض نص المقطع مش الجملة**: ده اللي بيثبّت للطالب إن
 *    المعلومة موجودة فعلاً في المحاضرة، مش في كلام الموديل بس.
 */
function SourceCard({
  seg,
  start,
  onFocusSegment,
}: {
  seg: number;
  start: number;
  onFocusSegment: (seg: number) => void;
}) {
  return (
    <div className="mt-1.5 rounded-xl border border-rule bg-black/[0.03] p-3 dark:bg-white/[0.03]">
      <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold text-ink-soft">
        <Quote size={12} aria-hidden />
        <span>
          المصدر: المقطع رقم {seg} — الدقيقة {formatTimestamp(start)}
        </span>
      </p>
      <button
        type="button"
        onClick={() => onFocusSegment(seg)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-rule bg-[var(--card-secondary)] px-2.5 py-1 text-xs font-semibold text-ink transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        <span>افتح في التفريغ</span>
        <span aria-hidden>←</span>
      </button>
    </div>
  );
}
