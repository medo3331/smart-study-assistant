"use client";

import { useEffect, useRef, useState } from "react";
import type { SpecializationContext, LessonSpecialization } from "@/lib/education/specialization";
import type { LabSession, LabVerdict } from "@/lib/lesson/lab";

/* ==========================================================================
   ProblemSolvingLab (P6 — Subject Labs) — أول Lab فعلي:
   بيئة حل مشكلات خطوة بخطوة للمواد الحسابية/البرمجية — حل توجيهي مع AI
   بدون محاكيات:
     • الطالب يكتب المسألة ⇒ AI يقسّمها لخطوات (توجيه، مش حل نهائي).
     • الطالب يحاول كل خطوة ⇒ AI يقيّم (correct/partial/wrong + فيدباك).
   الجلسة بتتخزّن في الداتابيز (lesson_content.labs — آخر ٣) وتترجع عند الفتح.
   كل النداءات عبر /api/lesson-content (action: problem_lab) — مفيش endpoint جديد.
   ========================================================================== */

const VERDICT_LABELS: Record<LabVerdict, { label: string; className: string }> = {
  correct: { label: "صح ✓", className: "text-emerald-600" },
  partial: { label: "ناقص شوية", className: "text-amber-600" },
  wrong: { label: "محتاجة مراجعة", className: "text-redpen" },
};

export function ProblemSolvingLab({ ctx }: { ctx: SpecializationContext }) {
  const { dayId, topic } = ctx.lesson;
  const [problem, setProblem] = useState("");
  const [session, setSession] = useState<LabSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // محاولة الخطوة الحالية — أول خطوة لسه مقدمهاش.
  const [attempt, setAttempt] = useState("");
  const bootedRef = useRef(false);

  // آخر جلسة محفوظة — من GET (مرة واحدة).
  useEffect(() => {
    if (bootedRef.current || !dayId) return;
    bootedRef.current = true;
    void (async () => {
      try {
        const res = await fetch(`/api/lesson-content?dayId=${encodeURIComponent(dayId)}`);
        const data = await res.json().catch(() => null);
        if (res.ok && data?.ok && data?.lab) setSession(data.lab as LabSession);
      } catch {
        /* best-effort — الطالب يبدأ جلسة جديدة */
      }
    })();
  }, [dayId]);

  const startSession = async () => {
    if (!problem.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lesson-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayId,
          action: "problem_lab",
          mode: "plan",
          problem,
          edu: ctx.profile,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data?.session) {
        throw new Error(data?.error?.message || "بناء الخطة فشل — جرّب تاني.");
      }
      setSession(data.session as LabSession);
      setAttempt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "بناء الخطة فشل — جرّب تاني.");
    } finally {
      setBusy(false);
    }
  };

  /** أول خطوة لسه مقدمهاش — بناءً على المحاولات المخزّنة. */
  const currentStepIndex = session
    ? session.steps.findIndex((_, i) => !session.attempts.some((a) => a.stepIndex === i && a.verdict === "correct"))
    : -1;

  const submitStep = async () => {
    if (!session || currentStepIndex < 0 || !attempt.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lesson-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayId,
          action: "problem_lab",
          mode: "step",
          sessionId: session.id,
          stepIndex: currentStepIndex,
          attempt,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data?.session) {
        throw new Error(data?.error?.message || "تقييم المحاولة فشل — جرّب تاني.");
      }
      const updated = data.session as LabSession;
      setSession(updated);
      // الخطوة اتصحّحت ⇒ نظّف المحاولة للخطوة الجاية؛ لسه ⇒ السيبها قدام الطالب.
      const lastAttempt = updated.attempts.find((a) => a.stepIndex === currentStepIndex);
      if (lastAttempt?.verdict === "correct") setAttempt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تقييم المحاولة فشل — جرّب تاني.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="مختبر حل المشكلات" className="sheet-card p-5 sm:p-6 space-y-4" dir="rtl">
      <div>
        <p className="eyebrow eyebrow-flush mb-1.5">مختبر المادة</p>
        <h2 className="h3">حل مشكلات خطوة بخطوة</h2>
        <p className="mt-1 text-[11.5px] text-ink-soft leading-relaxed">
          اكتب مسألة من «{topic}» — الـ AI هيقسّمها لخطوات ويوجّهك فيها واحدة واحدة، من غير ما يحلها لك.
        </p>
      </div>

      {!session ? (
        <div className="space-y-2">
          <textarea
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            placeholder="اكتب المسألة أو التمرين هنا (مع المعطيات والمطلوب)…"
            rows={4}
            maxLength={3000}
            className="field w-full py-2.5 text-xs leading-relaxed"
          />
          <button
            onClick={() => void startSession()}
            disabled={busy || !problem.trim()}
            className="btn btn-marker text-xs px-4 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "بيبني الخطة…" : "ابدأ الحل التدريجي"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-rule bg-paper-2 p-3">
            <p className="text-[10.5px] font-bold text-ink-soft mb-1">المسألة</p>
            <p className="text-[12px] text-ink whitespace-pre-wrap leading-relaxed line-clamp-4">{session.problem}</p>
            {session.understanding && (
              <p className="mt-2 text-[11.5px] text-ink-soft leading-relaxed border-t border-rule pt-2">
                <span className="font-bold">الفهم: </span>
                {session.understanding}
              </p>
            )}
          </div>

          <ol className="space-y-2">
            {session.steps.map((step, i) => {
              const stepAttempt = session.attempts.find((a) => a.stepIndex === i);
              const isCurrent = i === currentStepIndex;
              return (
                <li
                  key={i}
                  className={`rounded-xl border p-3 space-y-2 transition ${
                    isCurrent
                      ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]"
                      : "border-rule bg-paper"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="mono text-[10px] px-1.5 py-0.5 rounded-[5px] bg-paper-3 text-ink-soft shrink-0">{i + 1}</span>
                    <span className="text-[12px] font-bold text-ink">{step.title}</span>
                    {stepAttempt && (
                      <span className={`text-[10px] font-bold ms-auto shrink-0 ${VERDICT_LABELS[stepAttempt.verdict].className}`}>
                        {VERDICT_LABELS[stepAttempt.verdict].label}
                      </span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-ink-soft leading-relaxed">{step.guidance}</p>
                  {stepAttempt && (
                    <div className="rounded-lg bg-paper-2 border border-rule p-2.5 space-y-1">
                      <p className="text-[10.5px] text-ink-soft">محاولتك:</p>
                      <p className="text-[11.5px] text-ink whitespace-pre-wrap leading-relaxed line-clamp-4">{stepAttempt.attempt}</p>
                      {stepAttempt.feedback && (
                        <p className="text-[11.5px] text-ink-soft leading-relaxed border-t border-rule pt-1.5">
                          <span className="font-bold">الفيدباك: </span>
                          {stepAttempt.feedback}
                        </p>
                      )}
                    </div>
                  )}
                  {isCurrent && (
                    <div className="space-y-2 pt-1">
                      <textarea
                        value={attempt}
                        onChange={(e) => setAttempt(e.target.value)}
                        placeholder="اكتب محاولتك للخطوة دي (حتى لو مش متأكد)…"
                        rows={3}
                        maxLength={4000}
                        className="field w-full py-2 text-xs leading-relaxed"
                      />
                      <button
                        onClick={() => void submitStep()}
                        disabled={busy || !attempt.trim()}
                        className="btn btn-marker text-[11px] px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {busy ? "بيقيّم…" : "قدّم المحاولة"}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          {currentStepIndex === -1 && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-[12px] font-bold text-emerald-700">خلّصت كل الخطوات ✓ — جرّب مسألة تانية</p>
            </div>
          )}

          <button
            onClick={() => {
              setSession(null);
              setProblem("");
              setAttempt("");
              setError(null);
            }}
            className="btn btn-quiet text-xs px-3 py-2"
          >
            مسألة جديدة
          </button>
        </div>
      )}

      {error && <p className="text-[11.5px] text-redpen">{error}</p>}
    </section>
  );
}

/** تسجيل الـ Lab كتخصص — نقطة الامتداد الرسمية (SpecializationRegistry). */
export const quantitativeLabSpecialization: LessonSpecialization = {
  id: "quantitative",
  name: "مختبر حل المشكلات",
  priority: 10,
  renderTools: (ctx) => <ProblemSolvingLab ctx={ctx} />,
};
