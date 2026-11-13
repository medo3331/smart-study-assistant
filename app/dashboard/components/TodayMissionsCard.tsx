"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Flame, Gift, Target } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { nextStreakBonus } from "@/lib/retention/streak-tiers";

/* ==========================================================================
   كارت «مهام النهاردة» — سطح المهام في أعلى الداشبورد

   المشكلة اللي بيحلها: المهام اليومية كانت موجودة على السيرفر من زمان
   (`db/gamification.sql`) وصفحتها `/missions` شغّالة، بس مدفونة في قائمة
   جانبية — يعني عمليًا محدش كان بيلاقيها. الكارت ده بيحطها في وش الطالب
   مع زر استلام مباشر، وبيضيف سطر «فاضل كام يوم للمحطة الجاية» عشان
   السلسلة يبقى لها مستقبل مش رقم جامد.

   ⚠️ الأرقام كلها من الـ RPC (`daily_missions`) — مفيش أي حساب محلي لـ
   «مكتملة/جاهزة». الاستلام بيتم من `claim_daily_mission` اللي بيتحقق من
   النشاط الحقيقي على السيرفر، فأي ضغطة زرار مش بتزوّد رصيد من غير دليل.

   ⚠️ لو `db/gamification.sql` لسه ما اتشغّلش (RPC مش موجود)، الكارت بيخفي
   نفسه بدل ما يعرض رسالة خطأ في وش الطالب أول ما يفتح الداشبورد.
   ========================================================================== */

interface Mission {
  mission: string;
  label: string;
  done: boolean;
  claimed: boolean;
  coins: number;
  xp: number;
}

interface TodayMissionsCardProps {
  /** سلسلة الأيام الحالية — بتيجي من نفس حالة الداشبورد (بروفايل السيرفر). */
  streak: number;
  className?: string;
}

export function TodayMissionsCard({ streak, className }: TodayMissionsCardProps) {
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    try {
      const { data, error } = await supabase.rpc("daily_missions");
      if (error) {
        // جدول/دالة المهام مش متطبّقة — نسكت بدل ما نزعّج الطالب.
        setMissions(null);
        return;
      }
      setMissions(((data ?? []) as Mission[]).map((m) => ({ ...m, coins: m.coins ?? 5, xp: m.xp ?? 10 })));
    } catch {
      setMissions(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const claimAll = async () => {
    if (!missions || claiming) return;
    const ready = missions.filter((m) => m.done && !m.claimed);
    if (ready.length === 0) return;

    setClaiming(true);
    setMessage("");
    const supabase = createClient();

    let coins = 0;
    let xp = 0;
    let failures = 0;

    // المهام ٤ بحد أقصى، فالاستدعاء المتسلسل مقبول وبيخلي الأخطاء مفهومة.
    for (const mission of ready) {
      const { data, error } = await supabase.rpc("claim_daily_mission", { p_mission: mission.mission });
      if (error) {
        failures += 1;
        continue;
      }
      const row = (Array.isArray(data) ? data[0] : data) as { coins?: number; xp?: number } | null;
      coins += Number(row?.coins ?? 0);
      xp += Number(row?.xp ?? 0);
    }

    await load();
    setClaiming(false);

    if (coins > 0 || xp > 0) {
      setMessage(`استلمت ${coins} كوين و${xp} XP 🎉`);
    } else if (failures > 0) {
      setMessage("مقدرناش نستلم المكافأة دلوقتي — حاول تاني.");
    } else {
      setMessage("المكافآت دي اتاستلمت بالفعل.");
    }
  };

  if (loading) {
    return (
      <section
        className={`rounded-2xl border p-4 ${className ?? ""}`}
        style={{ backgroundColor: "var(--card-primary)", borderColor: "var(--rule)" }}
        aria-busy="true"
        aria-label="مهام النهاردة — جارٍ التحميل"
      >
        <div className="animate-pulse space-y-2" aria-hidden>
          <div className="h-3.5 w-32 rounded-full" style={{ backgroundColor: "var(--rule)" }} />
          <div className="h-2.5 w-48 rounded-full" style={{ backgroundColor: "var(--rule)" }} />
        </div>
      </section>
    );
  }

  if (!missions || missions.length === 0) return null;

  const total = missions.length;
  const done = missions.filter((m) => m.done).length;
  const ready = missions.filter((m) => m.done && !m.claimed);
  const next = nextStreakBonus(streak);
  const progressPct = Math.round((done / Math.max(1, total)) * 100);

  return (
    <section
      className={`rounded-2xl border p-4 ${className ?? ""}`}
      style={{ backgroundColor: "var(--card-primary)", borderColor: "var(--rule)", boxShadow: "0 8px 24px var(--shade)" }}
      aria-label="مهام النهاردة"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
            <Target size={14} aria-hidden />
            <span>مهامك النهاردة</span>
          </p>
          <h3 className="mt-1 font-display text-lg font-extrabold" style={{ color: "var(--text)" }}>
            {done} من {total} مكتملة
          </h3>
        </div>

        {ready.length > 0 ? (
          <button
            type="button"
            onClick={() => void claimAll()}
            disabled={claiming}
            className="btn btn-marker text-sm shrink-0 inline-flex items-center gap-1.5 transition-colors"
          >
            <Gift size={15} aria-hidden />
            {claiming ? "بيستلم…" : `استلم ${ready.length} مكافأة`}
          </button>
        ) : (
          <Link href="/missions" className="btn btn-quiet text-sm shrink-0 inline-flex items-center gap-1.5 transition-colors">
            روح للمهام
          </Link>
        )}
      </div>

      {/* شريط تقدّم المهام */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: "var(--rule)" }} aria-hidden>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progressPct}%`, backgroundColor: "var(--accent)" }}
        />
      </div>

      {/* المحطة الجاية للسلسلة — الرقم من نفس منطق السيرفر */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: "var(--text)" }}>
          <Flame size={13} aria-hidden style={{ color: "var(--accent)" }} />
          سلسلة {streak} {streak === 1 ? "يوم" : "أيام"}
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          {next.daysLeft === 1 ? "بكرة" : `فاضل ${next.daysLeft} أيام`}: {next.label} —{" "}
          <span className="ltr-num">{next.coins}</span> كوين + <span className="ltr-num">{next.xp}</span> XP
        </span>
      </div>

      {/* ملخّص المهام نفسها — سطر لكل مهمة عشان الطالب يعرف فاضل إيه */}
      <ul className="mt-3 space-y-1.5">
        {missions.map((mission) => {
          const state = mission.claimed ? "claimed" : mission.done ? "ready" : "todo";
          return (
            <li key={mission.mission} className="flex items-center gap-2 text-xs">
              {state === "claimed" ? (
                <CheckCircle2 size={13} aria-hidden style={{ color: "var(--accent)" }} />
              ) : state === "ready" ? (
                <Gift size={13} aria-hidden style={{ color: "var(--accent)" }} />
              ) : (
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full border"
                  style={{ borderColor: "var(--rule-strong)" }}
                  aria-hidden
                />
              )}
              <span style={{ color: state === "todo" ? "var(--text-muted)" : "var(--text)" }}>{mission.label}</span>
              {state === "ready" && (
                <span className="ms-auto font-semibold" style={{ color: "var(--accent)" }}>
                  جاهزة
                </span>
              )}
              {state === "claimed" && (
                <span className="ms-auto" style={{ color: "var(--text-muted)" }}>
                  استلمتها
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <p className="sr-only" role="status" aria-live="polite">
        {message}
      </p>
      {message && (
        <p className="mt-3 text-xs font-semibold" style={{ color: "var(--accent)" }}>
          {message}
        </p>
      )}
    </section>
  );
}
