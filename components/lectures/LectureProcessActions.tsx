"use client";

import { useCallback, useRef, useState } from "react";
import { Sparkles, Loader2, AlertTriangle } from "lucide-react";

import { LectureNote } from "./LectureNote";
import { FlashcardsPanel } from "./FlashcardsPanel";
import { McqQuiz } from "./McqQuiz";
import type { Flashcard, Mcq } from "@/lib/ai/lecture-study";

/* ==========================================================================
   ✨ أزرار معالجة المحاضرة بالذكاء الاصطناعي — Phase 4-A
   ═══════════════════════════════════════════════════════════════════════

   كومبوننت كلاينت صغير بيتحط جوّه كارت المحاضرة في /lectures.

   ═══ ليه منفصل عن الصفحة ═══
   صفحة /lectures Server Component (بتقرأ بعميل الجلسة). الكومبوننت ده
   محتاج state وضغطات، فمحتاج `'use client'`. فصلناهم عشان ما نضطرش
   نحوّل الصفحة كلها لكلاينت — ده كان هيخليها تقرأ من الـ client
   والـ RLS يبقى شغلتها هناك.

   ═══ ليه الـ state هنا مش في الصفحة ═══
   النتيجة المولّدة ترجع في رد الـ API، إحنا بنعرضها فوراً من غير
   إعادة تحميل للصفحة.

   ⚠️ **التفريغ مبنمسحش أبداً**: الفشل بيغيّر حالة الخطأ بس، والنص
   الأصلي موجود في الصفحة من الأول ومش بيتبعت للـ API أصلاً (الراوت
   بيقراه من القاعدة).
   ═══════════════════════════════════════════════════════════════════════ */

type ProcessResponse = {
  success?: boolean;
  summary?: string;
  explanation?: string;
  flashcards?: Flashcard[];
  mcqs?: Mcq[];
  error?: { code?: string; message?: string };
};

/** رسالة التحميل لكل عملية. */
const LOADING_MESSAGE: Record<string, string> = {
  summary: "جاري تجهيز ملخص المحاضرة...",
  explanation: "جاري شرح المحاضرة...",
  all: "جاري تحليل المحاضرة وتجهيز المحتوى...",
};

const GENERIC_ERROR = "حصلت مشكلة أثناء المعالجة. جرّب تاني كمان شوية.";

export function LectureProcessActions({
  lectureId,
  hasSummary,
  hasExplanation,
}: {
  lectureId: string;
  hasSummary: boolean;
  hasExplanation: boolean;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[] | null>(null);
  const [mcqs, setMcqs] = useState<Mcq[] | null>(null);

  /**
   * ⚠️ القفل بـ `useRef` مش بـ state: الـ state setter بيلفّ async، فدوسين
   * سريعين كان هياخدوا قفلين ويبعتوا طلبين والموديل بيتكلّف مرتين.
   * القفل بالـ ref بيتحط **فوراً** قبل أول `await`.
   */
  const inFlight = useRef(false);

  const run = useCallback(
    async (type: "summary" | "explanation" | "all" | "flashcards" | "mcq") => {
      if (inFlight.current) return;
      inFlight.current = true;
      setLoading(type);
      setError(null);

      try {
        const response = await fetch(
          `/api/lectures/${encodeURIComponent(lectureId)}/process`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type }),
          },
        );

        const payload = (await response.json().catch(() => null)) as ProcessResponse | null;

        if (!response.ok || !payload?.success) {
          setError(payload?.error?.message ?? GENERIC_ERROR);
          return;
        }

        // النتيجة بتيجي في نفس الرد — من غير إعادة تحميل للصفحة.
        if (payload.summary) setSummary(payload.summary);
        if (payload.explanation) setExplanation(payload.explanation);
        if (payload.flashcards) setFlashcards(payload.flashcards);
        if (payload.mcqs) setMcqs(payload.mcqs);
      } catch {
        setError(GENERIC_ERROR);
      } finally {
        // القفل بينزل في كل الحالات — حتى لو النداء رجع خطأ. لو نسيناه
        // هنا، الزرار هيفضل معطّل طول عمر الصفحة.
        inFlight.current = false;
        setLoading(null);
      }
    },
    [lectureId],
  );

  const busy = loading !== null;
  // الزرار بيقفل وقت الشغل بس بيضل موجود — عشان الطالب يفهم إن في
  // عملية شغالة، بدل ما الزرار يختفي ويفتكر إنكسر.
  const showSummary = !hasSummary;
  const showExplanation = !hasExplanation;

  return (
    <div className="mt-3 space-y-3">
      {/* منطقة الأفعال — بتظهر لو فيه حاجة واحدة على الأقل ناقصة */}
      {(showSummary || showExplanation) && (
        <div className="flex flex-wrap gap-2">
          {showSummary && (
            <button
              type="button"
              onClick={() => void run("summary")}
              disabled={busy}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule)] bg-[var(--card-secondary)] px-3 text-sm font-semibold text-[var(--text)] transition-colors hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading === "summary" ? (
                <Loader2 size={16} className="animate-spin" aria-hidden />
              ) : (
                <Sparkles size={16} aria-hidden />
              )}
              <span>{loading === "summary" ? "جاري التجهيز…" : "تلخيص المحاضرة"}</span>
            </button>
          )}

          {showExplanation && (
            <button
              type="button"
              onClick={() => void run("explanation")}
              disabled={busy}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule)] bg-[var(--card-secondary)] px-3 text-sm font-semibold text-[var(--text)] transition-colors hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading === "explanation" ? (
                <Loader2 size={16} className="animate-spin" aria-hidden />
              ) : (
                <Sparkles size={16} aria-hidden />
              )}
              <span>
                {loading === "explanation" ? "جاري الشرح…" : "شرح المحاضرة"}
              </span>
            </button>
          )}
        </div>
      )}

      {/* رسالة التحميل — `role="status"` عشان قارئات الشاشة تعلنها */}
      {busy && (
        <p role="status" className="text-sm text-[var(--muted)]">
          {LOADING_MESSAGE[loading] ?? LOADING_MESSAGE.all}
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"
        >
          <AlertTriangle
            size={16}
            className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <p className="text-sm leading-relaxed text-[var(--text)]">{error}</p>
        </div>
      )}

      {/* ───────── 📚 أدوات المذاكرة (Phase 4-B) ─────────
       *
       * ⚠️ **منطقة منفصلة عن أفعال الملخص/الشرح** لأن التكلفة مختلفة:
       * كل ضغطة هنا = credit مستقل. الفصل البصري بيخلّي الطالب يفهم
       * إن دي عمليات مستقلة، مش جزء من «تلخيص المحاضرة».
       */}
      <div className="border-t border-[var(--rule)] pt-3">
        <p className="mb-2 text-xs font-semibold text-ink-soft">📚 أدوات المذاكرة</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void run("flashcards")}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule)] bg-[var(--card-secondary)] px-3 text-sm font-semibold text-[var(--text)] transition-colors hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading === "flashcards" ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : (
              <Sparkles size={16} aria-hidden />
            )}
            <span>
              {loading === "flashcards"
                ? "جاري التجهيز…"
                : flashcards
                  ? "إعادة إنشاء البطاقات"
                  : "بطاقات المذاكرة"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void run("mcq")}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule)] bg-[var(--card-secondary)] px-3 text-sm font-semibold text-[var(--text)] transition-colors hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading === "mcq" ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : (
              <Sparkles size={16} aria-hidden />
            )}
            <span>
              {loading === "mcq"
                ? "جاري التجهيز…"
                : mcqs
                  ? "إعادة إنشاء الأسئلة"
                  : "أسئلة اختبار"}
            </span>
          </button>
        </div>
      </div>

      {/* ⚠️ العرض عبر `LectureContent` (react-markdown) — **مافيش**
          dangerouslySetInnerHTML. النص المولّد بيتحوّل لعناصر React حقيقية،
          فمافيش أي HTML بيترجم أو بينفّذ. */}
      {summary && <LectureNote kind="summary" content={summary} />}

      {explanation && <LectureNote kind="explanation" content={explanation} />}

      {flashcards && <FlashcardsPanel cards={flashcards} />}

      {mcqs && <McqQuiz mcqs={mcqs} />}
    </div>
  );
}

