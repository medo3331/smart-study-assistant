"use client";

import React from "react";
import { toArabicNum } from "@/lib/exam-plans";
import type { ReplanReason, SubmitResponse } from "./types";

/* ============================================================================
   سبب تغيير الخطة
   ----------------------------------------------------------------------------
   ⚠️ THIS COMPONENT DOES NOT EXPLAIN ANYTHING.

   Every sentence below comes from `ReplanReason.message`, which
   lib/exam-plan-replanner.ts produced while deciding what to move and what
   to insert. The UI cannot know that reasoning: it never sees daysLeft, the
   quarantine threshold, or which topic matched which day. If it tried to
   narrate the change itself it would be guessing, and a student told
   "we moved your Trees day" when the planner actually quarantined something
   would be misled.

   So: the action word is the only thing this file adds, mapping the enum to
   an icon, and the sentence is rendered verbatim.

   The four states are equally important:
     • no weak topics     → the planner had nothing to act on
     • plan_updated true  → it acted
     • reasons present    → here is precisely what it did and why
     • plan_updated false → it tried and could not; say so rather than
                            letting the student wonder why nothing changed
   ========================================================================== */

const ACTION_ICON: Record<ReplanReason["action"], string> = {
  reorder: "🔀",
  insert: "➕",
  quarantine: "⏳",
  truncate: "✂️",
};

interface PlanChangeNoticeProps {
  result: SubmitResponse;
  /** Leads to the exam plan view. */
  planHref?: string;
}

export function PlanChangeNotice({ result, planHref }: PlanChangeNoticeProps) {
  const { weak_topics, plan_updated, plan_reasons, warning } = result;

  // Nothing weak → the planner was never asked to do anything. Not an error.
  if (weak_topics.length === 0) return null;

  return (
    <section
      dir="rtl"
      className="w-full max-w-2xl mx-auto px-6"
      aria-labelledby="plan-change-title"
    >
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-3">
        <h3
          id="plan-change-title"
          className="text-lg font-bold flex items-center gap-2"
        >
          <span aria-hidden>🔄</span>
          {plan_updated ? "عدّلنا خطتك" : "مش قادرين نحدّث خطتك دلوقتي"}
        </h3>

        {plan_updated && (plan_reasons?.length ?? 0) > 0 && (
          <ul className="space-y-2">
            {plan_reasons!.map((reason) => (
              <li key={`${reason.action}:${reason.topic}`} className="text-sm leading-relaxed">
                <span aria-hidden className="me-1">
                  {ACTION_ICON[reason.action]}
                </span>
                {/* verbatim from the planner — see the note at the top */}
                {reason.message}
              </li>
            ))}
          </ul>
        )}

        {plan_updated && (plan_reasons?.length ?? 0) === 0 && (
          <p className="text-sm text-[var(--muted-foreground)]">
            راجعنا مواضيعك وما لقيناش حاجة تستاهل إعادة ترتيب.
          </p>
        )}

        {!plan_updated && (
          <p className="text-sm leading-relaxed">
            {warning ??
              "نتيجة الاختبار اتسجلت، بس الخطة ماتحدّثتش. جرب تاني."}
          </p>
        )}

        {planHref && (
          <a
            href={planHref}
            className="inline-block text-sm underline underline-offset-4 hover:opacity-80"
          >
            شوف خطتك
          </a>
        )}
      </div>
    </section>
  );
}
