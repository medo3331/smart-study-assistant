"use client";

import { useEffect, useState } from "react";
import { useAuthUser } from "@/app/dashboard/components/use-page-data";
import { drawQuizRound, type QuizQuestion } from "@/lib/games/quiz-bank";

type Quiz = { question: string; attempts_left: number; solved: boolean; subject: string };

/**
 * 🏃 Quiz Rush — أسئلة واقعية ومهمة:
 *   ١) الأول: سؤال من خطة مذاكرتك الحقيقية (daily_break_quiz — بيتحقق على السيرفر
 *      وبيكسب مكافأة لما تجاوب صح).
 *   ٢) لو سؤال الخطة مش متاح: بنك أسئلة عامة (رياضة/فيزياء/أحياء/English…)
 *      بأسئلة حقيقية متعددة الاختيار — للتسلية والتدريب بدون مكافأة كوينز.
 */
export default function QuizRush() {
  const { supabase, session } = useAuthUser();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [planFailed, setPlanFailed] = useState(false);
  const [fallback, setFallback] = useState<QuizQuestion[] | null>(null);
  const [fbIndex, setFbIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);

  useEffect(() => {
    if (!supabase || session.status !== "ready") return;
    void supabase.rpc("daily_break_quiz").then(({ data, error }) => {
      if (error || !data) setPlanFailed(true);
      else {
        const q = (Array.isArray(data) ? data[0] : data) as Quiz;
        if (q?.question) setQuiz(q);
        else setPlanFailed(true);
      }
    });
  }, [supabase, session]);

  const startFallback = () => setFallback(drawQuizRound(6));

  const submit = async () => {
    const { data, error } = await supabase.rpc("answer_break_quiz", { p_answer: answer });
    const row = Array.isArray(data) ? data[0] : data;
    setNote(error?.message ?? row?.message ?? "تم");
    setFeedback(error ? null : row?.correct ? "correct" : "wrong");
    setAnswer("");
    if (!error) {
      void supabase.rpc("daily_break_quiz").then(({ data }) => setQuiz((Array.isArray(data) ? data[0] : data) as Quiz));
      if (row?.correct) {
        void supabase.rpc("claim_break_game", { p_game: "quiz" }).then(({ data: c }) => {
          const crow = Array.isArray(c) ? c[0] : c;
          if (crow?.message) setNote(crow.message);
        });
      }
    }
  };

  const answerChoice = (i: number) => {
    const q = fallback![fbIndex];
    setFeedback(i === q.correct ? "correct" : "wrong");
    setTimeout(() => {
      setFeedback(null);
      setFbIndex((idx) => (idx + 1) % fallback!.length);
    }, 900);
  };

  // أسئلة الخطة الدراسية — الحقيقي المُكافأ
  if (!planFailed && (quiz || !fallback)) {
    return (
      <section className="sheet-card space-y-3 p-5">
        <h2 className="h3">🏃 Quiz Rush</h2>
        {quiz ? (
          <>
            <p className="tag">📚 {quiz.subject} · محاولات: {quiz.attempts_left} · مكافأة على الإجابة الصحيحة 🪙</p>
            <p className="text-sm text-ink">{quiz.question}</p>
            {!quiz.solved && (
              <div className="flex gap-2">
                <input
                  className="field"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="اكتب الإجابة"
                  onKeyDown={(e) => e.key === "Enter" && void submit()}
                />
                <button className="btn btn-marker text-sm" onClick={() => void submit()}>تحقق</button>
              </div>
            )}
            {feedback && (
              <p className={`text-sm font-bold ${feedback === "correct" ? "text-marker" : "text-red-600"}`}>
                {feedback === "correct" ? "✅ إجابة صح!" : "❌ غلط — جرب تاني"}
              </p>
            )}
            {note && <p className="text-xs text-ink-soft">{note}</p>}
          </>
        ) : (
          <p className="text-sm text-ink-soft">بيجهّز سؤال من خطتك…</p>
        )}
      </section>
    );
  }

  // بنك الأسئلة العامة — واقعية بدون مكافأة
  return (
    <section className="sheet-card space-y-3 p-5">
      <h2 className="h3">🏃 Quiz Rush — بنك أسئلة عامة</h2>
      {!fallback ? (
        <>
          <p className="text-sm text-ink-soft">سؤال خطتك مش متجهز النهارده — عايز تلعب على أسئلة عامة (بدون مكافأة كوينز)؟</p>
          <button className="btn btn-marker text-sm" onClick={startFallback}>ابدأ الأسئلة العامة</button>
        </>
      ) : (
        <>
          <p className="tag">📚 {fallback[fbIndex].subject} · سؤال {fbIndex + 1} من {fallback.length} · للتدريب فقط</p>
          <p className="text-sm font-medium text-ink">{fallback[fbIndex].q}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {fallback[fbIndex].choices.map((choice, i) => (
              <button
                key={i}
                className={`btn text-sm ${feedback === null ? "btn-quiet" : i === fallback[fbIndex].correct ? "btn-marker" : "btn-quiet opacity-50"}`}
                onClick={() => feedback === null && answerChoice(i)}
              >
                {choice}
              </button>
            ))}
          </div>
          {feedback === "correct" && <p className="text-sm font-bold text-marker">✅ صح — إجابة ذكية!</p>}
          {feedback === "wrong" && <p className="text-sm font-bold text-red-600">❌ الصح: {fallback[fbIndex].choices[fallback[fbIndex].correct]}</p>}
        </>
      )}
    </section>
  );
}
