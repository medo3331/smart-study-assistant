"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ⚽ جول ولا لا؟ — ركلات ترجيح بمنظور الحارس.
 *
 * الكورة بتطير من نقطة الجزاء للزاوية اللي اخترتها (انزياح + تصغير = عمق)،
 * والحارس بينط على زاوية عشوائية. الكورة في الشبكة = جول، الحارس وصلها = تصدّي.
 * ٣ جول متتالية = مكافأة عبر claim_break_game('penalty') — سيرفر-أوثوريتيتيف.
 */

type Corner = "left" | "center" | "right";
type Phase = "aim" | "flying" | "result";
type Ball = { left: number; top: number; scale: number };

/** مواضع الكورة (٪ من الملعب) — البداية نقطة الجزاء، والنهاية جوه الشبكة */
const SPOT: Ball = { left: 50, top: 82, scale: 1 };
const TARGET: Record<Corner, Ball> = {
  left: { left: 22, top: 38, scale: 0.55 },
  center: { left: 50, top: 30, scale: 0.5 },
  right: { left: 78, top: 38, scale: 0.55 },
};
const KEEPERS: Record<Corner, { left: number; rotate: number }> = {
  left: { left: 24, rotate: -38 },
  center: { left: 50, rotate: 0 },
  right: { left: 76, rotate: 38 },
};
const CORNERS: { id: Corner; label: string }[] = [
  { id: "right", label: "يمين ➡️" },
  { id: "center", label: "وسط ⬆️" },
  { id: "left", label: "يسار ⬅️" },
];

export default function PenaltyShootout({ onWin }: { onWin: (game: "penalty") => Promise<void> }) {
  const [phase, setPhase] = useState<Phase>("aim");
  const [ball, setBall] = useState<Ball>(SPOT);
  const [keeper, setKeeper] = useState(KEEPERS.center);
  const [streak, setStreak] = useState(0);
  const [result, setResult] = useState<"goal" | "saved" | null>(null);
  const timers = useRef<number[]>([]);

  // تنظيف كل المؤقتات لو المكون اترحل
  useEffect(() => () => { for (const t of timers.current) window.clearTimeout(t); }, []);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };

  const shoot = (corner: Corner) => {
    if (phase !== "aim") return;
    const keeperCorner = (["left", "center", "right"] as const)[Math.floor(Math.random() * 3)];
    const scored = corner !== keeperCorner;

    // الحارس بينط — والكورة بتطير في نفس اللحظة
    setPhase("flying");
    setKeeper(KEEPERS[keeperCorner]);
    setBall(TARGET[corner]);

    later(() => {
      if (scored) {
        // الكورة في الشبكة — بتكمل شوية لجوه
        setResult("goal");
        setPhase("result");
        setBall({ ...TARGET[corner], top: TARGET[corner].top - 6, scale: TARGET[corner].scale - 0.08 });
        const next = streak + 1;
        setStreak(next);
        later(() => {
          setBall(SPOT);
          setKeeper(KEEPERS.center);
          setResult(null);
          setPhase("aim");
          if (next >= 3) { setStreak(0); void onWin("penalty"); }
        }, 1000);
      } else {
        // تصدّي — الكورة بترجع من الحارس
        setResult("saved");
        setPhase("result");
        setStreak(0);
        later(() => setBall(SPOT), 350);
        later(() => {
          setKeeper(KEEPERS.center);
          setResult(null);
          setPhase("aim");
        }, 1000);
      }
    }, 700);
  };

  const inFlight = phase === "flying";

  return (
    <section className="sheet-card space-y-3 p-5">
      <h2 className="h3">⚽ جول ولا لا؟</h2>
      <p className="text-sm text-ink-soft">اختار زاويتك — سجّل ٣ جول متتاليين في مرمى الحارس وخد مكافأتك 🪙</p>

      {streak > 0 && phase === "aim" && <p className="tag">🔥 هاتريك قريب: {streak}/3</p>}

      {/* الملعب — منظور من نقطة الجزاء */}
      <div className="relative h-64 w-full overflow-hidden rounded-xl border border-rule bg-gradient-to-b from-[#2e7d32] via-[#388e3c] to-[#43a047]" dir="ltr">
        {/* قوس المنطقة + خط الجزاء */}
        <div className="absolute left-1/2 top-full h-16 w-56 -translate-x-1/2 -translate-y-1 rounded-t-full border-2 border-white/25" />
        <div className="absolute left-0 top-3 h-px w-full bg-white/20" />

        {/* المرمى — إطار + شبكة */}
        <div
          className="absolute left-[10%] right-[10%] top-[12%] h-[48%] rounded-sm border-4 border-white/90"
          style={{
            background:
              "repeating-linear-gradient(0deg, rgba(255,255,255,0.28) 0 1px, transparent 1px 12px), repeating-linear-gradient(90deg, rgba(255,255,255,0.28) 0 1px, transparent 1px 12px)",
          }}
        >
          {result === "goal" && (
            <div className="absolute inset-0 rounded-sm bg-marker/20 transition-opacity" />
          )}
        </div>

        {/* الحارس — بينط على الزاوية */}
        <div
          className="absolute z-10 text-3xl transition-all duration-500 ease-out"
          style={{
            left: `${keeper.left}%`,
            top: "42%",
            transform: `translate(-50%, -50%) rotate(${keeper.rotate}deg)`,
          }}
        >
          🧤
        </div>

        {/* الكورة — بتطير من نقطة الجزاء للزاوية */}
        <div
          className="absolute z-20 text-2xl transition-all duration-700 ease-out"
          style={{
            left: `${ball.left}%`,
            top: `${ball.top}%`,
            transform: `translate(-50%, -50%) scale(${ball.scale})`,
          }}
        >
          ⚽
        </div>

        {/* نقطة الجزاء */}
        <div className="absolute left-1/2 top-[82%] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60" />

        {/* النتيجة لحظية */}
        {phase === "result" && (
          <div className="absolute inset-x-0 top-1/2 z-30 -translate-y-1/2 text-center">
            <span className={`inline-block rounded-full bg-paper/95 px-4 py-1.5 text-lg font-extrabold shadow ${result === "goal" ? "text-marker" : "text-ink"}`}>
              {result === "goal" ? "جول! ⚽" : "الحارس تصدى! 🧤"}
            </span>
          </div>
        )}
      </div>

      {/* أزرار التسديد */}
      <div className="flex gap-2">
        {CORNERS.map((c) => (
          <button
            key={c.id}
            className="btn btn-quiet flex-1 text-sm"
            onClick={() => shoot(c.id)}
            disabled={inFlight}
          >
            {c.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-ink-soft">الحارس بينط عشوائي — غيّر زاويتك كل مرة 🧠</p>
    </section>
  );
}
