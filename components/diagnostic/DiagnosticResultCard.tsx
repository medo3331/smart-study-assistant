"use client";

import React from "react";
import { toArabicNum } from "@/lib/exam-plans";
import type { SubmitResponse } from "./types";

/* ============================================================================
   نتيجة التشخيص
   ----------------------------------------------------------------------------
   Score, the topics that need work, and nothing else. The per-question
   breakdown is deliberately absent: the route does not return an answer key
   and this component does not try to reconstruct one.

   ⚠️ The wording is a judgement about the numbers the server sent, not a
      guess: weak_topics and insufficient_data_topics come straight from
      classifyTopics(). If both are empty the student simply has no weak
      topic, and we say so rather than inventing encouragement.
   ========================================================================== */

interface DiagnosticResultCardProps {
  result: SubmitResponse;
}

export function DiagnosticResultCard({ result }: DiagnosticResultCardProps) {
  const { score, total, weak_topics, insufficient_data_topics, correct_count } =
    result;

  const pct = total === 0 ? 0 : Math.round((score / total) * 100);
  const clean = weak_topics.length === 0;

  // Reads as Arabic, so a % of 75 should be written ٧٥٪ not 75%.
  const pctText = `${toArabicNum(pct)}٪`;

  function summary(): string {
    if (clean) {
      return "مفيش مواضيع ضعيفة دلوقتي. كمل كده.";
    }
    const n = weak_topics.length;
    return `محتاج تركيز على ${n === 1 ? "موضوع واحد" : `${toArabicNum(n)} مواضيع`}.`;
  }

  return (
    <section
      dir="rtl"
      className="w-full max-w-2xl mx-auto p-6 space-y-6"
      aria-labelledby="diag-result-title"
    >
      {/* ── الدرجة ── */}
      <div className="text-center space-y-2">
        <h2
          id="diag-result-title"
          className="text-2xl font-bold text-[var(--foreground)]"
        >
          🎯 خلصت التشخيص
        </h2>
        <p className="text-5xl font-extrabold tabular-nums">
          {toArabicNum(score)}{" "}
          <span className="text-2xl font-normal text-[var(--muted-foreground)]">
            / {toArabicNum(total)}
          </span>
        </p>
        <p className="text-sm text-[var(--muted-foreground)]">
          {pctText} — {toArabicNum(correct_count)} إجابة صحيحة
        </p>
        <p className="text-base">{summary()}</p>
      </div>

      <hr className="border-[var(--border)]" />

      {/* ── المواضيع الضعيفة ── */}
      {clean ? (
        <p className="text-center text-[var(--muted-foreground)]">
          مفيش مواضيع تحت ٦٠٪ في الاختبار ده.
        </p>
      ) : (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--muted-foreground)]">
            محتاج تركز على:
          </h3>
          <ul className="space-y-2">
            {weak_topics.map((w) => (
              <li
                key={w.topic}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3"
              >
                <span className="font-medium">🔴 {w.topic}</span>
                <span className="tabular-nums text-[var(--muted-foreground)]">
                  {toArabicNum(Math.round(w.accuracy * 100))}٪
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── مواضيع محتاجة بيانات أكتر ──
          Only shown when there is nothing weak; otherwise the weak list is
          the actionable one and this would just add noise. */}
      {clean && insufficient_data_topics.length > 0 && (
        <p className="text-center text-sm text-[var(--muted-foreground)]">
          محتاج أسئلة أكتر في: {insufficient_data_topics.join("، ")}
        </p>
      )}
    </section>
  );
}
