"use client";

/* ==========================================================================
   ExamPaper — حلّ ورقة الامتحان (سؤال بسؤال + حفظ تلقائي)
   ============================================================================

   • الأسئلة تُقرأ مباشرة من `exam_session_items.result_json` (RLS: المالك
     يقرأ) — مفتاح السؤال `"<ordinal>:<index>"` نفس اللي بيتبعت في الإجابات.
   • الحفظ التلقائي (`final:false` debounce) + مسودة `localStorage` → الورقة
     **قابلة للاستئناف** بعد إغلاق الصفحة.
   • التسليم (`final:true`) بيبعت **كل** الإجابات دفعة واحدة → السيرفر
     يصحّح الآلي ويشترط اكتمال المقالي (نص + تقييم ذاتي0..5) ويرجّع الدرجة.
   • الإجابة النموذجية للمقالي بتظهر **بعد كتابة إجابته** + تقييم ذاتي
     (الخطة: تصحيح ذاتي — تصحيح AI = V2).
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, Send, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ExamQuestion } from "@/lib/ai/exam-review";
import type { ExamResultPayload } from "./ExamsHub";

type PaperQuestion = {
  key: string;
  question: ExamQuestion;
};

type DraftAnswer = {
  option?: number;
  value?: boolean;
  text?: string;
  self_score?: number;
};

const TYPE_LABELS: Record<ExamQuestion["type"], string> = {
  mcq: "اختيار من متعدد",
  true_false: "صح أو خطأ",
  essay: "مقالي",
};

const OPTION_LETTERS = ["أ", "ب", "ج", "د"];

function draftKey(sessionId: string): string {
  return `magicly:exam-draft:${sessionId}`;
}

function isAnswered(question: ExamQuestion, draft: DraftAnswer | undefined): boolean {
  if (!draft) return false;
  if (question.type === "mcq") return typeof draft.option === "number";
  if (question.type === "true_false") return typeof draft.value === "boolean";
  return Boolean(draft.text?.trim()) && typeof draft.self_score === "number";
}

/** ما يصلح للحفظ الجزئي (السيرفر يشترط شكل الإجابة الكامل حسب النوع). */
function isPersistable(question: ExamQuestion, draft: DraftAnswer | undefined): boolean {
  if (!draft) return false;
  if (question.type === "essay") {
    return Boolean(draft.text?.trim()) && typeof draft.self_score === "number";
  }
  return isAnswered(question, draft);
}

function toPayload(question: ExamQuestion, draft: DraftAnswer) {
  if (question.type === "mcq") return { option: draft.option };
  if (question.type === "true_false") return { value: draft.value };
  return { text: draft.text ?? "" };
}

export function ExamPaper({
  sessionId,
  onDone,
  onExit,
}: {
  sessionId: string;
  onDone: (result: ExamResultPayload) => void;
  onExit: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("امتحان");
  const [questions, setQuestions] = useState<PaperQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, DraftAnswer>>({});
  const [current, setCurrent] = useState(0);
  const [showModel, setShowModel] = useState<Record<string, boolean>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const hydratedRef = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── تحميل الورقة + المسودة ──
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      try {
        const [sessionRes, itemsRes, answersRes] = await Promise.all([
          fetch(`/api/exam-sessions/${sessionId}`),
          supabase
            .from("exam_session_items")
            .select("id, ordinal, result_json")
            .eq("session_id", sessionId)
            .order("ordinal", { ascending: true }),
          supabase
            .from("exam_session_answers")
            .select("question_key, answer, self_score")
            .eq("session_id", sessionId),
        ]);
        if (cancelled) return;

        const session = (await sessionRes.json().catch(() => null)) as
          | { status?: string; metadata?: { title?: string } | null; error?: string }
          | null;
        if (!sessionRes.ok || !session) throw new Error(session?.error || "مقدرناش نفتح الامتحان.");
        if (session.status === "completed") {
          throw new Error("الامتحان اتسجّل بالفعل — راجع نتيجتك من القائمة.");
        }
        if (session.status !== "ready") {
          throw new Error("الامتحان لسه بيتجهّز — استنى شوية وارجع تاني.");
        }
        if (itemsRes.error) throw new Error(itemsRes.error.message);

        const flat: PaperQuestion[] = [];
        for (const item of (itemsRes.data ?? []) as Array<{
          ordinal: number;
          result_json: { questions?: unknown } | null;
        }>) {
          const list = Array.isArray(item.result_json?.questions) ? item.result_json!.questions : [];
          list.forEach((question, index) => {
            if (question && typeof question === "object") {
              flat.push({ key: `${item.ordinal}:${index}`, question: question as ExamQuestion });
            }
          });
        }
        if (flat.length === 0) throw new Error("مفيش أسئلة في الورقة دي.");

        // الإجابات المحفوظة (من التسليم الجزئي) + مسودة localStorage (الأحدث).
        const saved: Record<string, DraftAnswer> = {};
        for (const row of (answersRes.data ?? []) as Array<{
          question_key: string;
          answer: Record<string, unknown>;
          self_score: number | null;
        }>) {
          saved[row.question_key] = {
            ...(typeof row.answer.option === "number" ? { option: row.answer.option } : {}),
            ...(typeof row.answer.value === "boolean" ? { value: row.answer.value } : {}),
            ...(typeof row.answer.text === "string" ? { text: row.answer.text } : {}),
            ...(row.self_score != null ? { self_score: row.self_score } : {}),
          };
        }
        let draft: Record<string, DraftAnswer> = saved;
        try {
          const local = window.localStorage.getItem(draftKey(sessionId));
          if (local) {
            draft = { ...saved, ...(JSON.parse(local) as Record<string, DraftAnswer>) };
          }
        } catch {
          // مسودة فاسدة — نتجاهلها ونكمّل بالمحفوظ.
        }

        setTitle(session.metadata?.title || "امتحان");
        setQuestions(flat);
        setAnswers(draft);
        setLoadError(null);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "مقدرناش نفتح الامتحان.");
      } finally {
        if (!cancelled) {
          hydratedRef.current = true;
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // ── الحفظ التلقائي (debounce) — بعد التحميل فقط ──
  const persistPartial = useCallback(async () => {
    const supabase = createClient();
    const entries = questions
      .map((paper) => ({ paper, draft: answers[paper.key] }))
      .filter(({ paper, draft }) => isPersistable(paper.question, draft))
      .map(({ paper, draft }) => ({
        question_key: paper.key,
        answer: toPayload(paper.question, draft!),
        ...(paper.question.type === "essay" ? { self_score: draft!.self_score } : {}),
      }));
    if (entries.length === 0) return;

    // مسودة محلية دائمًا (ضد إغلاق الصفحة فجأة).
    try {
      window.localStorage.setItem(draftKey(sessionId), JSON.stringify(answers));
    } catch {
      // تخزين ممتلئ/محظور — الحفظ السيرفري كافي.
    }

    setSaveState("saving");
    try {
      const response = await fetch(`/api/exam-sessions/${sessionId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ final: false, answers: entries }),
      });
      if (response.ok) setSaveState("saved");
    } catch {
      // أوفلاين/خطأ مؤقت — المسودة المحلية محفوظة والتسليم هيرسلّم الكل.
    } finally {
      setSaveState((value) => (value === "saving" ? "idle" : value));
    }
  }, [answers, questions, sessionId]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => void persistPartial(), 800);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- حفظ عند تغيّر الإجابات فقط
  }, [answers]);

  const question = questions[current];
  const answeredCount = useMemo(
    () => questions.filter((paper) => isAnswered(paper.question, answers[paper.key])).length,
    [questions, answers]
  );

  function patchAnswer(key: string, patch: Partial<DraftAnswer>) {
    setSubmitError(null);
    setAnswers((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitError(null);

    // فحص محلي الأول (أسرع من الـ409).
    const missingIndex = questions.findIndex(
      (paper) => !isAnswered(paper.question, answers[paper.key])
    );
    if (missingIndex >= 0) {
      setCurrent(missingIndex);
      setSubmitError("في أسئلة لسه من غير إجابة — كمّلها الأول.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = questions.map((paper) => ({
        question_key: paper.key,
        answer: toPayload(paper.question, answers[paper.key]),
        ...(paper.question.type === "essay"
          ? { self_score: answers[paper.key].self_score }
          : {}),
      }));
      const response = await fetch(`/api/exam-sessions/${sessionId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ final: true, answers: payload }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.result) {
        if (response.status === 409 && data?.error === "INCOMPLETE") {
          setSubmitError("في أسئلة ناقصة عندنا — راجعها وجرّب تاني.");
        } else {
          throw new Error(data?.error || "مقدرناش نسجّل إجاباتك — جرّب تاني.");
        }
        return;
      }
      try {
        window.localStorage.removeItem(draftKey(sessionId));
      } catch {
        // تجاهل
      }
      onDone(data.result as ExamResultPayload);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "حصل خطأ — جرّب تاني.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="py-16 text-center flex flex-col items-center gap-3">
        <span className="w-5 h-5 border-2 border-[#2A3050] border-t-amber-300 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">بنفتح الورقة…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-sm text-red-400" role="alert">{loadError}</p>
        <button
          onClick={onExit}
          className="rounded-xl bg-[#2A3050] hover:bg-[#3A4060] px-5 py-2 text-sm font-bold transition-colors"
        >
          رجوع لقائمتي
        </button>
      </div>
    );
  }

  if (!question) return null;

  const isLast = current === questions.length - 1;
  const draft = answers[question.key];

  return (
    <div className="space-y-4" dir="rtl">
      {/* رأس الورقة */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onExit}
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition"
        >
          <X size={15} aria-hidden />
          خروج (الإجابات محفوظة)
        </button>
        <span className="text-[11px] text-slate-500">
          {saveState === "saving" ? "بيتحفظ…" : saveState === "saved" ? "محفوظ ✓" : "\u00A0"}
        </span>
      </div>

      <div className="rounded-2xl border border-[#2A3050] bg-[#13182E] px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-extrabold">{title}</h2>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="ltr-num">
            سؤال {current + 1} من {questions.length}
          </span>
          <span className="ltr-num text-emerald-400">{answeredCount} متجاوب</span>
        </div>
      </div>

      {/* نقاط التنقّل */}
      <div className="flex flex-wrap gap-1.5" aria-label="تنقّل بين الأسئلة">
        {questions.map((paper, index) => {
          const done = isAnswered(paper.question, answers[paper.key]);
          return (
            <button
              key={paper.key}
              onClick={() => setCurrent(index)}
              aria-label={`السؤال ${index + 1}${done ? " — متجاوب" : ""}`}
              aria-current={index === current || undefined}
              className={`w-7 h-7 rounded-full text-[10px] font-bold border transition ${
                index === current
                  ? "border-amber-400 bg-amber-400 text-[#0D1029]"
                  : done
                    ? "border-emerald-700 bg-emerald-950/60 text-emerald-300"
                    : "border-[#2A3050] text-slate-500 hover:border-slate-500"
              }`}
            >
              {index + 1}
            </button>
          );
        })}
      </div>

      {/* السؤال */}
      <article className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-6 space-y-5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-amber-950/40 border border-amber-800/40 text-amber-300">
            {TYPE_LABELS[question.question.type]}
          </span>
        </div>

        <p className="text-base font-bold leading-relaxed text-[#F0E6D2]">
          {question.question.question}
        </p>

        {/* MCQ */}
        {question.question.type === "mcq" && (
          <ul className="space-y-2">
            {question.question.options.map((option, index) => {
              const active = draft?.option === index;
              return (
                <li key={index}>
                  <button
                    onClick={() => patchAnswer(question.key, { option: index })}
                    aria-pressed={active}
                    className={`w-full text-right rounded-xl border px-4 py-3 flex items-start gap-3 transition ${
                      active
                        ? "border-amber-400 bg-amber-400/10"
                        : "border-[#2A3050] bg-[#0D1029] hover:border-slate-500"
                    }`}
                  >
                    <span
                      className={`mt-0.5 w-6 h-6 rounded-full border grid place-items-center text-xs font-extrabold shrink-0 ${
                        active ? "border-amber-400 bg-amber-400 text-[#0D1029]" : "border-slate-600 text-slate-400"
                      }`}
                      aria-hidden
                    >
                      {OPTION_LETTERS[index]}
                    </span>
                    <span className="text-sm leading-relaxed text-slate-200">{option}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* صح/خطأ */}
        {question.question.type === "true_false" && (
          <div className="grid grid-cols-2 gap-3">
            {[true, false].map((value) => {
              const active = draft?.value === value;
              return (
                <button
                  key={String(value)}
                  onClick={() => patchAnswer(question.key, { value })}
                  aria-pressed={active}
                  className={`rounded-xl border py-4 text-sm font-extrabold transition ${
                    active
                      ? "border-amber-400 bg-amber-400/15 text-amber-300"
                      : "border-[#2A3050] bg-[#0D1029] text-slate-300 hover:border-slate-500"
                  }`}
                >
                  {value ? "✔ صح" : "✘ خطأ"}
                </button>
              );
            })}
          </div>
        )}

        {/* مقالي — إجابته الأول، وبعدها النموذجية + التقييم الذاتي */}
        {question.question.type === "essay" && (
          <div className="space-y-4">
            <textarea
              value={draft?.text ?? ""}
              onChange={(e) => patchAnswer(question.key, { text: e.target.value })}
              rows={7}
              placeholder="اكتب إجابتك هنا…"
              className="w-full bg-[#0D1029] border border-[#2A3050] rounded-xl px-4 py-3 text-sm leading-relaxed text-[#F0E6D2] placeholder:text-slate-500 focus:outline-none focus:border-amber-300 resize-y"
              aria-label="إجابة السؤال المقالي"
            />

            {!showModel[question.key] ? (
              <button
                onClick={() => setShowModel((prev) => ({ ...prev, [question.key]: true }))}
                disabled={!draft?.text?.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#2A3050] px-4 py-2 text-xs font-bold text-slate-300 hover:border-slate-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Eye size={14} aria-hidden />
                أظهر الإجابة النموذجية وقيّم نفسك
              </button>
            ) : (
              <div className="rounded-xl border border-[#2A3050] bg-[#0D1029] p-4 space-y-3">
                <p className="text-[11px] font-extrabold text-amber-300">الإجابة النموذجية</p>
                <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">
                  {question.question.modelAnswer}
                </p>
                <div>
                  <p className="text-[11px] font-extrabold text-slate-400 mb-1.5">معايير التقييم</p>
                  <ul className="space-y-1">
                    {question.question.rubric.map((point, index) => (
                      <li key={index} className="text-xs text-slate-400 flex items-start gap-2">
                        <span className="text-amber-300 mt-0.5" aria-hidden>•</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="pt-2 border-t border-[#2A3050] flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-400">قيّم إجابتك:</span>
                  {[1, 2, 3, 4, 5].map((score) => {
                    const active = draft?.self_score === score;
                    return (
                      <button
                        key={score}
                        onClick={() => patchAnswer(question.key, { self_score: score })}
                        aria-pressed={active}
                        aria-label={`تقييم ${score} من5`}
                        className={`w-8 h-8 rounded-full border text-xs font-extrabold transition ${
                          active
                            ? "border-amber-400 bg-amber-400 text-[#0D1029]"
                            : "border-[#2A3050] text-slate-400 hover:border-slate-500"
                        }`}
                      >
                        {score}
                      </button>
                    );
                  })}
                  <span className="text-[11px] text-slate-500">من5 درجات</span>
                </div>
              </div>
            )}
          </div>
        )}
      </article>

      {/* التنقّل + التسليم */}
      {submitError && (
        <p className="text-sm text-red-400" role="alert">
          {submitError}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setCurrent((value) => Math.max(0, value - 1))}
          disabled={current === 0}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#2A3050] px-4 py-2.5 text-sm font-bold text-slate-300 hover:border-slate-500 transition disabled:opacity-40"
        >
          <ArrowRight size={15} aria-hidden />
          السابق
        </button>

        {isLast ? (
          <button
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-[#0D1029] px-6 py-2.5 text-sm font-extrabold transition-colors"
          >
            <Send size={15} aria-hidden />
            {submitting ? "بيتسجّل…" : "تسليم الامتحان"}
          </button>
        ) : (
          <button
            onClick={() => setCurrent((value) => Math.min(questions.length - 1, value + 1))}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#0D1029] px-5 py-2.5 text-sm font-extrabold transition-colors"
          >
            التالي
            <ArrowLeft size={15} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
