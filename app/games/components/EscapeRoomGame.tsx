"use client";

/* eslint-disable react-hooks/set-state-in-effect -- Syncing with external system is intentional */
import { useEffect, useState } from "react";
import { DataNotice, LoadingSheets } from "@/app/dashboard/components/PageShell";
import { useAuthUser } from "@/app/dashboard/components/use-page-data";

type Room = { step: number; subject: string; question: string | null; hint: string | null; attempts_left: number; solved: boolean; studied: boolean };

/**
 * 🚪 غرفة الهروب — ٣ ألغاز متسلسلة (منطق /escape-room نفسه حرفيًا —
 * سيرفر-أوثوريتيتيف عبر escape_room_status / solve_escape_step).
 */
export default function EscapeRoomGame() {
  const { supabase, session } = useAuthUser();
  const [room, setRoom] = useState<Room | null>(null);
  const [answer, setAnswer] = useState("");
  const [note, setNote] = useState("");
  const [started] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);

  const load = async () => {
    const { data, error } = await supabase.rpc("escape_room_status");
    if (error) {
      setNote(`غرفة الهروب غير مفعّلة: ${error.message.split("\n")[0]}.`);
      return;
    }
    setRoom((Array.isArray(data) ? data[0] : data) as Room);
  };

  useEffect(() => { if (session.status === "ready") void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [session.status]);

  useEffect(() => {
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [started]);

  const solve = async () => {
    const { data, error } = await supabase.rpc("solve_escape_step", { p_answer: answer });
    const row = Array.isArray(data) ? data[0] : data;
    setNote(error?.message ?? row?.message ?? "تم");
    setAnswer("");
    if (!error) void load();
  };

  if (session.status === "loading" || (!room && !note)) {
    return <LoadingSheets count={2} />;
  }

  return (
    <section className="space-y-3">
      {note && <DataNotice message={note} />}
      {room && (
        <article className="sheet-card space-y-5 p-6">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="tag">📚 {room.subject}</span>
            <span className="tag">اللغز {Math.min(room.step, 3)} من ٣</span>
            <span className="tag">⏱ {elapsed}ث</span>
          </div>
          {room.solved ? (
            <>
              <h2 className="h2">🎉 فتحت باب الخروج</h2>
              <p className="text-ink-soft">أنهيت مراجعة مسار «{room.subject}». ارجع بكرة لغرفة جديدة.</p>
            </>
          ) : (
            <>
              <h2 className="h2">{room.question}</h2>
              <p className="text-sm text-ink-soft">تلميح: {room.hint} · المحاولات المتبقية: {room.attempts_left}</p>
              <div className="flex flex-wrap gap-2">
                <input className="field flex-1" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="اكتب الحل" />
                <button className="btn btn-marker text-sm" onClick={() => void solve()}>افتح الباب</button>
              </div>
              {note && <p className="text-xs text-ink-soft">{note}</p>}
            </>
          )}
        </article>
      )}
    </section>
  );
}
