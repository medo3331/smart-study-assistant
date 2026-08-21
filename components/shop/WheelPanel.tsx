"use client";

/* ==========================================================================
   عجلة الحظ — لفة واحدة في اليوم

   ⚠️⚠️ **الجايزة بتتسحب في السيرفر.** `spin_wheel` بترجّع الجايزة، والقرص
   هنا بيلف **لحد ما المؤشّر يقف على الشريحة اللي السيرفر قالها**. يعني
   الأنيميشن بيعرض نتيجة موجودة، مش بيقرّرها. لو الاختيار كان هنا، أي حد
   يفتح الكونسول ويقول «وقّفها على ١٢٠».

   ⚠️ اللفة **مكافأة مذاكرة مش مكافأة دخول**: الدالة في الداتابيز بترفض لو
   مفيش كسب من `day_done`/`goal_done` النهارده. الزرار هنا بيقفل بنفس
   الشرط (`studied`) — بس ده تأدّب مع المستخدم عشان يعرف السبب قبل ما
   يضغط، مش هو الحماية. الحماية في السيرفر.

   ⚠️ الشرايح **بعرض وزنها**. الشريحة اللي احتمالها ١٪ بتطلع خط رفيع، وده
   مقصود: عجلة شرايحها متساوية واحتمالاتها مختلفة بتكدب بالشكل.
   ========================================================================== */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Coins, Lock, RotateCw } from "lucide-react";
import { WHEEL_PRIZES } from "@/lib/shop/wheel";
import type { SpinOutcome, WheelStatus } from "@/lib/shop/shop-data";
import { useReducedMotion } from "@/lib/useReducedMotion";

/** زاوية بداية كل شريحة ونصّها — من الأوزان، بالدرجات من ١٢ ساعة */
function slices() {
  let at = 0;
  return WHEEL_PRIZES.map((p) => {
    const start = at;
    const end = at + (p.weight / 10000) * 360;
    at = end;
    return { prize: p, start, end, mid: (start + end) / 2 };
  });
}

export function WheelPanel({
  status,
  onSpin,
}: {
  status: WheelStatus;
  onSpin: () => Promise<{ ok: boolean; message: string; data: SpinOutcome | null }>;
}) {
  const reduced = useReducedMotion();
  const segs = useMemo(slices, []);

  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [won, setWon] = useState<SpinOutcome | null>(null);
  const [err, setErr] = useState<string | null>(null);

  /* التدرّج من نفس الأوزان اللي الأرقام مكتوبة تحتيها */
  const gradient = useMemo(
    () =>
      `conic-gradient(from 0deg, ${segs
        .map(
          (s) =>
            `var(--hl-${s.prize.hl}-fill) ${s.start.toFixed(2)}deg ${s.end.toFixed(2)}deg`,
        )
        .join(", ")})`,
    [segs],
  );

  const done = status.spun || won !== null;
  const canSpin = status.canSpin && !done && !spinning;

  const run = async () => {
    setSpinning(true);
    setErr(null);
    const res = await onSpin();

    if (!res.ok || !res.data) {
      setErr(res.message || "العجلة مالفّتش");
      setSpinning(false);
      return;
    }

    // ندوّر لحد ما نصّ الشريحة الرابحة يوصل تحت المؤشّر اللي فوق.
    // القرص بيلف لليمين، فالزاوية اللي بتوصل للمؤشّر هي `-rotation`.
    const hit = segs.find((s) => s.prize.id === res.data!.prizeId);
    const mid = hit ? hit.mid : 0;
    setRotation(360 * 5 - mid);

    // تقليل الحركة: النتيجة بتظهر فوراً من غير لفّة.
    if (reduced) {
      setWon(res.data);
      setSpinning(false);
      return;
    }
    window.setTimeout(() => {
      setWon(res.data);
      setSpinning(false);
    }, 3400);
  };

  return (
    <section className="space-y-3" aria-labelledby="wheel-title">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2
          id="wheel-title"
          className="font-display font-extrabold text-[15px] text-ink flex items-center gap-2"
        >
          <RotateCw className="w-4 h-4 text-ink-soft" aria-hidden />
          عجلة الحظ
        </h2>
        <span className="text-[11px] text-ink-soft">لفة واحدة كل يوم</span>
      </div>

      <div className="rounded-[var(--r-md)] border border-rule bg-paper-2 p-5 space-y-4">
        <div className="wheel-wrap">
          <span className="wheel-needle" aria-hidden />
          <motion.span
            className="wheel-disc"
            aria-hidden
            style={{ background: gradient }}
            animate={{ rotate: rotation }}
            transition={
              reduced
                ? { duration: 0 }
                : { duration: 3.4, ease: [0.16, 1, 0.3, 1] }
            }
          />
          <span className="wheel-hub" aria-hidden>
            🪙
          </span>
        </div>

        {/* النتيجة والحالة بالنص — الحركة زينة، والقارئ بيسمع ده */}
        <div aria-live="polite" className="text-center space-y-1">
          {won ? (
            <>
              <p className="font-display font-extrabold text-lg text-ink leading-tight">
                {won.label}
              </p>
              <p className="text-[12px] text-ink-soft">
                اتضافوا لرصيدك — بقى{" "}
                <b className="ltr-num tnum text-ink">{won.balance}</b> كوين
              </p>
            </>
          ) : status.spun ? (
            <p className="text-[13px] text-ink-soft leading-relaxed">
              لفّيت النهارده وكسبت{" "}
              <b className="ltr-num tnum text-ink">{status.coins}</b> كوين. تعالى
              بكره للفة الجديدة.
            </p>
          ) : spinning ? (
            <p className="text-[13px] text-ink-soft">بتلف...</p>
          ) : status.studied ? (
            <p className="text-[13px] text-ink-soft leading-relaxed">
              لفّتك النهارده جاهزة.
            </p>
          ) : (
            <p className="text-[13px] text-ink-soft leading-relaxed">
              ذاكر حاجة النهارده الأول — العجلة مكافأة على المذاكرة مش على
              الدخول.
            </p>
          )}

          {err && (
            <p className="text-[12px] text-ink bg-paper border border-rule rounded-[var(--r-sm)] p-3 text-start">
              {err}
            </p>
          )}
        </div>

        <button
          onClick={run}
          disabled={!canSpin}
          className="btn btn-marker text-sm w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
        >
          {done ? (
            <>
              <Lock className="w-3.5 h-3.5" aria-hidden />
              لفّيت النهارده
            </>
          ) : spinning ? (
            "..."
          ) : status.studied ? (
            <>
              <RotateCw className="w-3.5 h-3.5" aria-hidden />
              لِف
            </>
          ) : (
            <>
              <Lock className="w-3.5 h-3.5" aria-hidden />
              ذاكر الأول
            </>
          )}
        </button>

        {/* الجوايز بأرقامها — الاحتمال مكتوب مش متروك للشكل */}
        <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 border-t border-rule pt-3">
          {WHEEL_PRIZES.map((p) => (
            <li
              key={p.id}
              className="text-[11px] text-ink-soft flex items-center gap-1.5"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: `var(--hl-${p.hl}-fill)` }}
                aria-hidden
              />
              <span className="inline-flex items-center gap-1">
                <Coins className="w-3 h-3" aria-hidden />
                <b className="ltr-num tnum text-ink">{p.coins}</b>
              </span>
              <span className="ltr-num tnum">{(p.weight / 100).toFixed(0)}٪</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
