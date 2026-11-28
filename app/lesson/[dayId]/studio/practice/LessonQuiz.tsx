"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- نقل محايد من page.tsx (نفس إعدادات التايبينج) */

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { awardCoins } from "@/lib/shop/shop-data";
import { Reveal } from "../../components/LessonChrome";

/**
 * P1-1 — قسم الاختبار المنقول حرفيًا من page.tsx (نقل محايد):
 * توليد → إجابة → تسليم → تصحيح سيرفري (/api/lesson-quiz/submit) →
 * إكمال (complete_study_day) + XP + كوينز (best-effort) + مودال احتفال.
 */
export default function LessonQuiz({
  dayId,
  topic,
  subject,
  description,
  xpReward,
  isCompleted,
  onComplete,
  nextDayId,
  /** رقم يوم الدرس — يظهر في مودال الاحتفال (نفس الأصل). */
  dayNumber,
  onCelebrationToggle,
}: {
  dayId: string;
  topic: string;
  subject: string;
  description: string;
  xpReward: number;
  isCompleted: boolean;
  /** بعد الإكمال — الصفحة تحدّث التقدم (النسبة والوحدة). */
  onComplete: () => void;
  /** الدرس اللي بعده — زر الاحتفال بينقلك له. */
  nextDayId: string | null;
  /** رقم يوم الدرس — يظهر في مودال الاحتفال (نفس الأصل). */
  dayNumber?: number;
  /** إظهار/إخفاء مودال الاحتفال — الـ FeedbackWidget بيتعطّل وقتها. */
  onCelebrationToggle?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  // 🧠 الاختبار الذكي
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizStarted, setQuizStarted] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  // إثبات سيرفري (D-M-04): معرّف المحاولة من التوليد — التسليم بيتصحّح في
  // /api/lesson-quiz/submit والمكافأة منه، مش من الدرجة المحلية.
  const [quizAttemptId, setQuizAttemptId] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  // ✅ مودال الاحتفال بعد إنهاء الدرس بنجاح
  const [showCelebration, setShowCelebration] = useState(false);
  /* 🪙 الكوينز اللي اتكسبت من الدرس ده. صفر = ماحصلش (سقف يومي، أو جداول
     المتجر لسه ما اتعملتش) — والاحتفال ساعتها بيعدّي من غير ما يذكرها. */
  const [coinsWon, setCoinsWon] = useState(0);

  const setShowCelebrationAndNotify = (open: boolean) => {
    setShowCelebration(open);
    onCelebrationToggle?.(open);
  };

  // 🧠 توليد اختبار ذكي عبر الـ AI
  const handleStartQuiz = async () => {
    setQuizLoading(true);
    setQuizSubmitted(false);
    setQuizScore(0);
    setQuizAttemptId(null);
    setSelectedAnswers([]);

    try {
      const response = await fetch("/api/lesson-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayId,
          topic,
          subject,
          description,
          count: 4,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || "فشل توليد الاختبار");
      const parsed: QuizQuestion[] = data?.questions || [];
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("empty");
      setQuizQuestions(parsed);
      setQuizAttemptId(typeof data?.attemptId === "string" ? data.attemptId : null);
      setSelectedAnswers(new Array(parsed.length).fill(-1));
      setQuizStarted(true);
    } catch {
      setQuizQuestions([]);
      setQuizStarted(false);
      alert("حصل خطأ أثناء توليد الاختبار، حاول تاني.");
    } finally {
      setQuizLoading(false);
    }
  };

  const handleSelectAnswer = (qIndex: number, optIndex: number) => {
    if (quizSubmitted) return;
    setSelectedAnswers((prev) => {
      const next = [...prev];
      next[qIndex] = optIndex;
      return next;
    });
  };

  const handleSubmitQuiz = () => {
    if (quizSubmitted) return;
    let correct = 0;
    quizQuestions.forEach((q, i) => {
      if (selectedAnswers[i] === q.correctIndex) correct++;
    });
    setQuizScore(correct);
    setQuizSubmitted(true);

    // التصحيح الرسمي على السيرفر (D-M-04) — الدرجة المحلية عرض مؤقت،
    // ولو السيرفر اختلف بنأخذ درجته. المكافأة صامتة الفشل: الاختبار
    // شغّال حتى لو جداول الاقتصاد لسه مش متطبقة.
    if (!quizAttemptId) return;
    void (async () => {
      try {
        const res = await fetch("/api/lesson-quiz/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attemptId: quizAttemptId, answers: selectedAnswers }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) return;
        if (typeof data.score === "number") setQuizScore(data.score);
        if (typeof data.awarded === "number" && data.awarded > 0) setCoinsWon(data.awarded);
      } catch (err) {
        console.warn("lesson-quiz submit failed (متجاهَل):", err);
      }
    })();
  };

  const passThreshold = Math.ceil(quizQuestions.length * 0.6);
  const quizPassed = quizSubmitted && quizScore >= passThreshold;

  // 🏁 إنهاء الدرس رسميًا بعد نجاح الاختبار: يعلّم الدرس كمكتمل + يضيف XP + يسجل نشاط اليوم
  // بعد النجاح بيظهر مودال احتفال (🎉 أحسنت! + XP + زر الدرس التالي).
  const handleCompleteLesson = async () => {
    if (completing) return;
    setCompleting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Phase C: مسار موحد — إكمال اليوم + XP + Coins في معاملة واحدة validated
    const { data, error } = await supabase.rpc("complete_study_day", { p_day_id: dayId });

    if (error) {
      // fallback للتوافق مع DB قديمة لم تُطبق Phase C بعد
      console.warn("complete_study_day failed — fallback to legacy:", error.message);
      await supabase.from("study_days").update({ is_completed: true }).eq("id", dayId);
      const { error: xpError } = await supabase.rpc("increment_xp", { p_delta: xpReward });
      if (xpError) {
        console.warn("increment_xp fallback failed:", xpError.message);
        // قراءة الـ XP الحالي لحظة الـ fallback — بديل profileXp من الصفحة.
        const { data: profile } = await supabase.from("profiles").select("xp").eq("id", user?.id ?? "").maybeSingle();
        await supabase.from("profiles").update({ xp: ((profile as { xp?: number } | null)?.xp || 0) + xpReward }).eq("id", user?.id ?? "");
      }
      try {
        const res = await awardCoins(supabase, "day_done", dayId);
        if (res.data && res.data.awarded > 0) setCoinsWon(res.data.awarded);
      } catch (err) {
        console.error("award day_done failed (متجاهَل):", err);
      }
    } else {
      const row: any = Array.isArray(data) ? data[0] : data;
      const coinsAwarded = row?.coins_awarded ?? 0;
      if (coinsAwarded > 0) setCoinsWon(coinsAwarded);
      // XP بيحتسبه السيرفر جوه complete_study_day — الصفحة كانت تعرضه من profileXp،
      // ودلوقتي مكانه state المحلّي في مكوّن الاحتفال نفسه (نقل محايد للمنطق).
      // لو اليوم كان مكتملاً بالفعل (idempotency)، لا نضيف XP مرة أخرى
      if (row && row.xp_awarded === 0 && isCompleted) {
        // لا شيء
      }
    }

    if (user) {
      const todayKey = new Date().toISOString().slice(0, 10);
      const { data: existingActivity } = await supabase
        .from("activity_log")
        .select("*")
        .eq("user_id", user.id)
        .eq("activity_date", todayKey)
        .maybeSingle();

      if (existingActivity) {
        await supabase
          .from("activity_log")
          .update({ tasks_completed: (existingActivity.tasks_completed || 0) + 1 })
          .eq("user_id", user.id)
          .eq("activity_date", todayKey);
      } else {
        await supabase.from("activity_log").insert({
          user_id: user.id,
          activity_date: todayKey,
          focus_minutes: 0,
          tasks_completed: 1,
        });
      }
    }

    setJustCompleted(true);
    setCompleting(false);
    setShowCelebrationAndNotify(true);
    onComplete();

    /* 🪙 كوينز المتجر — بعد كل حاجة، وفي try مستقل.
       الترتيب مقصود: الـ XP والنشاط والاحتفال كلهم خلصوا فوق. لو جداول
       المتجر لسه ما اتعملتش (db/shop.sql) النداء ده بيفشل — ولازم يفضل
       فشل صامت مايلمسش إنهاء الدرس. الكوينز إضافة على الموجود مش شرط فيه.

       ⚠️ المبلغ والسقف اليومي من السيرفر (`award_coins`)، مش من هنا —
       الكلاينت مابيبعتش رقم خالص. */
  };

  return (
    <>
      <Reveal delay={0.16}>
        <div className="sheet-card p-5 sm:p-6 space-y-4">
          {!quizStarted && !justCompleted && !isCompleted && (
            <div className="space-y-4">
              <div>
                <p className="eyebrow eyebrow-flush mb-1.5">اختبار</p>
                <h2 className="h3">جرّب نفسك في الدرس</h2>
              </div>
              <p className="text-xs text-ink-soft leading-relaxed">
                أسئلة سريعة على «{topic}». لازم تعدّيها عشان الدرس يتحسب مكتمل.
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="tag tag-quiet">
                  <span className="ltr-num tnum">5</span> دقايق
                </span>
                <span className="tag tag-quiet">
                  <span className="ltr-num tnum">+{xpReward}</span> XP
                </span>
              </div>
              <button
                onClick={handleStartQuiz}
                disabled={quizLoading}
                className="btn bg-ink text-paper-2 border-ink hover:opacity-90 text-sm w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {quizLoading ? "بيجهّز الأسئلة" : "ابدأ الاختبار"}
              </button>
            </div>
          )}

          {(isCompleted || justCompleted) && !showCelebration && (
            <div className="flex items-center gap-4">
              <div className="stamp bg-emerald-500 text-onmarker" aria-hidden>
                <span className="font-display font-extrabold text-xl leading-none">✓</span>
              </div>
              <div>
                <p className="eyebrow eyebrow-flush mb-1">مخلّص</p>
                <p className="text-sm font-bold text-ink">الدرس ده مكتمل ومتسجّل.</p>
              </div>
            </div>
          )}

          {quizStarted && !isCompleted && !justCompleted && (
            <div className="space-y-4">
              <div>
                <p className="eyebrow eyebrow-flush mb-1.5">اختبار</p>
                <h2 className="h3">
                  <span className="ltr-num tnum">{quizQuestions.length}</span> أسئلة
                </h2>
              </div>

              {quizQuestions.map((q, qIndex) => (
                <div key={qIndex} className="bg-paper border border-rule rounded-[var(--r-sm)] p-4 space-y-2.5">
                  <p className="text-xs font-bold text-ink leading-relaxed">
                    <span className="ltr-num tnum text-ink-soft me-1.5">{qIndex + 1}.</span>
                    {q.question}
                  </p>
                  <div className="grid gap-1.5">
                    {q.options.map((opt, optIndex) => {
                      const isSelected = selectedAnswers[qIndex] === optIndex;
                      const isCorrectOpt = optIndex === q.correctIndex;
                      let style = "bg-paper-2 border-rule text-ink hover:bg-paper-3";
                      if (quizSubmitted) {
                        if (isCorrectOpt) style = "bg-emerald-950 border-emerald-500 text-ink";
                        else if (isSelected && !isCorrectOpt) style = "bg-red-950 border-red-500 text-ink";
                      } else if (isSelected) {
                        style = "bg-ink border-ink text-paper-2";
                      }
                      return (
                        <button
                          key={optIndex}
                          onClick={() => handleSelectAnswer(qIndex, optIndex)}
                          disabled={quizSubmitted}
                          aria-pressed={isSelected}
                          className={`text-right px-3 py-2.5 rounded-[var(--r-sm)] text-[11.5px] font-semibold border transition ${style}`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {!quizSubmitted ? (
                <button
                  onClick={handleSubmitQuiz}
                  disabled={selectedAnswers.includes(-1)}
                  className="btn bg-ink text-paper-2 border-ink hover:opacity-90 btn-block text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  سلّم الإجابات
                </button>
              ) : (
                <div className="space-y-3">
                  <div className={`notice ${quizPassed ? "notice-ok" : "notice-error"}`}>
                    <p className="m-0 leading-relaxed">
                      نتيجتك{" "}
                      <span className="ltr-num tnum font-bold">
                        {quizScore} / {quizQuestions.length}
                      </span>{" "}
                      — {quizPassed ? "عدّيت الاختبار." : "محتاج مراجعة تانية."}
                    </p>
                  </div>

                  {quizPassed ? (
                    <button
                      onClick={handleCompleteLesson}
                      disabled={completing}
                      className="btn btn-marker btn-block text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {completing ? "بيحفظ" : `خلّص الدرس واستلم ${xpReward} XP`}
                    </button>
                  ) : (
                    <button onClick={handleStartQuiz} className="btn btn-quiet btn-block text-sm">
                      جرّب تاني بأسئلة جديدة
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </Reveal>

      {/* مودال الاحتفال: ختم "تم" على الورقة — نفس ختم الداشبورد */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/45 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 24, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ type: "spring", damping: 18, stiffness: 240 }}
              className="sheet-card sheet-card-live card-lift p-6 w-full max-w-sm space-y-5 text-center"
              dir="rtl"
            >
              <motion.div
                initial={{ scale: 0, rotate: -14 }}
                animate={{ scale: 1, rotate: -2.5 }}
                transition={{ delay: 0.12, type: "spring", stiffness: 300 }}
                className="stamp w-20 h-20 mx-auto bg-marker text-onmarker"
                aria-hidden
              >
                <span className="font-display font-extrabold text-2xl leading-none">تم</span>
                <span className="mono ltr-num text-[9px] opacity-75">+{xpReward} XP</span>
              </motion.div>

              <div>
                <p className="eyebrow eyebrow-flush justify-center mb-1.5">مخلّص</p>
                <h3 className="h3">
                  خلّصت الدرس {typeof dayNumber === "number" && <span className="ltr-num tnum">{dayNumber}</span>}
                </h3>
                <p className="text-xs text-ink-soft mt-1.5">السلسلة مستمرة. متقطعهاش بكرة.</p>

                {/* الكوينز لما تنزل بس. صفر معناها السقف اليومي خلص (أو المتجر
                    لسه مش متسطّب) — والسكوت أحسن من «+0 كوين». */}
                {coinsWon > 0 && (
                  <motion.p
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.28 }}
                    className="tag tag-quiet mt-3"
                  >
                    🪙 <span className="ltr-num tnum">+{coinsWon}</span> كوين للمتجر
                  </motion.p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {nextDayId ? (
                  <button
                    onClick={() => router.push(`/lesson/${nextDayId}`)}
                    className="btn btn-marker btn-block text-sm"
                  >
                    الدرس اللي بعده
                  </button>
                ) : (
                  <button onClick={() => router.push("/dashboard")} className="btn btn-marker btn-block text-sm">
                    خلصت الخطة — ارجع للداشبورد
                  </button>
                )}
                <button onClick={() => setShowCelebrationAndNotify(false)} className="btn btn-quiet btn-block text-sm">
                  فضّل هنا شوية
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}
