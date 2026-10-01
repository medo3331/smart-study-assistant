"use client";

import { useState } from "react";
import { Check, X, RotateCcw, ChevronLeft } from "lucide-react";

import type { Mcq } from "@/lib/ai/lecture-study";

/* ==========================================================================
   ❓ اختبار الاختيار من متعدد — Phase 4-B
   ═══════════════════════════════════════════════════════════════════════

   🔒 **الإجابة الصحيحة مخفيّة قبل ما الطالب يجاوب.**
   الـ state بيخزّن اختيار الطالب (رقم) مش الإجابة الصحيحة، والإجابة
   الصحيحة بتتقارن وقت العرض بس. ده فرق مهم: أي `correctAnswer` في
   الـ props بيفضل في الـ JSX بس **بعد** ما الطالب يختار — مش قبلها.

   ⚠️ ومنع الإجابة المتعددة: بعد الاختيار الزرار بيقف، و`selected` بيفضل
   محفوظ. الطالب يقدر يغيّر اختياره لحد ما يضغط «التالي».
   ═══════════════════════════════════════════════════════════════════════ */

/** ⬇️ الدرجة محسوبة مرة واحدة عند النهاية — مش أثناء العرض. */
function scoreOf(mcqs: Mcq[], answers: (number | null)[]): number {
  return mcqs.reduce(
    (score, mcq, i) => (answers[i] === mcq.correctAnswer ? score + 1 : score),
    0,
  );
}

export function McqQuiz({ mcqs }: { mcqs: Mcq[] }) {
  const [index, setIndex] = useState(0);
  /** اختيار الطالب لكل سؤال. `null` = لسه ما جاوبش. */
  const [answers, setAnswers] = useState<(number | null)[]>(() => mcqs.map(() => null));
  const [finished, setFinished] = useState(false);

  if (mcqs.length === 0) return null;

  const current = mcqs[Math.min(index, mcqs.length - 1)];
  const selected = answers[index] ?? null;
  const answered = selected !== null;
  const correct = scoreOf(mcqs, answers);
  const percent = Math.round((correct / mcqs.length) * 100);

  const choose = (optionIndex: number) => {
    // ⚠️ بعد الإجابة بنقفل الاختيار: `answered` بيمنع التغيير.
    if (answered) return;
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = optionIndex;
      return next;
    });
  };

  const next = () => {
    if (index + 1 >= mcqs.length) {
      setFinished(true);
      return;
    }
    setIndex(index + 1);
  };

  const restart = () => {
    setIndex(0);
    setAnswers(mcqs.map(() => null));
    setFinished(false);
  };

  /* ═══════════ النتيجة النهائية ═══════════ */
  if (finished) {
    return (
      <section aria-labelledby="mcq-result-heading" className="mt-3 overflow-hidden rounded-2xl border border-rule bg-[var(--card-primary)]">
        <header className="border-b border-rule bg-black/[0.03] px-5 py-3 dark:bg-white/[0.03]">
          <h3 id="mcq-result-heading" className="text-sm font-extrabold text-ink">
            🏁 نتيجتك
          </h3>
        </header>
        <div className="p-5 text-center">
          {/* ⚠️ الرقم والنسبة مع بعضين — اللون لوحده مش كفاية. */}
          <p className="text-3xl font-extrabold text-ink">{percent}%</p>
          <p className="mt-2 text-sm text-ink-soft">
            جاوبت صح على {correct} من {mcqs.length}
          </p>
          <button
            type="button"
            onClick={restart}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-rule bg-[var(--card-secondary)] px-4 text-sm font-semibold text-[var(--text)] transition-colors hover:opacity-80"
          >
            <RotateCcw size={15} aria-hidden />
            <span>إعادة المحاولة</span>
          </button>
        </div>
      </section>
    );
  }

  /* ═══════════ السؤال الحالي ═══════════ */
  return (
    <section aria-labelledby="mcq-heading" className="mt-3 overflow-hidden rounded-2xl border border-rule bg-[var(--card-primary)]">
      <header className="flex items-center justify-between gap-3 border-b border-rule bg-black/[0.03] px-5 py-3 dark:bg-white/[0.03]">
        <h3 id="mcq-heading" className="text-sm font-extrabold text-ink">
          ❓ اختبار المحاضرة
        </h3>
        <span className="text-xs text-ink-soft">
          {index + 1} / {mcqs.length}
        </span>
      </header>

      <div className="p-5">
        <p className="text-sm font-bold leading-relaxed text-ink">{current.question}</p>

        <div className="mt-4 space-y-2">
          {current.options.map((option, optionIndex) => {
            const isChosen = selected === optionIndex;
            const isCorrect = optionIndex === current.correctAnswer;
            // ⚠️ اللون بيتحسب بعد الإجابة بس — قبل كده الاختيارات
            // كلها بنفس الشكل عشان ما نكشفش الإجابة.
            const tone = !answered
              ? "border-rule bg-[var(--card-secondary)]"
              : isCorrect
                ? "border-emerald-500/50 bg-emerald-500/10"
                : isChosen
                  ? "border-red-500/50 bg-red-500/10"
                  : "border-rule bg-[var(--card-secondary)] opacity-60";

            return (
              <button
                key={optionIndex}
                type="button"
                onClick={() => choose(optionIndex)}
                disabled={answered}
                aria-pressed={isChosen}
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-start text-sm transition-colors ${tone} ${
                  answered ? "cursor-default" : "hover:opacity-90"
                }`}
              >
                <span className="mono mt-0.5 shrink-0 text-xs font-bold text-ink-soft">
                  {["A", "B", "C", "D"][optionIndex]}
                </span>
                <span className="flex-1 leading-relaxed text-ink">{option}</span>
                {answered && isCorrect && (
                  <Check size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                )}
                {answered && isChosen && !isCorrect && (
                  <X size={16} className="mt-0.5 shrink-0 text-red-500" aria-hidden />
                )}
              </button>
            );
          })}
        </div>

        {/* التفسير بيظهر بعد الإجابة بس — هو اللي بيعلّم الطالب. */}
        {answered && (
          <div className="mt-4 rounded-xl border-s-4 border-accent bg-[var(--card-secondary)] px-4 py-3">
            <p className="text-sm leading-relaxed text-ink">{current.explanation}</p>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end">
          <button
            type="button"
            onClick={next}
            disabled={!answered}
            className="inline-flex h-10 items-center gap-1 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span>{index + 1 >= mcqs.length ? "شوف النتيجة" : "التالي"}</span>
            <ChevronLeft size={16} aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}