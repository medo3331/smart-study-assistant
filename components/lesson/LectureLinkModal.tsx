"use client";

/* ==========================================================================
   🔗 ربط المحاضرة بالدرس — قائمة **مفلترة حسب المادة** (الخطوة 3)
   ============================================================================

   القواعد (زي ما اتطلبت):
   • المودال بيكشف بس محاضرات **نفس مادة الدرس** (`study_configs.subject`
     ↔ `workspace_subjects`/`university_subjects`/`lectures.subject`) —
     مافيش قائمة مبعثرة لكل المواد.
   • **مفيش محاضرات للمادة** ⇒ رسالة واضحة + زرار يوديك لرفع محاضرة.
   • **اقتراح ذكي**: لو عنوان محاضرة مطابق لاسم الدرس (مثل «Network Lec2»
     ودرس «Network Lec2») بيتحط فوق القائلة بعلامة ⭐.
   • المحاضرة **من غير تفريغ** بتبقى معروضة بس معطّلة (مفيش تفريغ =
     مفيش citations — الربط بيترفض برسالة على السيرفر كمان).
   ========================================================================== */

import Link from "next/link";
import { Link2, Mic, Sparkles, Upload, Unlink } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

export type LinkLectureOption = {
  id: string;
  title: string;
  createdAt: string;
  durationSeconds: number | null;
  hasTranscript: boolean;
};

export type LinkSuggestion = LinkLectureOption & { inList: boolean };

function shortDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ar-EG", { day: "numeric", month: "long" });
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.round(seconds / 60);
  return `${minutes} دقيقة`;
}

export function LectureLinkModal({
  open,
  onClose,
  subjectName,
  lectures,
  suggestion,
  currentLectureId,
  onLink,
  onUnlink,
  busy,
  error,
}: {
  open: boolean;
  onClose: () => void;
  /** مادة الدرس (اسم حرفي من study_configs) — بيظهر في العنوان. */
  subjectName: string;
  lectures: LinkLectureOption[];
  suggestion: LinkSuggestion | null;
  currentLectureId: string | null;
  onLink: (lectureId: string) => void;
  onUnlink: () => void;
  busy: boolean;
  error: string | null;
}) {
  const showSuggestion =
    suggestion && suggestion.id !== currentLectureId && !suggestion.inList;

  const hasAny = lectures.length > 0 || Boolean(showSuggestion);
  const allWithoutTranscript =
    lectures.length > 0 && lectures.every((lecture) => !lecture.hasTranscript);

  return (
    <Modal open={open} onClose={onClose} title="اربط محاضرة بالدرس" className="max-w-lg">
      <div className="space-y-3" dir="rtl">
        <p className="text-xs text-ink-soft leading-relaxed">
          {subjectName
            ? <>بنعرض بس <strong className="text-ink">محاضرات مادة {subjectName}</strong> — الربط بيدي شرح الدرس من كلام المحاضرة نفسها، وكل جملة بيترفع لها مرجع بالمقطع.</>
            : <>بنعرض محاضراتك المرتبطة بمادة الدرس — الربط بيدي شرح الدرس من كلام المحاضرة نفسها، وكل جملة بيترفع لها مرجع بالمقطع.</>}
        </p>

        {/* ⭐ اقتراح ذكي — عنوان محاضرة مطابق لاسم الدرس (ممكن يكون برة المادة) */}
        {showSuggestion && (
          <button
            type="button"
            onClick={() => onLink(suggestion.id)}
            disabled={busy || !suggestion.hasTranscript}
            className="w-full text-right rounded-[var(--r-sm)] border border-rule bg-paper-3 p-3.5 flex items-start gap-3 transition hover:bg-paper-2 disabled:opacity-50"
          >
            <Sparkles size={16} className="text-amber-500 shrink-0 mt-0.5" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink break-words">{suggestion.title}</span>
              <span className="tag mt-1 inline-flex items-center gap-1">
                ⭐ اقتراح ذكي — مطابق لاسم الدرس
                {!suggestion.hasTranscript && " · محتاج تفريغ الأول"}
              </span>
            </span>
            <Link2 size={15} className="text-ink-soft shrink-0 mt-0.5" aria-hidden />
          </button>
        )}

        {/* الحالة الفاضية — مفيش محاضرات للمادة */}
        {!hasAny && (
          <div className="rounded-[var(--r-sm)] border border-dashed border-rule p-5 text-center space-y-3">
            <Mic size={22} className="mx-auto text-ink-soft" aria-hidden />
            <p className="text-sm text-ink leading-relaxed">
              مفيش محاضرات مسجّلة في المادة دي، ارفع محاضرة الأول.
            </p>
            <Link href="/lecture-transcription" className="btn btn-marker text-sm inline-flex items-center gap-1.5">
              <Upload size={14} aria-hidden />
              ارفع محاضرة
            </Link>
          </div>
        )}

        {/* كل المحاضرات من غير تفريغ — تلميح بدل عرض قائمة معطّلة بالكامل */}
        {hasAny && allWithoutTranscript && (
          <p className="tag">
            محاضرات المادة موجودة بس لسه <strong>بدون تفريغ</strong> — فرّغها الأول عشان تربطها.{" "}
            <Link href="/lecture-transcription" className="underline text-ink hover:text-redpen">
              ارفع وفرّغ
            </Link>
          </p>
        )}

        {/* قائمة محاضرات المادة */}
        {lectures.length > 0 && (
          <ul className="space-y-2 max-h-72 overflow-y-auto">
            {lectures.map((lecture) => {
              const isCurrent = lecture.id === currentLectureId;
              const isSuggested = suggestion?.id === lecture.id;
              const duration = formatDuration(lecture.durationSeconds);
              return (
                <li key={lecture.id}>
                  <button
                    type="button"
                    onClick={() => onLink(lecture.id)}
                    disabled={busy || isCurrent || !lecture.hasTranscript}
                    aria-current={isCurrent || undefined}
                    className={`w-full text-right rounded-[var(--r-sm)] border p-3 flex items-start gap-3 transition disabled:cursor-not-allowed ${
                      isCurrent
                        ? "border-ink bg-ink text-paper-2"
                        : "border-rule bg-paper hover:bg-paper-3 disabled:opacity-50"
                    }`}
                  >
                    <Mic size={15} className="shrink-0 mt-0.5 opacity-70" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-semibold break-words ${isCurrent ? "" : "text-ink"}`}>
                        {lecture.title}
                      </span>
                      <span className={`tag mt-1 inline-flex flex-wrap items-center gap-1.5 ${isCurrent ? "opacity-80" : ""}`}>
                        {lecture.createdAt && <span>{shortDate(lecture.createdAt)}</span>}
                        {duration && <span>· {duration}</span>}
                        {!lecture.hasTranscript && <span>· بدون تفريغ</span>}
                        {isSuggested && <span>· ⭐ مقترح</span>}
                      </span>
                    </span>
                    {isCurrent ? (
                      <span className="text-xs shrink-0 mt-0.5">مرتبطة ✓</span>
                    ) : (
                      <Link2 size={15} className="text-ink-soft shrink-0 mt-0.5" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {error && (
          <p className="text-xs text-redpen leading-relaxed" role="alert">
            {error}
          </p>
        )}

        {/* فصل المحاضرة — الدرس يرجع لمسار الأوضاع الأربعة العادي */}
        {currentLectureId && (
          <div className="pt-2 border-t border-rule">
            <button
              type="button"
              onClick={onUnlink}
              disabled={busy}
              className="mono inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-redpen transition disabled:opacity-50"
            >
              <Unlink size={13} aria-hidden />
              افصل المحاضرة عن الدرس
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
