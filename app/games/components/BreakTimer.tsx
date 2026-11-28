"use client";

import { useEffect, useState } from "react";

/** ☕ مؤقت الاستراحة — ٥ دقايق افتراضية (من Break Zone القديمة، نفس السلوك) */
export default function BreakTimer() {
  const [seconds, setSeconds] = useState(300);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running || seconds === 0) {
      if (running && seconds === 0) setRunning(false);
      return;
    }
    const id = window.setInterval(() => setSeconds((v) => v - 1), 1000);
    return () => window.clearInterval(id);
  }, [running, seconds]);

  return (
    <section className="sheet-card space-y-3 p-5">
      <h2 className="h3">☕ مؤقت الاستراحة</h2>
      <p className="text-3xl font-display ltr-num">
        {String(Math.max(0, Math.floor(seconds / 60))).padStart(2, "0")}:{String(Math.max(0, seconds % 60)).padStart(2, "0")}
      </p>
      <div className="flex gap-2">
        <button className="btn btn-marker text-sm" onClick={() => setRunning((v) => !v)}>
          {running ? "إيقاف" : "ابدأ ٥ دقائق"}
        </button>
        <button className="btn btn-quiet text-sm" onClick={() => { setRunning(false); setSeconds(300); }}>
          إعادة
        </button>
      </div>
    </section>
  );
}
