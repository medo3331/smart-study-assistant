"use client";

import { useEffect, useState } from "react";
import { useAuthUser } from "@/app/dashboard/components/use-page-data";

type Quiz = { question: string; attempts_left: number; solved: boolean; subject: string };

/** 🏃 Quiz Rush — سؤال سريع من خطة الطالب (من Break Zone، نفس عقد السيرفر) */
export default function QuizRush() {
  const { supabase, session } = useAuthUser();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answer, setAnswer] = useState("");
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!supabase || session.status !== "ready") return;
    void supabase.rpc("daily_break_quiz").then(({ data, error }) => {
      if (error) setFailed(true);
      else setQuiz((Array.isArray(data) ? data[0] : data) as Quiz);
    });
  }, [supabase, session]);

  const submit = async () => {
    const { data, error } = await supabase.rpc("answer_break_quiz", { p_answer: answer });
    const row = Array.isArray(data) ? data[0] : data;
    setNote(error?.message ?? row?.message ?? "تم");
    setAnswer("");
    if (!error) {
      void supabase.rpc("daily_break_quiz").then(({ data }) => setQuiz((Array.isArray(data) ? data[0] : data) as Quiz));
      if (row?.correct) void supabase.rpc("claim_break_game", { p_game: "quiz" }).then(({ data: c }) => {
        const crow = Array.isArray(c) ? c[0] : c;
        if (crow?.message) setNote(crow.message);
      });
    }
  };

  if (failed) return null; // السيرفر مش جاهز — من غير وعود

  return (
    <section className="sheet-card space-y-3 p-5">
      <h2 className="h3">🏃 Quiz Rush</h2>
      {quiz ? (
        <>
          <p className="tag">📚 {quiz.subject} · محاولات: {quiz.attempts_left}</p>
          <p className="text-sm text-ink">{quiz.question}</p>
          {!quiz.solved && (
            <div className="flex gap-2">
              <input className="field" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="اكتب الإجابة" />
              <button className="btn btn-marker text-sm" onClick={() => void submit()}>تحقق</button>
            </div>
          )}
          {note && <p className="text-xs text-ink-soft">{note}</p>}
        </>
      ) : (
        <p className="text-sm text-ink-soft">بيجهّز سؤال من خطتك…</p>
      )}
    </section>
  );
}
