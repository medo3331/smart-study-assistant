"use client";

import { useMemo } from "react";
import type { PersonalAssistantContext } from "@/lib/personal-assistant/context";
import { getPreparatoryBriefing } from "@/lib/personal-assistant/preparatory";

interface Props {
  context?: PersonalAssistantContext;
  displayName?: string;
  gradeName?: string | null;
  subjectsCount?: number;
}

export function PreparatoryAssistantCard({ context, displayName = "صديقي", gradeName, subjectsCount }: Props) {
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

  const briefing = useMemo(() => getPreparatoryBriefing(ctx), [ctx]);
  const baseLines = briefing.baseMessage.split("\n");

  return (
    <section aria-label="المساعد الدراسي" className="sheet-card overflow-hidden">
      <div className="relative p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <div
            className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-rule bg-paper-3"
            style={{ boxShadow: "0 0 0 4px rgba(124,92,255,0.08), 0 2px 8px var(--shade)" }}
            role="img"
            aria-label="مساعدك الدراسي"
          >
            <span aria-hidden className="text-[1.35rem]">🎓</span>
            <span
              className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-[2.5px] border-paper-2"
              style={{ background: "#7C5CFF", boxShadow: "0 0 0 1px rgba(124,92,255,0.2)" }}
              aria-hidden
            />
          </div>
          <div className="min-w-0 flex flex-col gap-1.5">
            <h2 className="font-display text-[1.1rem] font-bold leading-relaxed text-ink">
              {briefing.greeting}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-paper-2 border border-rule px-2.5 py-1 text-[11px] font-medium text-ink-soft">
                <span aria-hidden>{briefing.timePeriod === "morning" ? "🌤️" : "🌙"}</span>
                {briefing.timePeriod === "morning" ? "يوم منظم" : "مساء هادئ للمذاكرة"}
              </span>
              {gradeName && <span className="tag">{gradeName}</span>}
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
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#7C5CFF" }} aria-hidden />
              <span>{line}</span>
            </p>
          ))}
          {briefing.roleMessage && (
            <p className="flex items-baseline gap-2.5 text-sm leading-[1.9] text-ink">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#7C5CFF" }} aria-hidden />
              <span>{briefing.roleMessage}</span>
            </p>
          )}
          {briefing.progressMessage && (
            <p className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 text-sm leading-6 text-violet-900">
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
