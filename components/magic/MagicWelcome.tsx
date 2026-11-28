"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MagicAvatar } from "@/components/MagicAvatar";
import { buildMagicGreeting, type MagicGreeting, type MagicSuggestion } from "@/lib/magic/greeting";
import { XP_PER_LEVEL } from "@/lib/shop/economy";

const ar = (n: number) => n.toLocaleString("ar-EG");

/* كارت Magic في الداشبورد — ماسكوت بيتكلم مع الطالب في فقاعة حوار
   + ردود سريعة تبدأ حوار فعلي في الشات الموحد. بدون AI/خصم. */

function SuggestionChip({ s }: { s: MagicSuggestion }) {
  return (
    <Link
      href={s.href}
      className="group flex items-start gap-2 rounded-xl border border-rule bg-paper px-3 py-2 transition hover:bg-paper-3"
    >
      <span aria-hidden className="text-base leading-5">{s.icon}</span>
      <span className="min-w-0">
        <span className="block text-xs font-bold text-ink leading-5">{s.label}</span>
        <span className="block text-[10px] text-ink-soft truncate">{s.hint}</span>
      </span>
    </Link>
  );
}

/* ردود سريعة — بتفتح الشات والرسالة جاهزة في خانة الكتابة (الحوار يبدأ بضغطة إرسال). */
const QUICK_REPLIES = [
  { label: "إزاي أرفع محاضرة؟", message: "إزاي أرفع محاضرة على المنصة؟" },
  { label: "اعمل لي خطة مذاكرة", message: "عايز أعمل خطة مذاكرة، تساعدني؟" },
] as const;

function QuickReply({ label, message }: { label: string; message: string }) {
  return (
    <Link
      href={`/chat?q=${encodeURIComponent(message)}`}
      className="rounded-full border border-rule bg-paper px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-paper-3 active:scale-95"
    >
      {label}
    </Link>
  );
}

export function MagicWelcome() {
  const [greeting, setGreeting] = useState<MagicGreeting | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/magic/greeting");
        if (!res.ok) throw new Error("greeting failed");
        const data = await res.json();
        if (alive && data?.greeting) setGreeting(data.greeting as MagicGreeting);
      } catch {
        if (alive) {
          setGreeting(
            buildMagicGreeting({
              displayName: null,
              hour: new Date().getHours(),
              activePlan: null,
              workspaceFiles: 0,
            })
          );
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const g =
    greeting ??
    buildMagicGreeting({
      displayName: null,
      hour: 12,
      activePlan: null,
      workspaceFiles: 0,
    });

  return (
    <div className="flex items-start gap-2 rounded-[var(--r-lg)] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4">
      <Link
        href="/chat"
        aria-label="افتح المساعد واسأل Magic"
        className="shrink-0 rounded-full p-1 -m-1 transition hover:bg-[var(--color-surface-2)] active:scale-95"
      >
        <MagicAvatar size="lg" />
      </Link>
      <div className="min-w-0 flex-1">
        {/* فقاعة الحوار — ماجيك هو اللي بيتكلم */}
        <div className="relative rounded-2xl rounded-ss-none border border-rule bg-paper-2 px-3.5 py-2.5">
          <span
            aria-hidden
            className="absolute -start-1 top-4 h-2.5 w-2.5 rotate-45 border-b border-s border-rule bg-paper-2"
          />
          <p className="text-sm font-bold text-ink leading-6">{g.greeting}</p>
          <p className="mt-0.5 text-xs text-ink-soft leading-relaxed">{g.sub}</p>
        </div>
        {/* 🏅 شريط المستوى والسلسلة — نمط Duolingo: التقدم دايمًا في العين */}
        {g.stats && (
          <div className="mt-2 flex items-center gap-3 rounded-xl border border-rule bg-paper px-3 py-2">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black text-amber-900"
              style={{ background: "linear-gradient(90deg, #FDE68A, #FBBF24)" }}
              title="سلسلة المذاكرة"
            >
              🔥 <span className="tnum">{ar(g.stats.streak)}</span>
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black text-violet-50"
              style={{ background: "linear-gradient(90deg, #7C3AED, #4F46E5)" }}
              title="مستواك الحالي"
            >
              ⭐ مستوى <span className="tnum">{ar(g.stats.level)}</span>
            </span>
            <div className="min-w-0 flex-1">
              <div
                className="h-2 rounded-full bg-paper-3 overflow-hidden"
                role="progressbar"
                aria-valuenow={g.stats.progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="تقدم نقاط الخبرة للمستوى الجاي"
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${g.stats.progressPercent}%`, background: "linear-gradient(90deg, #7C3AED, #4F46E5)" }}
                />
              </div>
              <p className="mt-0.5 text-[10px] text-ink-soft">
                <span className="tnum">{ar(g.stats.xpInLevel)}</span> / <span className="tnum">{ar(XP_PER_LEVEL)}</span> XP — فاضل{" "}
                <span className="tnum">{ar(g.stats.xpToNext)}</span> للمستوى الجاي
              </p>
            </div>
          </div>
        )}
        {/* 🏅 شارات المذاكرة — المكتسبة تلمع، واللي جاية بتقول محتاج إيه */}
        {g.badges.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {g.badges.map((b) => (
              <span
                key={b.id}
                title={b.earned ? `${b.label} — مكتسبة 🎉` : `${b.label} — ${b.hint ?? ""}`}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                  b.earned
                    ? "border-amber-300 bg-amber-500/15 text-amber-800"
                    : "border-rule bg-paper text-ink-soft opacity-70"
                }`}
              >
                <span aria-hidden>{b.emoji}</span> {b.label}
                {!b.earned && b.hint && <span className="font-medium">· {b.hint}</span>}
              </span>
            ))}
          </div>
        )}
        {/* 📉 ملاحظة الغياب — بلطف مش لوم */}
        {g.nudge && (
          <p className="mt-2 rounded-xl border border-amber-300/60 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-800 leading-relaxed">
            {g.nudge}
          </p>
        )}
        {/* ردود سريعة تبدأ حوار فعلي */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold text-ink-soft">كلّمني:</span>
          {QUICK_REPLIES.map((q) => (
            <QuickReply key={q.label} label={q.label} message={q.message} />
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {g.suggestions.map((s) => (
            <SuggestionChip key={s.id} s={s} />
          ))}
        </div>
      </div>
    </div>
  );
}
