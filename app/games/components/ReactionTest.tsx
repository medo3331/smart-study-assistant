"use client";

import { useEffect, useRef, useState } from "react";

/** ⚡ Reaction Test — سرعة بديهة (من Break Zone، نفس عقد claim_break_game) */
export default function ReactionTest({ onWin }: { onWin: (game: "reaction") => Promise<void> }) {
  const [reaction, setReaction] = useState<"idle" | "wait" | "go">("idle");
  const [note, setNote] = useState("");
  const started = useRef(0);
  const timer = useRef<number | null>(null);

  // تنظيف التايمر لو المكون اترحل
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  const start = () => {
    setReaction("wait");
    timer.current = window.setTimeout(() => {
      setReaction("go");
      started.current = performance.now();
    }, 1200 + Math.random() * 1800);
  };

  const tap = () => {
    if (reaction !== "go") return;
    const ms = Math.round(performance.now() - started.current);
    setNote(`رد فعلك ${ms}ms`);
    setReaction("idle");
    void onWin("reaction");
  };

  return (
    <section className="sheet-card space-y-3 p-5">
      <h2 className="h3">⚡ Reaction Test</h2>
      <p className="text-sm text-ink-soft">اضغط ابدأ، ثم اضغط فور ظهور «الآن».</p>
      <button
        className={`btn text-sm ${reaction === "go" ? "btn-marker" : "btn-quiet"}`}
        onClick={() => (reaction === "idle" ? start() : tap())}
      >
        {reaction === "go" ? "الآن!" : reaction === "wait" ? "استعد…" : "ابدأ الاختبار"}
      </button>
      {note && <p className="text-xs text-ink-soft">{note}</p>}
    </section>
  );
}
