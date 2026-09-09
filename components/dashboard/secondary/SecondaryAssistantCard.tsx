"use client";

import { useMemo } from "react";
import type { PersonalAssistantContext } from "@/lib/personal-assistant/context";
import { getSecondaryBriefing } from "@/lib/personal-assistant/secondary";

interface Props {
  context?: PersonalAssistantContext;
  displayName?: string;
  gradeName?: string | null;
  trackName?: string | null;
  subjectsCount?: number;
}

export function SecondaryAssistantCard({ context, displayName = "صديقي", gradeName, trackName, subjectsCount }: Props) {
  const fallbackName = displayName?.trim() ? displayName.trim() : "صديقي";
  const ctx: PersonalAssistantContext = useMemo(() => {
    if (context) return context;
    return {
      userName: fallbackName,
      role: "student",
      studentLevel: null,
      subject: null,
      streak: 0,
      xp: 0,
      studyProgress: null,
      goals: null,
      recentActivity: null,
    };
  }, [context, fallbackName]);

  const briefing = useMemo(() => getSecondaryBriefing(ctx), [ctx]);
  const baseLines = briefing.baseMessage.split("\n");

  return (
    <section aria-label="المساعد الأكاديمي" className="sheet-card overflow-hidden border border-rule/80">
      <div className="relative p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <div
            className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-rule bg-gradient-to-br from-slate-900 to-slate-700 text-white"
            style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
            role="img"
            aria-label="مساعدك الأكاديمي"
          >
            <span aria-hidden className="text-xl">◈</span>
          </div>
          <div className="min-w-0 flex flex-col gap-1.5">
            <h2 className="font-display text-[1.08rem] font-bold leading-relaxed text-ink">
              {briefing.greeting}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold text-white">
                {briefing.timePeriod === "morning" ? "تركيز صباحي" : "مراجعة مسائية"}
              </span>
              {gradeName && <span className="tag">{gradeName}</span>}
              {trackName && <span className="tag bg-amber-50 border-amber-200 text-amber-900">{trackName}</span>}
              {typeof subjectsCount === "number" && subjectsCount > 0 && (
                <span className="mono text-[11px] text-ink-soft">{subjectsCount} مواد</span>
              )}
            </div>
          </div>
        </div>

        <div className="my-4 h-px bg-rule" role="presentation" />

        <div className="flex flex-col gap-2.5" aria-live="polite">
          {baseLines.map((line, i) => (
            <p key={i} className="flex items-baseline gap-2.5 text-sm leading-[1.85] text-ink">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink" aria-hidden />
              <span>{line}</span>
            </p>
          ))}
          {briefing.roleMessage && (
            <p className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm leading-6 text-slate-800">
              {briefing.roleMessage}
            </p>
          )}
          {briefing.progressMessage && (
            <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm leading-6 text-emerald-900">
              {briefing.progressMessage}
            </p>
          )}
          {briefing.goalsMessage && (
            <p className="whitespace-pre-line rounded-lg bg-sky-50 border border-sky-200 px-3 py-2 text-sm leading-6 text-sky-900">
              {briefing.goalsMessage}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
