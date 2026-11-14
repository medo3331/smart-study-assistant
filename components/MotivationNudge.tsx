"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";
import { fetchBalance } from "@/lib/shop/shop-data";
import { buildNudges, type Nudge, type NudgeInput } from "@/lib/retention/nudges";
import { HowToWinGuide } from "@/components/HowToWinGuide";

/* ==========================================================================
   MotivationNudge — سطر تحفيز واحد مبني على حالة الطالب الحقيقية

   منطق الرسالة في `lib/retention/nudges.ts` (نقي ومتختبر)، وده الجزء اللي
   بيجيب الأرقام بس:
     • XP + السلسلة    → profiles (RLS بتحصرها على صاحبها)
     • الكوينز         → RPC coin_balance
     • الترتيب         → عدد اللي XP بتاعهم أعلى مني + ١ في public_profiles
       (قراءة مباشرة من profiles ممنوعة بعد RLS hardening، والـview هو
       المصدر الآمن — نفس اللي /community بتستخدمه)

   ⚠️ مفيش تخمين: لو أي رقم مش معروف (زي الترتيب قبل ما يبقى فيه مستخدمين
   تانيين)، الرسالة اللي بتعتمد عليه ما بتظهرش — وبنقع على رسالة عامة.
   ⚠️ الأرقام بتتحسب مرة عند الفتح + بتتحدّث عند أي مكافأة (foundation:coins).
   ========================================================================== */

interface MotivationNudgeProps {
  /** السلسلة من حالة الداشبورد — لو مش موجودة بنقراها من البروفايل. */
  streak?: number;
  className?: string;
  /** يخفي زرار الدليل لو الأب عنده واحد بالفعل. */
  hideGuideButton?: boolean;
}

export function MotivationNudge({ streak, className, hideGuideButton }: MotivationNudgeProps) {
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let alive = true;

    const load = async () => {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("xp, streak")
          .maybeSingle();

        if (!alive) return;
        const xp = Number(profile?.xp ?? 0) || 0;
        const profileStreak = typeof streak === "number" ? streak : Number(profile?.streak ?? 0) || 0;

        const [balanceRes, rankRes, missionsRes] = await Promise.all([
          fetchBalance(supabase).catch(() => ({ data: 0, error: null })),
          // كم واحد XP بتاعهم أعلى مني؟ +1 = ترتيبي
          supabase
            .from("public_profiles")
            .select("id", { count: "exact", head: true })
            .gt("xp", xp),
          supabase.rpc("daily_missions"),
        ]);

        if (!alive) return;

        const coins = Number(balanceRes?.data ?? 0) || 0;
        const above = typeof rankRes?.count === "number" ? rankRes.count : null;
        const rank = above === null ? null : above + 1;

        /* كام XP لللي فوقي؟ بنجيب أقل XP أعلى مني؛ لو مفيش، يبقى أنا الأول.
           الاستعلام ده خفيف (صف واحد) وبيخلّي الرسالة رقمية مش تقريبية. */
        let xpToNextRank: number | null = null;
        if (rank !== null && rank > 1) {
          const { data: ahead } = await supabase
            .from("public_profiles")
            .select("xp")
            .gt("xp", xp)
            .order("xp", { ascending: true })
            .limit(1)
            .maybeSingle();
          const nextXp = Number(ahead?.xp ?? NaN);
          if (Number.isFinite(nextXp)) xpToNextRank = Math.max(1, nextXp - xp);
        }

        const missions = (missionsRes?.data ?? []) as Array<{ done?: boolean }>;
        const missionsTotal = missionsRes?.error ? 0 : missions.length;
        const missionsDone = missionsRes?.error ? 0 : missions.filter((m) => m.done === true).length;

        const input: NudgeInput = {
          xp,
          coins,
          streak: profileStreak,
          rank,
          xpToNextRank,
          missionsDone,
          missionsTotal,
        };

        if (alive) setNudge(buildNudges(input)[0] ?? null);
      } catch {
        // فشل الشبكة مش سبب نعرض رسالة مخترعة — بنسيب الكارت مخفي.
        if (alive) setNudge(null);
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();
    const handler = () => void load();
    window.addEventListener("foundation:coins", handler);

    return () => {
      alive = false;
      window.removeEventListener("foundation:coins", handler);
    };
  }, [streak]);

  if (loading) {
    return (
      <div
        className={`animate-pulse rounded-2xl border p-4 ${className ?? ""}`}
        style={{ backgroundColor: "var(--card-primary)", borderColor: "var(--rule)" }}
        aria-busy="true"
        aria-label="رسالة تحفيز — جارٍ التحميل"
      >
        <div className="h-3 w-40 rounded-full" style={{ backgroundColor: "var(--rule)" }} aria-hidden />
        <div className="mt-2 h-2.5 w-64 rounded-full" style={{ backgroundColor: "var(--rule)" }} aria-hidden />
      </div>
    );
  }

  if (!nudge) return null;

  const toneStyles: Record<Nudge["tone"], { bg: string; border: string }> = {
    celebrate: { bg: "var(--paper-3)", border: "var(--accent)" },
    push: { bg: "var(--card-primary)", border: "var(--rule)" },
    tip: { bg: "var(--card-primary)", border: "var(--rule)" },
  };
  const tone = toneStyles[nudge.tone];

  return (
    <section
      className={`flex items-start gap-3 rounded-2xl border p-4 ${className ?? ""}`}
      style={{ backgroundColor: tone.bg, borderColor: tone.border, boxShadow: "0 8px 24px var(--shade)" }}
      aria-label="رسالة تحفيز"
    >
      <span className="text-xl leading-none shrink-0" aria-hidden>
        {nudge.icon}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-snug" style={{ color: "var(--text)" }}>
          {nudge.title}
        </p>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {nudge.body}
        </p>
        {nudge.cta && (
          <Link
            href={nudge.cta.href}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold transition-colors"
            style={{ color: "var(--accent)" }}
          >
            {nudge.cta.label} ←
          </Link>
        )}
      </div>

      {!hideGuideButton && <HowToWinGuide className="shrink-0" />}
    </section>
  );
}
