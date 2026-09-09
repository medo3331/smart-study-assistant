"use client";

import { useMemo } from "react";
import type { PersonalAssistantContext } from "@/lib/personal-assistant/context";
import { getPrimaryBriefing } from "@/lib/personal-assistant/primary";

interface Props {
  context?: PersonalAssistantContext;
  displayName?: string;
  gradeName?: string | null;
  subjectsCount?: number;
  className?: string;
}

export function PrimaryAssistantCard({ context, displayName = "صديقي", gradeName, subjectsCount, className }: Props) {
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

  // Use primary briefing (child-friendly, safe)
  const briefing = useMemo(() => getPrimaryBriefing(ctx), [ctx]);
  const baseLines = briefing.baseMessage.split("\n");

  // Also compute greeting via primary helper for extra safety (ensures 💙)
  const greeting = briefing.greeting;

  return (
    <section
      aria-label="المساعد الصغير"
      className={`sheet-card overflow-hidden ${className ?? ""}`}
    >
      <div className="relative p-5 sm:p-6">
        {/* Header with friendly avatar */}
        <div className="flex items-center gap-4">
          <div
            className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[1.5px] border-rule-strong bg-gradient-to-br from-amber-100 to-sky-100"
            style={{ boxShadow: "0 0 0 5px rgba(245,222,114,0.30), 0 2px 6px var(--shade)" }}
            role="img"
            aria-label="مساعدك الصغير"
          >
            <span aria-hidden className="text-2xl">🧸</span>
            <span
              className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-[2.5px] border-paper-2"
              style={{ background: "var(--hl-yellow-deep)", boxShadow: "0 0 0 1px var(--hl-yellow-ink)" }}
              aria-hidden
            />
          </div>
          <div className="min-w-0 flex flex-col gap-1.5">
            <h2 className="font-display text-[1.15rem] font-bold leading-relaxed text-ink">
              {greeting}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-paper-2 border border-rule px-2.5 py-1 text-[11px] font-medium text-ink-soft">
                <span aria-hidden>{briefing.timePeriod === "morning" ? "🌤️" : "🌙"}</span>
                {briefing.timePeriod === "morning" ? "صباح النشاط" : "مساء هادي"}
              </span>
              {gradeName && (
                <span className="tag"> {gradeName} </span>
              )}
              {typeof subjectsCount === "number" && subjectsCount > 0 && (
                <span className="mono text-[11px] text-ink-soft">{subjectsCount} مواد</span>
              )}
            </div>
          </div>
        </div>

        <div className="my-4 h-px" style={{ background: "var(--rule)" }} role="presentation" />

        <div className="flex flex-col gap-2" aria-live="polite">
          {baseLines.map((line, i) => (
            <p key={i} className="flex items-baseline gap-2.5 text-sm leading-[1.9] text-ink">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--hl-yellow-deep)" }} aria-hidden />
              <span>{line}</span>
            </p>
          ))}
          {briefing.roleMessage && (
            <p className="flex items-baseline gap-2.5 text-sm leading-[1.9] text-ink">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--hl-yellow-deep)" }} aria-hidden />
              <span>{briefing.roleMessage}</span>
            </p>
          )}
          {/* Only show progress/goals if present and child-friendly */}
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
