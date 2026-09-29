
"use client";
/* ============================================================================
   ExamBankViewer
   ----------------------------------------------------------------------------
   Phase 4.4-F. Reads GET /api/exam-bank/questions?examId=... instead of
   querying a table directly from the browser.

   The old version selected correct_option_index and spread the whole row
   into component state with `{...q}`. That put the answer key in the network
   response, in React state, and one render away from the DOM — a student
   opening devtools had every correct answer for every published question in
   the bank. Not displaying a field is not the same as not having it, and
   the API now does not return it at all.

   It also defaulted to a hard-coded Mathematics subject id, so it showed
   Math questions on any exam page, and it printed a hard-coded year and
   source in the header. The exam's own title and its subject now come from
   the API response, so opening a different exam shows that exam.

   The viewer takes an examId rather than a subjectId: the public exam bank
   is organised by exam, and resolving the subject from the exam is the
   server's job.
   ========================================================================== */
import React, { useState, useEffect } from "react";

interface ViewerQuestion {
  id: string;
  question_number: number | null;
  question_text: string;
  question_type: string;
  marks: number | null;
  options: string[];
  topic: string | null;
  difficulty: string | null;
}

interface ViewerExam {
  id: string;
  title: string;
  subject_id: string;
  exam_date: string | null;
}

const OPTION_LETTERS = "ABCDEFGH";

export default function ExamBankViewer({ examId }: { examId?: string }) {
  const [exam, setExam] = useState<ViewerExam | null>(null);
  const [questions, setQuestions] = useState<ViewerQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!examId) {
      setLoading(false);
      setError("مفيش امتحان محدد.");
      return;
    }

    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/exam-bank/questions?examId=${encodeURIComponent(examId)}`, {
          signal: controller.signal,
        });
        const payload = await res.json().catch(() => null);

        if (!res.ok) {
          setError(
            typeof payload?.error === "string"
              ? payload.error
              : "تعذر تحميل الأسئلة — يرجى المحاولة لاحقًا."
          );
          return;
        }

        setExam(payload?.exam ?? null);
        setQuestions(Array.isArray(payload?.questions) ? payload.questions : []);
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        setError("تعذر تحميل الأسئلة — يرجى المحاولة لاحقًا.");
      } finally {
        setLoading(false);
      }
    };

    load();
    return () => controller.abort();
  }, [examId]);

  if (loading) {
    return (
      <div dir="rtl" className="p-8 text-center text-[var(--muted-foreground)]">
        جارٍ تحميل الأسئلة...
      </div>
    );
  }
  if (error) {
    return <div dir="rtl" className="p-8 text-center text-red-500">{error}</div>;
  }
  if (questions.length === 0) {
    return (
      <div dir="rtl" className="p-8 text-center text-[var(--muted-foreground)]">
        لا توجد أسئلة متاحة حالياً.
      </div>
    );
  }

  return (
    <div dir="rtl" className="w-full max-w-3xl mx-auto p-6 space-y-6" style={{ color: "var(--foreground)" }}>
      {/* The title is the exam's own, from the API. It used to be a literal
          string naming a year we cannot substantiate. */}
      {exam?.title ? (
        <h2 className="text-2xl font-bold text-center">{exam.title}</h2>
      ) : null}
      <p className="text-center text-sm text-[var(--muted-foreground)]">
        {questions.length} سؤال
      </p>

      {questions.map((q, idx) => (
        <div key={q.id} className="p-5 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-3">
          <div className="font-bold text-lg">
            {q.question_number ?? idx + 1}. {q.question_text}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {q.options.map((opt, i) => (
              <button
                key={i}
                className="p-3 rounded-lg border border-[var(--border)] hover:bg-[var(--accent)] hover:text-white text-right"
                aria-label={`Option ${OPTION_LETTERS[i] ?? i + 1}`}
              >
                {OPTION_LETTERS[i] ?? i + 1}. {opt}
              </button>
            ))}
          </div>
          {/* Only facts the API returned. The old footer printed a hard-coded
              source and a hard-coded difficulty default that had nothing to
              do with the question on screen. */}
          <div className="text-xs text-[var(--muted-foreground)]">
            {q.topic ? `الموضوع: ${q.topic}` : null}
            {q.marks != null ? ` • الدرجة: ${q.marks}` : null}
            {q.difficulty ? ` • صعوبة: ${q.difficulty}` : null}
          </div>
        </div>
      ))}

      {/* Grading is a separate server action that this phase does not build.
          The button says so rather than pretending to submit. */}
      <div className="text-center pt-4">
        <button
          type="button"
          className="px-8 py-3 rounded-lg bg-[var(--accent)] text-white font-bold"
          title="التسليم بيتم على السيرفر"
        >
          تسليم الإجابات
        </button>
      </div>
    </div>
  );
}

