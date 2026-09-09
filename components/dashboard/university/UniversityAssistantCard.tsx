"use client";

import { useMemo } from "react";
import type { PersonalAssistantContext } from "@/lib/personal-assistant/context";
import { getUniversityBriefing } from "@/lib/personal-assistant/university";

interface Props {
  context?: PersonalAssistantContext;
  displayName?: string;
  facultyName?: string | null;
  departmentName?: string | null;
  subjectsCount?: number;
}

export function UniversityAssistantCard({ context, displayName = "صديقي", facultyName, departmentName, subjectsCount }: Props) {
  const fallbackName = displayName?.trim() ? displayName.trim() : "صديقي";
  const ctx: PersonalAssistantContext = useMemo(() => {
    if (context) return context;
    return { userName: fallbackName, role: "student", studentLevel: null, subject: null, streak: 0, xp: 0, studyProgress: null, goals: null, recentActivity: null };
  }, [context, fallbackName]);
  const briefing = useMemo(() => getUniversityBriefing(ctx), [ctx]);
  const baseLines = briefing.baseMessage.split("\n");
  return (
    <section aria-label="المساعد الجامعي" className="sheet-card overflow-hidden border border-slate-200">
      <div className="relative p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white" role="img" aria-label="مساعدك الجامعي">
            <span aria-hidden className="text-xl">🎓</span>
          </div>
          <div className="min-w-0 flex flex-col gap-1.5">
            <h2 className="font-display text-[1.08rem] font-bold leading-relaxed text-ink">{briefing.greeting}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white">جامعة</span>
              {facultyName && <span className="tag">{facultyName}</span>}
              {departmentName && <span className="tag bg-sky-50 border-sky-200 text-sky-900">{departmentName}</span>}
              {typeof subjectsCount === "number" && subjectsCount > 0 && <span className="mono text-[11px] text-ink-soft">{subjectsCount} مواد</span>}
            </div>
          </div>
        </div>
        <div className="my-4 h-px bg-rule" role="presentation" />
        <div className="flex flex-col gap-2.5" aria-live="polite">
          {baseLines.map((line, i) => (
            <p key={i} className="flex items-baseline gap-2.5 text-sm leading-[1.85] text-ink">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-900" aria-hidden />
              <span>{line}</span>
            </p>
          ))}
          {briefing.roleMessage && <p className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm leading-6 text-slate-800">{briefing.roleMessage}</p>}
          {briefing.progressMessage && <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm leading-6 text-emerald-900">{briefing.progressMessage}</p>}
          {briefing.goalsMessage && <p className="whitespace-pre-line rounded-lg bg-sky-50 border border-sky-200 px-3 py-2 text-sm leading-6 text-sky-900">{briefing.goalsMessage}</p>}
        </div>
      </div>
    </section>
  );
}
