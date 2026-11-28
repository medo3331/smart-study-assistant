"use client";

import { useEffect, useState } from "react";
import { useAuthUser } from "@/app/dashboard/components/use-page-data";

type Riddle = { question: string; hint: string; attempts_left: number; solved: boolean; studied: boolean };

/** 🧩 فزورة اليوم — لغز يومي بتلميح ومحاولات (من Break Zone، نفس عقد السيرفر) */
export default function DailyRiddle() {
  const { supabase, session } = useAuthUser();
  const [riddle, setRiddle] = useState<Riddle | null>(null);
  const [answer, setAnswer] = useState("");
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!supabase || session.status !== "ready") return;
    void supabase.rpc("daily_break_riddle").then(({ data, error }) => {
      if (error) setFailed(true);
      else setRiddle((Array.isArray(data) ? data[0] : data) as Riddle);
    });
  }, [supabase, session]);

  const submit = async () => {
    const { data, error } = await supabase.rpc("answer_break_riddle", { p_answer: answer });
    const row = Array.isArray(data) ? data[0] : data;
    setNote(error ? error.message : row?.message ?? "تم");
    setAnswer("");
    if (!error) {
      void supabase.rpc("daily_break_riddle").then(({ data }) => setRiddle((Array.isArray(data) ? data[0] : data) as Riddle));
    }
  };

  if (failed) return null; // السيرفر مش جاهز — من غير وعود

  return (
    <section className="sheet-card space-y-3 p-5 md:col-span-2">
      <h2 className="h3">🧩 فزورة اليوم</h2>
      {riddle ? (
        <>
          <p>{riddle.question}</p>
          <p className="text-xs text-ink-soft">تلميح: {riddle.hint} · محاولات: {riddle.attempts_left}</p>
          {!riddle.solved && (
            <div className="flex gap-2">
              <input className="field" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="إجابتك" />
              <button className="btn btn-marker text-sm" onClick={submit}>حل</button>
            </div>
          )}
          {note && <p className="text-xs text-ink-soft">{note}</p>}
        </>
      ) : (
        <p className="text-sm text-ink-soft">بيحمّل الفزورة…</p>
      )}
    </section>
  );
}
