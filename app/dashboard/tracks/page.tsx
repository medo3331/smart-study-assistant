"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Timer loop is intentional */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Play, Pause, RotateCcw, Coffee, Brain } from "lucide-react";
import { SoundLibrary } from "../components/SoundLibrary";
import type { ThemeStyles } from "../components/types";
import { THEME_STYLES } from "../components/theme-helpers";
import { useTheme } from "@/theme/ThemeProvider";
import type { ThemeColor } from "../components/types";

/* ==========================================================================
   التريكز — /dashboard/tracks

   المكان الجديد للمكتبة الصوتية (موسيقى + صوتيات المستخدم) بعد ما طلعت
   من درج الإعدادات. جنبها مؤقّت المذاكرة (جلسة تركيز ٢٥ دقيقة + استراحة
   ٥ دقايق — بومودورو) عشان الشغلانة واحدة: تختار التراك وتبدأ الجلسة.

   🗓️ القرآن مش هنا — انتقل لصفحة العبادات (/worship/quran) مكانه
   الطبيعي جنب الورد والقرّاء.
   ========================================================================== */

const FOCUS_SECONDS = 25 * 60;
const BREAK_SECONDS = 5 * 60;

type Phase = "focus" | "break";

function formatTime(total: number): string {
  const m = Math.floor(Math.max(0, total) / 60);
  const s = Math.max(0, total) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function TracksPage() {
  const { theme } = useTheme();
  /* لون الفسفوري للوحة المختارة — من نفس مصدر الداشبورد (THEME_STYLES).
     الـ ThemeId بتاع data-theme مش هو نفسه لون الفسفوري؛ بنقرب على
     الافتراضي أصفر لو القيمة مش من الألوان الأربعة المعروفة. */
  const known = (theme as string) in THEME_STYLES;
  const themeStyles: ThemeStyles = known
    ? THEME_STYLES[theme as ThemeColor]
    : THEME_STYLES.amber;

  /* ---------- مؤقّت المذاكرة (بومودورو 25/5) ---------- */
  const [phase, setPhase] = useState<Phase>("focus");
  const [remaining, setRemaining] = useState(FOCUS_SECONDS);
  const [running, setRunning] = useState(false);
  const [cycles, setCycles] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setRemaining((v) => v - 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const startBreak = useCallback(() => {
    setPhase("break");
    setRemaining(BREAK_SECONDS);
    setRunning(true);
  }, []);

  useEffect(() => {
    if (remaining > 0) return;
    if (phase === "focus") {
      setCycles((c) => c + 1);
      startBreak();
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("🎉 خلصت جلسة تركيز!", { body: "استراحة ٥ دقايق — ابعد عن الشاشة شوية." });
      }
    } else {
      setPhase("focus");
      setRemaining(FOCUS_SECONDS);
      setRunning(false);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("⏰ الاستراحة خلصت", { body: "يلا نبدأ جلسة تركيز جديدة." });
      }
    }
  }, [remaining, phase, startBreak]);

  const toggleRunning = () => setRunning((v) => !v);
  const resetTimer = () => {
    setRunning(false);
    setPhase("focus");
    setRemaining(FOCUS_SECONDS);
  };

  const isFocus = phase === "focus";
  const progress = isFocus
    ? 1 - remaining / FOCUS_SECONDS
    : 1 - remaining / BREAK_SECONDS;

  return (
    <main className="min-h-screen bg-paper" dir="rtl">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8 space-y-5">
        {/* ---- الترويسة ---- */}
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow eyebrow-flush">التريكز</p>
            <h1 className="h2 m-0">صوتيات المذاكرة والمؤقّت</h1>
            <p className="text-xs text-ink-soft mt-1">
              اختار التراك، شغّل الجلسة، وخليك في التركيز.
            </p>
          </div>
          <Link href="/dashboard" className="btn btn-quiet text-sm shrink-0">
            ← رجوع للداشبورد
          </Link>
        </header>

        {/* ---- مؤقّت المذاكرة ---- */}
        <section
          className="sheet-card p-5 space-y-4"
          aria-label="مؤقت المذاكرة"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow eyebrow-flush m-0">
              {isFocus ? "جلسة تركيز" : "استراحة"}
            </p>
            <span className="tag tag-box">
              <span aria-hidden>{isFocus ? <Brain className="inline h-3 w-3" /> : <Coffee className="inline h-3 w-3" />}</span>
              {" "}
              {cycles > 0 ? `${cycles} ${cycles === 1 ? "جلسة مكتملة" : "جلسات مكتملة"}` : "٢٥ / ٥ بومودورو"}
            </span>
          </div>

          <div className="flex items-baseline justify-center gap-2">
            <span className="font-mono font-black text-5xl text-ink tnum leading-none" dir="ltr">
              {formatTime(remaining)}
            </span>
          </div>

          <div
            className="meter"
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`تقدم الجلسة ${Math.round(progress * 100)}%`}
          >
            <div
              className={`meter-fill ${isFocus ? themeStyles.accentBg : "bg-cyan-500"}`}
              style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
            />
          </div>

          <div className="flex gap-2 justify-center">
            <button
              onClick={toggleRunning}
              className={`btn text-sm ${themeStyles.accentBg} text-onmarker hover:opacity-90`}
            >
              {running ? (
                <>
                  <Pause className="h-4 w-4 inline-block ml-1 -mt-0.5" aria-hidden /> إيقاف مؤقّت
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 inline-block ml-1 -mt-0.5" aria-hidden /> {remaining < (isFocus ? FOCUS_SECONDS : BREAK_SECONDS) ? "كمل" : "ابدأ"}
                </>
              )}
            </button>
            <button onClick={resetTimer} className="btn btn-quiet text-sm">
              <RotateCcw className="h-4 w-4 inline-block ml-1 -mt-0.5" aria-hidden /> إعادة ضبط
            </button>
          </div>

          <p className="text-[11px] text-ink-soft leading-relaxed text-center m-0">
            ٢٥ دقيقة تركيز ثم ٥ دقايق استراحة — والعدّاد بيدوّر لوحده.
          </p>
        </section>

        {/* ---- المكتبة الصوتية: موسيقى + صوتياتي (القرآن في العبادات) ---- */}
        <section className="sheet-card p-5 space-y-3" aria-label="المكتبة الصوتية">
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow eyebrow-flush m-0">المكتبة الصوتية</p>
            <Link href="/worship/quran" className="mono text-[11px] text-ink-soft hover:text-ink underline underline-offset-4 transition">
              القرآن الكريم ← صفحة العبادات
            </Link>
          </div>
          <SoundLibrary themeStyles={themeStyles} enabledTabs={["music", "custom"]} />
        </section>
      </div>
    </main>
  );
}
