"use client";

/* ==========================================================================
   ExamRunner — شاشة تجهيز الامتحان (توليد بنود الجلسة واحدًا تلو الآخر)
   ============================================================================

   العقد الحالي كما هو: `GET /api/exam-sessions/[id]` لحالة البنود +
   `POST …/items/<id>/process` لكل بند متتابع (كل نداء لحد300 ثانية).
   الصفحة ممكن تقفل في أي لحظة — الرجوع لـ«تابع التوليد» بيكمل من نفس
   الجلسة (الـclaim/lease/attempts مبنيين أصلًا لده).
   ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, RotateCcw, XCircle } from "lucide-react";

type ItemState = {
  id: string;
  ordinal: number;
  status: string;
  attempt_count: number;
  error_code: string | null;
  /** 📄 مستند ولا 🎙️ تسجيل صوتي — عشان التسمية تبقى واضحة. */
  source_kind?: "recording" | "document";
};

type SessionState = {
  status: string;
  items: ItemState[];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function mapProcessError(
  status: number,
  data: { error?: string; detail?: string; retry_after?: number } | null
): string {
  if (status === 429) return "ميزانية الامتحان خلصت — جرّب امتحانًا أصغر أو بكرة.";
  // ⚠️ 503 = المزوّد اتعيط (كوتة/ضغط) — مؤقت، والطالب يقدر يعيد المحاولة.
  //    كل كود ليه رسالة مختلفة عشان الطالب يعرف يستنى ولا يغيّر المصدر.
  if (status === 503) {
    switch (data?.error) {
      case "AI_RATE_LIMITED":
        return "الكوتة على مزوّد الذكاء الاصطناعي خلصت — استنى دقيقة وجرّب تاني.";
      case "AI_TIMEOUT":
        return "الطلب اتأخر وقت التوليد — جرّب تاني بعد شوية.";
      case "AI_EMPTY_RESPONSE":
        return "الموديل رجّع رد فاضي — جرّب تاني.";
      case "SOURCE_TABLE_MISSING":
      case "SOURCE_UNAVAILABLE":
        return "المستندات لسه مفعّلةش على السيرفر — جرّب المحاضرات الصوتية.";
      default:
        return "السيرفر مشغول جداً حالياً — جرب تاني بعد شوية.";
    }
  }
  if (status === 502) return "الخدمة رجعت خطأ أثناء التوليد — جرّب تاني.";
  if (status === 402) return "رصيدك مش كافٍ.";
  if (status === 404) return "الجلسة مش موجودة.";
  return data?.error || "حصل خطأ أثناء التجهيز — جرّب تاني.";
}

export function ExamRunner({
  sessionId,
  onReady,
  onCancel,
}: {
  sessionId: string;
  onReady: () => void;
  onCancel: () => void;
}) {
  const [items, setItems] = useState<ItemState[]>([]);
  const [phase, setPhase] = useState<"loading" | "running" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0); // إعادة تشغيل الحلقة بعد خطأ قابل للتجربة
  const stopRef = useRef(false);
  // ⚠️ عدّاد ضغط الخدمة: كل 503 متتالي = محاولة تانية مجاندة، بعدين بنوقف
  //    ونعرض رسالة واضحة + زرار إعادة (مش حلقة لا نهائية).
  const busyStreakRef = useRef(0);

  useEffect(() => {
    stopRef.current = false;
    let cancelled = false;

    void (async () => {
      setPhase("loading");
      setErrorMessage(null);
      try {
        while (!stopRef.current) {
          const stateRes = await fetch(`/api/exam-sessions/${sessionId}`);
          const state = (await stateRes.json().catch(() => null)) as
            | (SessionState & { error?: string })
            | null;
          if (cancelled || stopRef.current) return;
          if (!stateRes.ok || !state) {
            throw new Error(state?.error || "مقدرناش نقرأ حالة الامتحان.");
          }

          setItems(state.items ?? []);
          const list = state.items ?? [];

          if (state.status === "completed") {
            // نادر: الجلسة اتسجّل قبل كده — نودّي الطالب للحل مباشرة.
            if (!stopRef.current) onReady();
            return;
          }

          const allReady = list.length > 0 && list.every((item) => item.status === "ready");
          if (allReady) {
            setPhase("running");
            if (!stopRef.current) onReady();
            return;
          }

          const next = list.find(
            (item) =>
              (item.status === "queued" || item.status === "failed") && item.attempt_count < 2
          );

          if (!next) {
            // مفيش بند تاني قابل للمعالجة — إما فشل أو محاولات خلصت.
            setPhase("error");
            setErrorMessage(
              "مقدرناش نكمل تجهيز كل المحاضرات — جرّب تاني، أو ابدأ امتحانًا جديدًا."
            );
            return;
          }

          setPhase("running");
          const processRes = await fetch(
            `/api/exam-sessions/${sessionId}/items/${next.id}/process`,
            { method: "POST" }
          );
          if (cancelled || stopRef.current) return;

          if (!processRes.ok) {
            const data = (await processRes.json().catch(() => null)) as {
              error?: string;
              detail?: string;
              retry_after?: number;
            } | null;

            //423 = مشغول/lease ضاع (عامل تاني) أو محاولات خلصت — نكمّل الدور.
            if (processRes.status === 423) {
              await sleep(1500);
              continue;
            }
            //502 = الموديل رجع خطأ — البند اتسجل failed وهرجعه في الدور الجاي
            // (محاولة ثانية ضمن حد attempt_count=2).
            if (processRes.status === 502) {
              await sleep(1200);
              continue;
            }
            //503 = المزوّد مشغول (الكوتة خلصت/ضغط) — بنحاول تاني مرة
            // واحدة، وبعدها بنوقف ونعرض رسالة واضحة وزرار إعادة
            // المحاولة (مش بنلفّ في حلقة لا نهائية).
            if (processRes.status === 503) {
              busyStreakRef.current += 1;
              if (busyStreakRef.current >= 2) {
                setPhase("error");
                setErrorMessage(mapProcessError(processRes.status, data));
                return;
              }
              // ⏱️ بنحترم `retry_after` اللي السيرفر بيبعته (30–60s) عشان
              //    من가고ش نعيد الطلب قبل ما المزوّد يforkه كمان.
              const hint = Math.min(
                Math.max(Number(data?.retry_after ?? 3), 2),
                60
              );
              await sleep(hint * 1000);
              continue;
            }
            //429 = سقف الميزانية — كله متوقف، الطالب يستنى/يغيّر.
            setPhase("error");
            setErrorMessage(mapProcessError(processRes.status, data));
            return;
          }

          // ✅ نداء ناجح — الضغط خلص، العدّاد بيرجع لصفر.
          busyStreakRef.current = 0;
        }
      } catch (err) {
        if (!cancelled && !stopRef.current) {
          setPhase("error");
          setErrorMessage(err instanceof Error ? err.message : "حصل خطأ — جرّب تاني.");
        }
      }
    })();

    return () => {
      stopRef.current = true;
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- attempt بيعدّل الحلقة (إعادة محاولة يدوية)
  }, [sessionId, attempt]);

  const readyCount = items.filter((item) => item.status === "ready").length;
  const total = items.length;
  const percent = total > 0 ? Math.round((readyCount / total) * 100) : 0;

  return (
    <div className="space-y-6" dir="rtl">
      <button
        onClick={onCancel}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition"
      >
        <ArrowRight size={15} aria-hidden />
        رجوع لقائمتي
      </button>

      <div className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-6 text-center space-y-4">
        <div className="text-3xl" aria-hidden>⚙️</div>
        <h2 className="text-xl font-extrabold">
          {phase === "error" ? "التوليد وقف" : `بنجهّز أسئلتك… ${readyCount}/${total || "…"} محاضرات`}
        </h2>

        <div className="h-2 rounded-full bg-[#0D1029] overflow-hidden max-w-md mx-auto">
          <div
            className="h-full rounded-full bg-amber-400 transition-all duration-500"
            style={{ width: `${percent}%` }}
            role="progressbar"
            aria-valuenow={readyCount}
            aria-valuemin={0}
            aria-valuemax={total || undefined}
            aria-label="تقدم تجهيز الامتحان"
          />
        </div>

        {total > 0 && (
          <ul className="space-y-2 max-w-md mx-auto text-right">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2.5 rounded-xl border border-[#2A3050] bg-[#0D1029] px-4 py-2.5 text-sm"
              >
                {item.status === "ready" ? (
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" aria-hidden />
                ) : item.status === "failed" ? (
                  <XCircle size={16} className="text-red-400 shrink-0" aria-hidden />
                ) : (
                  <span className="w-3.5 h-3.5 border-2 border-slate-600 border-t-amber-300 rounded-full animate-spin shrink-0" aria-hidden />
                )}
                <span className="flex-1 text-slate-300">
                  {item.source_kind === "document" ? "مستند" : "محاضرة"} {item.ordinal}
                </span>
                <span className="text-[11px] text-slate-500">
                  {item.status === "ready"
                    ? "جاهزة"
                    : item.status === "failed"
                      ? `فشلت${item.attempt_count > 1 ? " نهائيًا" : ""}`
                      : item.status === "processing"
                        ? "بتتجهّز…"
                        : "في الدور"}
                </span>
              </li>
            ))}
          </ul>
        )}

        {phase === "error" && (
          <div className="space-y-3 pt-1">
            <p className="text-sm text-red-400 leading-relaxed" role="alert">
              {errorMessage}
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setAttempt((value) => value + 1)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#0D1029] px-4 py-2 text-sm font-extrabold transition-colors"
              >
                <RotateCcw size={14} aria-hidden />
                جرّب تاني
              </button>
              <button
                onClick={onCancel}
                className="rounded-xl border border-[#2A3050] px-4 py-2 text-sm font-bold text-slate-300 hover:border-slate-500 transition"
              >
                رجوع
              </button>
            </div>
          </div>
        )}

        {phase !== "error" && (
          <p className="text-[11px] text-slate-500">
            تقدر تقفل الصفحة وترجع — التوليد بيكمل من حيث ما وقف.
          </p>
        )}
      </div>
    </div>
  );
}
