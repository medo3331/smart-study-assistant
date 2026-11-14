"use client";

/* ==========================================================================
   🔗 عرض شرح الدرس المبني على التفريغ + علامات المرجع (الخطوة 3)
   ============================================================================

   نفس تجربة «الشرح المكثف» للمحاضرات، مبنية لوحدها هنا:

   • كل جملة ممكن يكون ليها `seg` (رقم المقطع) — بيظهر كرقم صغير
     (`CitationMark`) يفتح **Peek Card** فيها الاقتباس الحرفي + زرار
     «اذهب للمصدر» (بيوديك على `/lectures/<id>`) + نسخ الاقتباس.
   • الجملة **من غير مرجع** بتتعرض عادي من غير أي علامة (مش بنلفّ
     كلام الموديل بـ «شواهد» مالهاش أساس — التحقق حصل على السيرفر).
   • التوقيت مش بييجي من الموديل أصلًا — بيتحسب من المقطع المحفوظ.

   المكوّنات هنا بتستورد **أنواع بس** (type-only) من `lib/lesson/citations`
   عشان الباكدج بتاعها يفضل نظيف في الكلاينت.
   ========================================================================== */

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowUpLeft, Check, Copy, X } from "lucide-react";
import type { LessonCitedClaim, LessonCitedExplanation } from "@/lib/lesson/citations";

/** تنسيق التوقيت `mm:ss` (محلي — متجيبش حاجة من مكتبات خارجية). */
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

const subscribeNoop = () => () => {};

function useIsMobile(breakpoint = 768): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => typeof window !== "undefined" && window.innerWidth <= breakpoint,
    () => false,
  );
}

/* ══════════════════════ علامة المرجع ══════════════════════ */

function CitationMark({
  mark,
  start,
  open,
  onToggle,
}: {
  mark: number;
  start: number | null;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={start != null ? `المقطع ${mark} · ${formatTime(start)}` : `المقطع ${mark}`}
      aria-label={`مرجع رقم ${mark} — يفتح الاقتباس`}
      aria-expanded={open}
      className={`citation-mark${open ? " active" : ""}`}
      dir="ltr"
    >
      {mark}
    </button>
  );
}

/* ══════════════════════ ورقة المصدر (Peek) ══════════════════════ */

function CitationPeek({
  seg,
  start,
  quote,
  lectureId,
  onClose,
}: {
  seg: number;
  start: number | null;
  quote: string;
  lectureId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyQuote = async () => {
    try {
      await navigator.clipboard.writeText(quote);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const body = (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-label="إغلاق الاقتباس"
        className="absolute top-2 end-2 p-1 text-ink-soft hover:text-ink"
      >
        <X size={14} />
      </button>
      <p className="eyebrow eyebrow-flush mb-1.5">
        المصدر · المقطع{" "}
        <span className="ltr-num">
          {seg}
          {start != null ? ` · ${formatTime(start)}` : ""}
        </span>
      </p>
      <blockquote className="text-[12.5px] text-ink leading-relaxed border-s-2 border-rule ps-2.5">
        {quote}
      </blockquote>
      <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-rule">
        <button
          type="button"
          onClick={() => router.push(`/lectures/${lectureId}`)}
          className="mono inline-flex items-center gap-1.5 text-xs text-ink hover:text-redpen transition"
        >
          <ArrowUpLeft size={13} aria-hidden />
          اذهب للمصدر
        </button>
        <button
          type="button"
          onClick={copyQuote}
          className="mono inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink transition"
          aria-label={copied ? "تم نسخ الاقتباس" : "نسخ الاقتباس"}
        >
          {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
          {copied ? "اتنسخ" : "نسخ"}
        </button>
      </div>
    </>
  );

  // موبايل → Bottom sheet عن طريق portal (زي المحاضرات بالظبط).
  if (isMobile) {
    return createPortal(
      <div
        className="citation-sheet"
        dir="rtl"
        onClick={onClose}
        role="presentation"
      >
        <div className="citation-sheet-body" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="اقتباس من المصدر">
          {body}
        </div>
      </div>,
      document.body
    );
  }

  // ديسكتوب → ورقة صغيرة ملتصقة بالجملة.
  return (
    <div
      className="absolute z-50 top-full mt-2 start-0 w-[300px] max-w-[min(20rem,calc(100vw-3rem))] rounded-[var(--r-md)] border border-rule bg-paper p-4 shadow-[0_10px_30px_rgba(0,0,0,0.12)]"
      dir="rtl"
      role="dialog"
      aria-label="اقتباس من المصدر"
    >
      {body}
    </div>
  );
}

/* ══════════════════════ جملة + مرجعها ══════════════════════ */

function ClaimItem({
  uid,
  claim,
  lectureId,
  openUid,
  setOpenUid,
}: {
  uid: string;
  claim: LessonCitedClaim;
  lectureId: string;
  openUid: string | null;
  setOpenUid: (value: string | null) => void;
}) {
  const isOpen = openUid === uid;
  const hasSource = claim.seg !== null && claim.seg !== undefined;

  return (
    <li
      className="relative"
      onMouseLeave={() => setOpenUid(null)}
    >
      <span>
        {claim.text}
        {hasSource && (
          <>
            {" "}
            <CitationMark
              mark={claim.seg!}
              start={claim.start}
              open={isOpen}
              onToggle={() => setOpenUid(isOpen ? null : uid)}
            />
          </>
        )}
      </span>
      {hasSource && isOpen && (
        <CitationPeek
          seg={claim.seg!}
          start={claim.start}
          quote={claim.quote ?? ""}
          lectureId={lectureId}
          onClose={() => setOpenUid(null)}
        />
      )}
    </li>
  );
}

/* ══════════════════════ الشاعر الكامل ══════════════════════ */

/**
 * الشرح المبني على التفريغ — أقسام وجمل بمرجع متحقَّق منه + ملخص.
 * التحقق (اقتباس ≥ 0.6 من المقطع) حصل على **السيرفر** قبل الحفظ،
 * فالمكوّن ده بيعرض اللي هو متأكد منه بس.
 */
export function LessonCitedExplanationView({
  cited,
  lectureId,
  summary,
}: {
  cited: LessonCitedExplanation;
  lectureId: string;
  summary?: string | null;
}) {
  const [openUid, setOpenUid] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {cited.sections.map((section, sectionIndex) => (
        <div key={sectionIndex}>
          <p className="eyebrow mb-2">{section.heading}</p>
          <ul className="space-y-2 list-disc ps-5 marker:text-ink-soft text-[13.5px] leading-relaxed text-ink">
            {section.claims.map((claim, claimIndex) => (
              <ClaimItem
                key={claimIndex}
                uid={`${sectionIndex}-${claimIndex}`}
                claim={claim}
                lectureId={lectureId}
                openUid={openUid}
                setOpenUid={setOpenUid}
              />
            ))}
          </ul>
        </div>
      ))}

      {summary && (
        <div className="mt-4 pt-3 border-t border-rule">
          <p className="eyebrow eyebrow-flush mb-1.5">ملخص الدرس</p>
          <p className="text-[12.5px] text-ink-soft leading-relaxed">{summary}</p>
        </div>
      )}
    </div>
  );
}
