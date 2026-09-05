"use client";

import React from "react";
import { BookOpen, Clock, TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react";
import type { CoverageBreakdown, CoverageState } from "@/lib/curriculum-coverage";

/* ============================================================================
   Coverage State Visual Mapping (with Arabic labels, RTL-ready)
   - no_data: gray muted
   - partially_mapped: amber warning
   - active: blue/muted progress
   - complete: green
   - insufficient_data: muted gray with note
 ============================================================================ */

function coverageStateLabel(state: CoverageState): { label: string; note?: string } {
  switch (state) {
    case "no_data":
      return { label: "لا توجد بيانات منهجية", note: "لم يتم ربط أي محتوى منهجي بعد." };
    case "partially_mapped":
      return { label: "ربط جزئي", note: "بعض المحتوى المنهجي مرتبط؛ التغطية مبنية فقط على المحتوى المرتبط." };
    case "insufficient_data":
      return { label: "بيانات غير كافية", note: "عدد الدروس المرتبطة قليل جدًا لعرض تغطية دقيقة." };
    case "active":
      return { label: "نشط", note: "تقدم مستمر." };
    case "complete":
      return { label: "مكتمل", note: "تم إكمال جميع الدروس المرتبطة." };
    default:
      return { label: "غير محدد", note: "" };
  }
}

function coverageStateColor(state: CoverageState): string {
  switch (state) {
    case "no_data":
      return "text-stone-400";
    case "partially_mapped":
      return "text-amber-600";
    case "insufficient_data":
      return "text-stone-400";
    case "active":
      return "text-emerald-700";
    case "complete":
      return "text-emerald-700";
    default:
      return "text-stone-400";
  }
}

function coverageProgressFillClass(percent: number): string {
  if (percent >= 100) return "bg-emerald-600";
  if (percent >= 70) return "bg-emerald-500";
  if (percent >= 40) return "bg-amber-500";
  if (percent > 0) return "bg-stone-400";
  return "bg-stone-300";
}

/* ============================================================================
   Main Component
 ============================================================================ */

export interface CurriculumCoverageCardProps {
  coverage: CoverageBreakdown | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

export function CurriculumCoverageCard({
  coverage,
  loading = false,
  error = null,
  onRefresh,
}: CurriculumCoverageCardProps) {
  // Loading state
  if (loading) {
    return (
      <section
        aria-label="بطاقة تغطية المنهج — تحميل"
        className="rounded-2xl border border-stone-200 bg-[#fdfbf7] p-6 shadow-sm"
        dir="rtl"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-stone-200 animate-pulse" />
          <div className="h-4 w-28 bg-stone-200 rounded animate-pulse" />
        </div>
        <div className="h-32 bg-stone-100 rounded-xl animate-pulse" />
      </section>
    );
  }

  // Error / missing academic context
  if (error || !coverage) {
    return (
      <section
        aria-label="تغطية المنهج — حالة خطأ"
        className="rounded-2xl border border-stone-200 bg-[#fdfbf7] p-6 shadow-sm"
        dir="rtl"
      >
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle className="w-5 h-5 text-rose-600" aria-hidden="true" />
          <h2 className="text-base font-bold text-stone-800">تغطية المنهج</h2>
        </div>
        <p className="text-sm text-rose-700 leading-relaxed">
          {error || "لا يمكن عرض التغطية حالياً. يرجى التحقق من السياق الأكاديمي."}
        </p>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="mt-4 px-4 py-2 rounded-lg bg-stone-900 text-[#fdfbf7] text-sm hover:bg-stone-800 transition-colors"
          >
            إعادة المحاولة
          </button>
        )}
      </section>
    );
  }

  // No academic context — show setup state (never guess)
  if (!coverage.hasAcademicContext) {
    return (
      <section
        aria-label="تغطية المنهج — إعداد السياق الأكاديمي"
        className="rounded-2xl border border-stone-200 bg-[#fdfbf7] p-6 shadow-sm"
        dir="rtl"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-amber-700" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-stone-800 leading-tight">تغطية المنهج</h2>
            <p className="text-xs text-stone-500">منهج دراستك</p>
          </div>
        </div>
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
          <p className="text-sm text-amber-800 leading-relaxed">
            لم يتم إعداد السياق الأكاديمي بعد. يرجى إكمال البيانات الأكاديمية
            (الدولة، المرحلة، الصف، المنهج) لعرض تغطية دقيقة.
          </p>
          <p className="text-xs text-amber-600 mt-2">لا يتم تعيين منهج افتراضي.</p>
        </div>
      </section>
    );
  }

  // Real data — compute and show
  const stateInfo = coverageStateLabel(coverage.coverageState);
  const stateColor = coverageStateColor(coverage.coverageState);
  const progressClass = coverageProgressFillClass(coverage.coveragePercent);

  // Coverage message based on state
  const coverageMessage = () => {
    switch (coverage.coverageState) {
      case "no_data":
        return "لم يتم ربط أي محتوى منهجي بعد.";
      case "partially_mapped":
        return `بعض المحتوى المنهجي مرتبط (${coverage.unmappedContentCount} عنصر غير مرتبط بعد). التغطية مبنية فقط على المحتوى المرتبط.`;
      case "complete":
        return "تم إكمال 100% من المحتوى المنهجي المرتبط.";
      case "insufficient_data":
        return "عدد الدروس المرتبطة قليل لعرض تغطية دقيقة.";
      case "active":
        return coverage.coveragePercent > 0
          ? `تقدم مستمر — ${coverage.coveragePercent}% من الدروس المرتبطة مكتملة.`
          : "لم يبدأ إكمال أي درس مرتبط بعد.";
      default:
        return "";
    }
  };

  // Subject breakdown (only subjects with real mapped content)
  const subjectsWithData = coverage.subjectBreakdown.filter(
    (s) => s.totalLessons > 0
  );

  return (
    <section
      aria-label="تغطية المنهج"
      className="rounded-2xl border border-stone-200 bg-[#fdfbf7] p-6 shadow-sm"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#2a2320] flex items-center justify-center shadow-md shadow-stone-300/50">
            <BookOpen className="w-5 h-5 text-[#f5f0eb]" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#2a2320] leading-tight">تغطية المنهج</h2>
            <p className="text-xs text-stone-500">
              {coverage.curriculumName || coverage.curriculumCode
                ? `${coverage.curriculumName || coverage.curriculumCode} · ${coverage.stageName ?? ""}`
                : "منهج دراستك"}
            </p>
          </div>
        </div>
        <span
          className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${stateColor}`}
        >
          {stateInfo.label}
        </span>
      </div>

      {/* State note */}
      {coverage.coverageState === "no_data" || coverage.coverageState === "partially_mapped" ? (
        <div className="rounded-xl bg-stone-50 border border-stone-200 p-4 mb-5">
          <p className="text-sm text-stone-600 leading-relaxed">{coverageMessage()}</p>
          {coverage.coverageState === "partially_mapped" && coverage.unmappedContentCount > 0 && (
            <p className="text-xs text-stone-500 mt-2">
              محتوى غير مرتبط: {coverage.unmappedContentCount}
            </p>
          )}
        </div>
      ) : null}

      {/* Main coverage bar */}
      {(coverage.coverageState === "active" ||
        coverage.coverageState === "complete" ||
        coverage.coverageState === "insufficient_data") && (
        <>
          <div className="mb-3 flex items-end justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-[#2a2320] tracking-tight">
                {coverage.coveragePercent}%
              </span>
              <span className="text-xs text-stone-400 font-medium">تغطية</span>
            </div>
            <div className="text-right">
              <p className="text-xs text-stone-500">
                مكتمل: <span className="font-semibold text-emerald-700">{coverage.completedLessons}</span>
              </p>
              <p className="text-xs text-stone-500">
                متبقي: <span className="font-semibold text-amber-700">{coverage.remainingLessons}</span> درس
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div
            className="w-full h-3 rounded-full bg-stone-200 overflow-hidden mb-2 shadow-inner"
            role="progressbar"
            aria-valuenow={coverage.coveragePercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`تغطية المنهج ${coverage.coveragePercent}%`}
          >
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${progressClass}`}
              style={{ width: `${Math.max(4, coverage.coveragePercent)}%` }}
            />
          </div>
          <p className="text-xs text-stone-400 mb-5">من أصل {coverage.totalMappedLessons} درس مرتبط</p>
        </>
      )}

      {/* Coverage state messages for active/complete states */}
      {(coverage.coverageState === "active" || coverage.coverageState === "complete") && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 mb-5">
          <p className="text-sm text-emerald-800 leading-relaxed">{coverageMessage()}</p>
        </div>
      )}

      {/* Subject-level breakdown */}
      {subjectsWithData.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-3">حسب المادة</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {subjectsWithData.map((subj) => (
              <div
                key={subj.subjectId}
                className="rounded-xl bg-white border border-stone-200 p-3 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-sm font-bold text-[#2a2320] truncate">{subj.subjectName}</h4>
                  <span className="text-xs font-extrabold text-emerald-700">{subj.percent}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-stone-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${subj.percent >= 70 ? "bg-emerald-500" : subj.percent >= 40 ? "bg-amber-500" : "bg-stone-400"}`}
                    style={{ width: `${Math.max(4, subj.percent)}%` }}
                    aria-label={`تغطية ${subj.subjectName} ${subj.percent}%`}
                  />
                </div>
                <div className="flex items-center justify-between mt-2 text-[10px] text-stone-400">
                  <span>مكتمل: {subj.completedLessons}</span>
                  <span>متبقي: {subj.remainingLessons}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exam countdown section (if available) */}
      {coverage.nextExam && (
        <div className="rounded-xl bg-[#2a2320] text-[#fdfbf7] p-4 shadow-md shadow-stone-300/30">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-amber-300" aria-hidden="true" />
            <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wide">الأمتحان القادم</h3>
          </div>
          <p className="text-sm font-bold leading-snug mb-1">{coverage.nextExam.examTitle}</p>
          {coverage.nextExam.subjectName && (
            <p className="text-xs text-stone-300 mb-2">{coverage.nextExam.subjectName}</p>
          )}
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-amber-300">{coverage.nextExam.daysRemaining}</span>
            <span className="text-xs text-stone-300">يوم متبقي</span>
          </div>
          <p className="text-[10px] text-stone-400 mt-1">
            {coverage.nextExam.isToday
              ? "الأمتحان اليوم"
              : `موعد الأمتحان: ${coverage.nextExam.examDate}`}
          </p>
        </div>
      )}

      {/* No verified exam — safe message */}
      {!coverage.nextExam && coverage.hasAcademicContext && (
        <div className="rounded-xl bg-stone-50 border border-stone-200 p-3">
          <p className="text-xs text-stone-500">موعد الأمتحان غير محدد حاليًا</p>
        </div>
      )}

      {/* Note: verified data only */}
      <div className="mt-4 pt-3 border-t border-stone-100 flex items-center gap-2">
        <TrendingUp className="w-3.5 h-3.5 text-stone-300" aria-hidden="true" />
        <p className="text-[10px] text-stone-300 leading-snug">
          التغطية مبنية على المحتوى المرتبط فعليًا فقط — لا يتم عرض نسب افتراضية.
        </p>
      </div>
    </section>
  );
}

/* ============================================================================
   Small exam countdown standalone component (for reuse in other pages)
 ============================================================================ */

export interface ExamCountdownProps {
  exam: NonNullable<CoverageBreakdown["nextExam"]> | null;
  loading?: boolean;
}

export function ExamCountdown({ exam, loading }: ExamCountdownProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-[#fdfbf7] p-5 shadow-sm" dir="rtl">
        <div className="h-3 w-20 bg-stone-200 rounded animate-pulse mb-3" />
        <div className="h-16 bg-stone-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!exam) {
    return (
      <section aria-label="العد التنازلي للامتحان" className="rounded-2xl border border-stone-200 bg-[#fdfbf7] p-5 shadow-sm" dir="rtl">
        <h3 className="text-sm font-bold text-[#2a2320] mb-2">العد التنازلي للامتحان</h3>
        <p className="text-xs text-stone-400">موعد الأمتحان غير محدد حاليًا</p>
      </section>
    );
  }

  const isToday = exam.countdownState === "today";
  const isPast = exam.countdownState === "past";

  return (
    <section aria-label={`العد التنازلي للامتحان: ${exam.examTitle}`} className="rounded-2xl border border-stone-200 bg-[#fdfbf7] p-5 shadow-sm" dir="rtl">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
          <Clock className="w-4 h-4 text-amber-700" aria-hidden="true" />
        </div>
        <h3 className="text-sm font-bold text-[#2a2320]">العد التنازلي للامتحان</h3>
        {isToday && (
          <span className="text-[10px] font-extrabold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">اليوم</span>
        )}
      </div>

      <div className="rounded-xl bg-[#2a2320] text-[#fdfbf7] p-4 mb-3 shadow-md shadow-stone-300/20">
        <p className="text-sm font-bold leading-snug">{exam.examTitle}</p>
        {exam.subjectName && <p className="text-xs text-stone-300">{exam.subjectName}</p>}
        <div className="flex items-baseline gap-2 mt-3">
          <span className="text-3xl font-extrabold text-amber-300">{isToday ? "اليوم" : exam.daysRemaining}</span>
          {!isToday && exam.daysRemaining > 0 && <span className="text-xs text-stone-300">يوم متبقي</span>}
          {isToday && <span className="text-xs text-amber-300">الأمتحان اليوم</span>}
        </div>
        <p className="text-[10px] text-stone-400 mt-1">{exam.examDate}</p>
      </div>

      {exam.examTime && (
        <p className="text-xs text-stone-500">وقت الأمتحان: {exam.examTime}</p>
      )}
      <p className="text-xs text-stone-400 mt-1">منطقة زمنية: {exam.timezone}</p>
    </section>
  );
}
