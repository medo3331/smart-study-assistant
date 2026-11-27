"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MagicAvatar } from "@/components/MagicAvatar";
import { buildMagicGreeting, type MagicGreeting, type MagicSuggestion } from "@/lib/magic/greeting";

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
