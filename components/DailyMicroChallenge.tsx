"use client";

import { useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Zap, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/* Phase 0.1 — Daily Micro-Challenge (reuses existing DB systems; zero new schema)
   Content: supabase.rpc('daily_break_riddle') -> existing break_riddles / break_riddle_sessions
   Validation+reward: supabase.rpc('answer_break_riddle') -> server validates answer (security definer),
     marks solved, updates profiles.xp + coin_ledger directly on server (no client mutation).
   Daily uniqueness enforced by break_riddle_sessions PK (user_id, day) + solved_at timestamp.
   No claim_daily_mission('riddle') called — that is a SEPARATE daily-mission reward (5 coins + 10 XP)
     that would double-reward the same user action.
*/
export function DailyMicroChallenge() {
  const reduceMotion = useReducedMotion();
  const supabase = createClient();
  const [riddle, setRiddle] = useState<{ question: string; hint: string; solved?: boolean; attempts_left?: number } | null>(null);
  const [answer, setAnswer] = useState("");
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const { data, error } = await supabase.rpc("daily_break_riddle");
        if (!mounted) return;
        if (error) { setMsg("تعذّر تحميل التحدي — حاول لاحقًا."); setLoading(false); return; }
        const row = Array.isArray(data) ? data[0] : data;
        setRiddle((row ? { question: String(row.question ?? ""), hint: String(row.hint ?? ""), solved: !!row.solved, attempts_left: Number(row.attempts_left ?? 0) } : null));
        setDone(!!(row?.solved));
      } catch {
        if (mounted) setMsg("خطأ في التحميل.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [supabase]);

  const submit = async () => {
    if (!riddle || done || !answer.trim()) return;
    try {
      // Phase 0.1 security: server validates + marks solved + awards XP/coins in ONE RPC.
      // answer_break_riddle updates break_riddle_sessions.solved_at, coin_ledger, profiles.xp.
      // Do NOT also call claim_daily_mission('riddle') — that awards a SEPARATE daily-mission
      // reward (5 coins + 10 XP) and would double-reward for the same event.
      const { data: ansData, error: ansError } = await supabase.rpc("answer_break_riddle", { p_answer: answer.trim() });
      const ansRow = Array.isArray(ansData) ? ansData[0] : ansData;
      if (ansError) { setMsg(ansError.message ?? "تعذّر التحقق — حاول مرة أخرى."); return; }
      // REAL contract from db/break-zone.sql:
      // returns table(correct boolean, attempts_left int, coins int, xp int, message text)
      const correct = !!(ansRow?.correct === true || ansRow?.correct === 't');
      if (!correct) { setMsg("إجابة غير دقيقة — حاول مرة أخرى." + (ansRow?.message ? (` (${String(ansRow.message)})`) : "")); return; }
      // Verified proof + server-side solved + server-side XP/coins awarded.
      setDone(true); setMsg(String(ansRow?.message ?? "صحيح! 💙")); setAnswer("");
    } catch {
      setMsg("تعذّر التحقق — حاول مرة أخرى.");
    }
  };

  if (loading) {
    return (
      <section className="rounded-[24px] border backdrop-blur-xl p-5" style={{ backgroundColor: "var(--card-primary)", borderColor: "var(--rule)", boxShadow: "0 8px 30px var(--shade)" }} aria-label="التحدي اليومي — جارٍ التحميل">
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
          <Zap size={14} aria-hidden /> <span>جارٍ تحميل التحدي اليومي…</span>
        </div>
      </section>
    );
  }

  if (!riddle) {
    return (
      <section className="rounded-[24px] border backdrop-blur-xl p-5" style={{ backgroundColor: "var(--card-primary)", borderColor: "var(--rule)", boxShadow: "0 8px 30px var(--shade)" }} aria-label="التحدي اليومي — غير متوفر">
        <h3 className="font-bold" style={{ color: "var(--text)" }}>⚡ التحدي اليومي</h3>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{msg || "التحدي غير متوفر الآن — حاول لاحقًا."}</p>
      </section>
    );
  }

  return (
    <motion.section
      aria-label={done ? "التحدي اليومي — مكتمل" : "التحدي اليومي"}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 0.8, 0.36, 1], delay: 0.05 }}
      className="relative overflow-hidden rounded-[24px] border backdrop-blur-xl p-5 sm:p-6"
      style={{ backgroundColor: "var(--card-primary)", borderColor: "var(--rule)", boxShadow: "0 8px 30px var(--shade)" }}
    >
      <div aria-hidden className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(to left, transparent, var(--accent), transparent)", opacity: 0.6 }} />
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-bold text-base" style={{ color: "var(--text)" }} dir="rtl">⚡ التحدي اليومي</h3>
        <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent-highlight)" }} aria-label="مكافأة التحدي">+١٠ XP • +٥ كوين</span>
      </div>

      <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>سؤال سريع — أقل من 5 دقائق</p>

      {!done ? (
        <>
          <div className="rounded-xl px-3 py-3 mb-3" style={{ backgroundColor: "var(--card-secondary)", border: "1px solid var(--rule)" }}>
            <p className="font-semibold text-sm leading-7 mb-1" style={{ color: "var(--text)" }}>{riddle.question}</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>💡 {riddle.hint}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 items-stretch">
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="أجب هنا…"
              aria-label="إجابة التحدي"
              className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none focus:outline-2 focus:outline-offset-2"
              style={{ backgroundColor: "var(--card-secondary)", border: "1px solid var(--rule)", color: "var(--text)", outlineColor: "var(--accent)" }}
            />
            <button
              type="button"
              onClick={submit}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ backgroundColor: "var(--accent)", color: "var(--on-marker)", outlineColor: "var(--accent)" }}
              aria-label="تحقق من الإجابة"
            >
              <Zap size={16} aria-hidden /> تحقق
            </button>
          </div>
        </>
      ) : (
        <div className="rounded-xl px-3 py-3 flex items-center gap-3" style={{ backgroundColor: "color-mix(in srgb, #15803d 10%, transparent)", border: "1px solid #15803d" }} aria-label="التحدي مكتمل">
          <CheckCircle2 size={22} style={{ color: "#15803d" }} aria-hidden />
          <div>
            <p className="font-semibold text-sm" style={{ color: "#15803d" }}>مكتمل اليوم — ممتاز! 💙</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>{msg || "+١٠ XP • +٥ كوين"}</p>
          </div>
        </div>
      )}

      {msg && !done && (
        <p className="mt-2 text-xs" style={{ color: msg.includes("ممتاز") || msg.includes("تمت") ? "#15803d" : "#b45309" }} aria-live="polite">{msg}</p>
      )}
    </motion.section>
  );
}
