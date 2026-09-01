"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";

/**
 * كويز المسابقة — نسخة أخف من BossFight مخصّصة لصفحة المجتمع.
 *
 * ١٠ أسئلة اختيار من متعدد بيولّدها AI في مادة الطالب نفسه (subject). من غير
 * أرواح — بتجاوب الكل وتشوف نتيجتك. أول ما تخلّص بيتبعت الناتج لـ RPC
 * submit_quiz_result اللي بيحسب الـ XP والترتيب في السيرفر (مش هنا).
 *
 * الزائر (isGuest) بيلعب للتمرين بس — النتيجة ما بتتسجّلش في المسابقة،
 * وبنعرض له دعوة يسجّل حساب.
 *
 * التصميم: نفس نظام الورق/الحبر بتاع صفحة المجتمع — مش ألوان الثيم.
 */

const TOTAL_QUESTIONS = 10;

export interface QuizResult {
  score: number;
  total: number;
  accuracy: number;
  xpEarned: number;
  isNewBest: boolean;
}

interface CommunityQuizProps {
  subject: string;
  isGuest: boolean;
  onClose: () => void;
  /** بينده بعد ما النتيجة تتسجّل بنجاح — الأب بيحدّث لوحات الصدارة و XP */
  onSubmitted: (result: QuizResult) => void;
}

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

type Phase = "loading" | "intro" | "quiz" | "result" | "error";

export function CommunityQuiz({ subject, isGuest, onClose, onSubmitted }: CommunityQuizProps) {
  const [supabase] = useState(() => createClient());
  const [phase, setPhase] = useState<Phase>("loading");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  const [xpEarned, setXpEarned] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // بيمنع تسجيل النتيجة مرتين لو الـ render اتكرر على آخر سؤال
  const submittedRef = useRef(false);

  const topic = subject?.trim() || "مراجعة عامة";

  async function fetchQuestions() {
    setPhase("loading");
    try {
      const systemInstruction = `أنت مصمم اختبارات خبير. صمم بالظبط ${TOTAL_QUESTIONS} سؤال اختيار من متعدد (كل سؤال 4 اختيارات، اختيار واحد صح) لمراجعة مادة "${topic}". نوّع الأسئلة وصعوبتها من سهل لصعب تدريجيًا وخليها متنوعة في المواضيع. رد بصيغة JSON فقط بدون أي نص أو Markdown إضافي، بالشكل ده بالظبط: [{"question":"...", "options":["...","...","...","..."], "correctIndex": 0}]. correctIndex هو index الاختيار الصح (من 0 لـ 3).`;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction,
          messages: [{ role: "user", content: "جهّز أسئلة الكويز دلوقتي." }],
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || "فشل توليد الأسئلة");

      const raw = data?.choices?.[0]?.message?.content || "";
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);

      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("رد غير صالح");

      const clean: QuizQuestion[] = parsed
        .filter((q: unknown): q is QuizQuestion => {
          const item = q as Partial<QuizQuestion>;
          return (
            typeof item?.question === "string" &&
            Array.isArray(item?.options) &&
            item.options.length === 4
          );
        })
        .slice(0, TOTAL_QUESTIONS)
        .map((q) => ({
          question: q.question,
          options: q.options,
          correctIndex:
            typeof q.correctIndex === "number" && q.correctIndex >= 0 && q.correctIndex <= 3
              ? q.correctIndex
              : 0,
        }));

      if (clean.length < 5) throw new Error("عدد أسئلة غير كافي");

      setQuestions(clean);
      setPhase("intro");
    } catch (err) {
      console.error("Community quiz generation failed:", err);
      setPhase("error");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial data fetch on mount sets loading/quiz state
    fetchQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only; fetchQuestions captures topic on mount intentionally
  }, []);

  function handleAnswer(index: number) {
    if (selectedOption !== null) return;
    setSelectedOption(index);

    const isCorrect = index === questions[currentQ].correctIndex;
    const nextCorrect = correctCount + (isCorrect ? 1 : 0);
    if (isCorrect) setCorrectCount(nextCorrect);

    setTimeout(() => {
      if (currentQ + 1 >= questions.length) {
        finish(nextCorrect);
      } else {
        setCurrentQ((prev) => prev + 1);
        setSelectedOption(null);
      }
    }, 800);
  }

  async function finish(finalScore: number) {
    setPhase("result");
    if (submittedRef.current) return;
    submittedRef.current = true;

    const total = questions.length;
    const accuracy = Math.round((finalScore / total) * 100);

    // الزائر مايتسجّلش — تمرين بس
    if (isGuest) {
      setSubmitState("idle");
      return;
    }

    setSubmitState("saving");
    try {
      const { data, error } = await supabase.rpc("submit_quiz_result", {
        p_subject: topic,
        p_score: finalScore,
        p_total: total,
      });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      const earned = row?.xp_earned ?? 0;
      const newBest = row?.is_new_best ?? false;
      setXpEarned(earned);
      setIsNewBest(newBest);
      setSubmitState("saved");
      onSubmitted({ score: finalScore, total, accuracy, xpEarned: earned, isNewBest: newBest });
    } catch (err) {
      console.error("submit_quiz_result failed:", err);
      setSubmitState("error");
    }
  }

  function handleRetry() {
    setCurrentQ(0);
    setCorrectCount(0);
    setSelectedOption(null);
    setXpEarned(0);
    setIsNewBest(false);
    setSubmitState("idle");
    submittedRef.current = false;
      fetchQuestions();
  }

  const total = questions.length || TOTAL_QUESTIONS;
  const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const progressPct = total > 0 ? Math.round(((currentQ + (selectedOption !== null ? 1 : 0)) / total) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-blur-sm p-4"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label={`كويز ${topic}`}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="sheet-card sheet-card-live card-lift w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-5"
      >
        {phase === "loading" && (
          <div className="text-center py-10 space-y-4">
            <div className="w-11 h-11 border-2 border-rule border-t-redpen rounded-full animate-spin mx-auto" />
            <p className="tag justify-center">بيتم التجهيز</p>
            <p className="text-sm font-bold text-ink m-0">بنجهّز أسئلتك في {topic}</p>
            <p className="text-xs text-ink-soft m-0">
              <span className="tnum ltr-num">{TOTAL_QUESTIONS}</span> أسئلة مولّدة مخصوص ليك
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className="py-6 space-y-4">
            <div>
              <p className="eyebrow eyebrow-flush mb-1.5">كويز المسابقة</p>
              <h2 className="h3">الكويز مش جاهز دلوقتي</h2>
            </div>
            <div className="notice notice-error">
              <p className="m-0">تعذّر تجهيز الأسئلة. جرّب تاني بعد شوية.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={fetchQuestions} className="btn btn-quiet flex-1 text-sm">
                حاول تاني
              </button>
              <button onClick={onClose} className="btn btn-quiet flex-1 text-sm">
                إغلاق
              </button>
            </div>
          </div>
        )}

        {phase === "intro" && (
          <div className="py-2 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="eyebrow eyebrow-flush mb-1.5">كويز المسابقة</p>
                <h2 className="h2">
                  <span className="mark mark-tilt">{topic}</span>
                </h2>
              </div>
              <button
                onClick={onClose}
                aria-label="إغلاق"
                className="mono text-ink-soft hover:text-ink px-2 py-1 rounded-[6px] hover:bg-paper-3 transition shrink-0"
              >
                ✕
              </button>
            </div>

            <div className="bg-paper border border-rule rounded-[var(--r-sm)] p-4 space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="tag">عدد الأسئلة</span>
                <span className="mono tnum ltr-num font-bold text-ink">{questions.length}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="tag">المكسب</span>
                <span className="mono font-bold text-ink">
                  {isGuest ? "تمرين — مش محسوب" : "XP + ترتيب في المسابقة"}
                </span>
              </div>
              <p className="text-xs text-ink-soft leading-relaxed m-0 border-t border-rule pt-3">
                {isGuest
                  ? "إنت داخل كزائر، فدي جولة تمرين مش هتتسجّل في المسابقة. سجّل حساب عشان نتيجتك تتحسب."
                  : "جاوب كل الأسئلة. كل إجابة صح بتديك XP، وأحسن نتيجة ليك الأسبوع ده هي اللي بتترتّب في المسابقة."}
              </p>
            </div>

            <button onClick={() => setPhase("quiz")} className="btn btn-marker btn-block text-sm">
              ابدأ الكويز
            </button>
          </div>
        )}

        {phase === "quiz" && questions.length > 0 && (
          <div className="space-y-5">
            {/* شريط التقدّم + رقم السؤال */}
            <div className="space-y-2">
              <div className="flex justify-between items-baseline gap-3">
                <span className="tag">كويز {topic}</span>
                <span className="mono ltr-num tnum text-ink-soft">
                  {currentQ + 1} / {questions.length}
                </span>
              </div>
              <div className="meter">
                <motion.div
                  className="meter-fill bg-ink"
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={currentQ}
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                <h3 className="h3">{questions[currentQ].question}</h3>
                <div className="space-y-2">
                  {questions[currentQ].options.map((opt, i) => {
                    const isSelected = selectedOption === i;
                    const isCorrect = i === questions[currentQ].correctIndex;
                    // الصح أخضر والغلط أحمر — بعد الاختيار بس
                    let style = "bg-paper border-rule text-ink hover:border-ink-soft hover:bg-paper-3";
                    if (selectedOption !== null) {
                      if (isCorrect) style = "bg-emerald-950 border-emerald-500 text-emerald-400";
                      else if (isSelected) style = "bg-red-950 border-red-500 text-red-500";
                      else style = "bg-paper border-rule text-ink-soft opacity-60";
                    }
                    return (
                      <button
                        key={i}
                        onClick={() => handleAnswer(i)}
                        disabled={selectedOption !== null}
                        className={`w-full text-right p-3.5 rounded-[var(--r-sm)] border text-xs font-bold transition ${style}`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        )}

        {phase === "result" && (
          <div className="py-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="eyebrow eyebrow-flush mb-1.5">نتيجة الكويز</p>
                <h2 className="h2">
                  {accuracy >= 80 ? "أداء ممتاز" : accuracy >= 50 ? "كويس، كمّل" : "محتاج مراجعة"}
                </h2>
              </div>
              <span
                className={`stamp ${accuracy >= 50 ? "bg-emerald-500 text-onmarker" : "bg-red-500 text-ondanger"}`}
                aria-hidden="true"
              >
                <span className="text-lg leading-none font-bold">{accuracy >= 50 ? "✓" : "✕"}</span>
                <span className="mono text-[9px]">{accuracy}%</span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-paper rounded-[var(--r-sm)] p-4">
                <p className="tag mb-1.5">إجابات صحيحة</p>
                <p className="ltr-num font-display font-extrabold text-2xl text-ink leading-none tnum m-0">
                  {correctCount} / {questions.length}
                </p>
              </div>
              <div className="bg-paper rounded-[var(--r-sm)] p-4">
                <p className="tag mb-1.5">المكسب</p>
                <p className="ltr-num font-display font-extrabold text-2xl text-ink leading-none tnum m-0">
                  {isGuest ? "—" : `+${xpEarned}`}
                  {!isGuest && <span className="text-sm font-bold text-ink-soft"> XP</span>}
                </p>
              </div>
            </div>

            {/* حالة التسجيل */}
            {isGuest ? (
              <div className="notice">
                <p className="m-0 text-[11px] leading-relaxed">
                  دي كانت جولة تمرين. سجّل حساب عشان نتيجتك تتحسب في المسابقة وتنافس على الصدارة.
                </p>
              </div>
            ) : submitState === "saving" ? (
              <p className="tag">بيتم تسجيل نتيجتك…</p>
            ) : submitState === "saved" ? (
              isNewBest ? (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-[var(--r-sm)] p-4 bg-emerald-950 border border-emerald-500"
                >
                  <p className="text-sm font-bold text-emerald-400 m-0">🎯 رقم قياسي جديد ليك الأسبوع ده</p>
                </motion.div>
              ) : (
                <p className="tag">اتسجّلت. أحسن نتيجة ليك الأسبوع ده لسه متصدّرة.</p>
              )
            ) : submitState === "error" ? (
              <div className="notice notice-error">
                <p className="m-0">تعذّر تسجيل النتيجة. ممكن تجرّب تاني.</p>
              </div>
            ) : null}

            {xpEarned === 0 && submitState === "saved" && (
              <p className="mono text-ink-soft leading-relaxed">
                وصلت لسقف الـ XP اليومي من الكويز — نتيجتك في المسابقة اتسجّلت برضه.
              </p>
            )}

            <div className="flex gap-2">
              <button onClick={handleRetry} className="btn btn-marker flex-1 text-sm">
                العب تاني
              </button>
              <button onClick={onClose} className="btn btn-quiet flex-1 text-sm">
                تمام
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
