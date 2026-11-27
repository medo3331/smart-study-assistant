"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MagicAvatar } from "@/components/MagicAvatar";
import { buildMagicGreeting, type MagicGreeting, type MagicSuggestion } from "@/lib/magic/greeting";

/* كرت Magic في الداشبورد — ترحيب + اقتراح اليوم (Next Best Action).
   يظهر أول ما الطالب يدخل؛ البيانات من /api/magic/greeting (بدون AI/خصم). */

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
    <div className="flex items-start gap-3 rounded-[var(--r-lg)] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4">
      <Link
        href="/chat"
        aria-label="افتح المساعد واسأل Magic"
        className="shrink-0 rounded-full p-1 -m-1 transition hover:bg-[var(--color-surface-2)] active:scale-95"
      >
        <MagicAvatar size="lg" />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[var(--color-text-primary)]">{g.greeting}</p>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)] leading-relaxed">{g.sub}</p>
        <Link
          href="/chat"
          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90 active:scale-95"
        >
          اسأل Magic ⚡
        </Link>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {g.suggestions.map((s) => (
            <SuggestionChip key={s.id} s={s} />
          ))}
        </div>
      </div>
    </div>
  );
}
