"use client";

import React, { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toArabicNum } from "@/lib/exam-plans";
import { DiagnosticResultCard } from "./DiagnosticResultCard";
import { PlanChangeNotice } from "./PlanChangeNotice";
import {
  ApiError,
  postJson,
  type ClientAnswer,
  type FlowStage,
  type StartResponse,
  type SubmitResponse,
} from "./types";

/* ============================================================================
   رحلة التشخيص
   ----------------------------------------------------------------------------
   Three stages in one page: intro → quiz → result. A separate results route
   would be a page reload away from the answers, and the result is only
   meaningful next to the score that produced it.

   ⚠️ The answers posted are exactly {question_id, selected_option_index}.
      No score, no is_correct, no confidence. The route computes correctness
      from the question bank and this component never holds the key: the
      start response does not contain correct_option_index, so there is
      nothing here to send even if we wanted to.

   ⚠️ submit may answer 202 with a warning. That is not a failure: the score
      is committed and the student earned it, so we show the result and let
      the warning speak for itself rather than replacing the screen with an
      error the student cannot act on.
   ========================================================================== */

interface DiagnosticFlowProps {
  /** Subject the diagnostic runs against. */
  subjectId: string;
  /** Subject name, for the intro copy. */
  subjectName?: string;
  /** Where "شوف خطتك" points. */
  planHref?: string;
  /**
   * The plan to update.
   *
   * ⚠️ The route treats plan_id as OPTIONAL: without it the diagnostic is
   *    still scored and persisted, but replanExamPlan never runs and
   *    plan_updated comes back false. So a UI that omits this silently
   *    produces a student who was told nothing changed, when in fact the
   *    planner was never asked. Resolved server-side and passed in.
   */
  planId?: string;
}

export function DiagnosticFlow({
  subjectId,
  subjectName,
  planHref,
  planId,
}: DiagnosticFlowProps) {
  const [stage, setStage] = useState<FlowStage>("intro");
  const [start, setStart] = useState<StartResponse | null>(null);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const begin = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await postJson<StartResponse>("/api/diagnostic/start", {
        subject_id: subjectId,
        question_count: 10,
      });
      setStart(data);
      setPicked({});
      setStage("quiz");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "مش قادرين نبدأ التشخيص.");
    } finally {
      setBusy(false);
    }
  }, [subjectId]);

  const submit = useCallback(async () => {
    if (!start) return;
    setBusy(true);
    setError(null);

    const answers: ClientAnswer[] = start.questions
      .filter((q) => picked[q.id] !== undefined)
      .map((q) => ({ question_id: q.id, selected_option_index: picked[q.id] }));

    try {
      const data = await postJson<SubmitResponse>("/api/diagnostic/submit", {
        session_id: start.session_id,
        answers,
        // Omitted when absent rather than sent empty: the route reads it as
        // a string and treats "" as "no plan", so sending "" would look the
        // same as sending nothing — but sending a real id is what makes the
        // planner actually run.
        ...(planId ? { plan_id: planId } : {}),
      });
      setResult(data);
      setStage("result");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "مش قادرين نسلم إجاباتك.");
    } finally {
      setBusy(false);
    }
  }, [start, picked, planId]);

  const answered = start ? start.questions.filter((q) => picked[q.id] !== undefined).length : 0;

  /* ── مقدمة ── */
  if (stage === "intro") {
    return (
      <section dir="rtl" className="w-full max-w-2xl mx-auto p-6 space-y-5 text-center">
        <h2 className="text-2xl font-bold">تشخيص سريع</h2>
        <p className="text-[var(--muted-foreground)] leading-relaxed">
          {toArabicNum(10)} أسئلة
          {subjectName ? ` في ${subjectName}` : ""} — هيحسب مستواك في كل
          موضوع، ويعدّل خطة مذاكرتك على أساس النتيجة.
        </p>
        <p className="text-sm text-[var(--muted-foreground)]">مفيش درجات ميتسجّلة، ومش بنشارك إجاباتك.</p>
        <button
          type="button"
          onClick={begin}
          disabled={busy}
          className="px-6 py-3 rounded-xl bg-[var(--accent)] text-[var(--accent-foreground)] font-semibold disabled:opacity-60"
        >
          {busy ? "جاري التحضير…" : "ابدأ التشخيص"}
        </button>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </section>
    );
  }

  /* ── الأسئلة ── */
  if (stage === "quiz" && start) {
    return (
      <section dir="rtl" className="w-full max-w-2xl mx-auto p-6 space-y-6">
        <header className="space-y-1">
          <h2 className="text-xl font-bold">اختبار سريع</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            أجبت {toArabicNum(answered)} من {toArabicNum(start.questions.length)}
          </p>
        </header>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        <ol className="space-y-6">
          {start.questions.map((q, i) => (
            <li key={q.id} className="space-y-2">
              <p className="font-medium">
                {toArabicNum(i + 1)}. {q.question_text}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {q.options.map((opt, j) => (
                  <button
                    key={j}
                    type="button"
                    aria-pressed={picked[q.id] === j}
                    onClick={() => setPicked((prev) => ({ ...prev, [q.id]: j }))}
                    className={`text-right p-3 rounded-lg border transition ${
                      picked[q.id] === j
                        ? "border-[var(--accent)] bg-[var(--accent)]/10"
                        : "border-[var(--border)] hover:border-[var(--accent)]/50"
                    }`}
                  >
                    <span className="font-semibold me-2">
                      {String.fromCharCode(0x0627 + j)}.
                    </span>
                    {opt}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={submit}
          disabled={busy || answered === 0}
          className="w-full px-6 py-3 rounded-xl bg-[var(--accent)] text-[var(--accent-foreground)] font-semibold disabled:opacity-60"
        >
          {busy ? "جاري التسليم…" : "سلّم إجاباتك"}
        </button>
      </section>
    );
  }

  /* ── النتيجة ── */
  if (stage === "result" && result) {
    return (
      <div className="space-y-6 pb-10">
        <DiagnosticResultCard result={result} />
        <PlanChangeNotice result={result} planHref={planHref} />
        <div className="w-full max-w-2xl mx-auto px-6">
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setStage("intro");
            }}
            className="text-sm underline underline-offset-4"
          >
            اعمل تشخيص تاني
          </button>
        </div>
      </div>
    );
  }

  return null;
}
