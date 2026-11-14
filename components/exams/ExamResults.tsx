"use client";

/* ==========================================================================
   ExamResults — شاشة النتيجة + مراجعة الأسئلة
   ============================================================================

   • الدرجة جاهزة من التسليم (`initialResult`) أو من `metadata.result`
     (لو الطالب رجع لصفحة النتيجة من القائمة).
   • المراجعة: لكل سؤال إجابتك + الإجابة الصحيحة/التفسير للآلي،
     وللمقالي: إجابتك + الإجابة النموذجية + تقييمك الذاتي.
   ========================================================================== */

import { useEffect, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ExamQuestion } from "@/lib/ai/exam-review";
import type { ExamResultPayload } from "./ExamsHub";

type ReviewRow = {
  key: string;
  question: ExamQuestion;
  answer: Record<string, unknown>;
  is_correct: boolean | null;
  self_score: number | null;
};

const TYPE_LABELS: Record<ExamQuestion["type"], string> = {
  mcq: "اختيار من متعدد",
  true_false: "صح أو خطأ",
  essay: "مقالي",
};

function shortDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ar-EG", { day: "numeric", month: "long" });
}

export function ExamResults({
  sessionId,
  initialResult,
  onBack,
  onNewExam,
}: {
  sessionId: string;
  initialResult: ExamResultPayload | null;
  onBack: () => void;
  onNewExam: (subjectName: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExamResultPayload | null>(initialResult);
  const [title, setTitle] = useState("امتحان");
  const [subjectName, setSubjectName] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      try {
        const [sessionRes, itemsRes, answersRes] = await Promise.all([
          fetch(`/api/exam-sessions/${sessionId}`),
          supabase
            .from("exam_session_items")
            .select("ordinal, result_json")
            .eq("session_id", sessionId)
            .order("ordinal", { ascending: true }),
          supabase
            .from("exam_session_answers")
            .select("question_key, answer, is_correct, self_score")
            .eq("session_id", sessionId),
        ]);
        if (cancelled) return;

        const session = (await sessionRes.json().catch(() => null)) as
          | {
              status?: string;
              created_at?: string;
              metadata?: {
                title?: string;
                subject_name?: string;
                result?: ExamResultPayload;
              } | null;
              error?: string;
            }
          | null;
        if (!sessionRes.ok || !session) throw new Error(session?.error || "مقدرناش نفتح النتيجة.");
        if (itemsRes.error) throw new Error(itemsRes.error.message);

        // بنود → أسئلة مرتبة (نفس ترتيب الورقة).
        const questionsByKey = new Map<string, ExamQuestion>();
        for (const item of (itemsRes.data ?? []) as Array<{
          ordinal: number;
          result_json: { questions?: unknown } | null;
        }>) {
          const list = Array.isArray(item.result_json?.questions) ? item.result_json!.questions : [];
          list.forEach((question, index) => {
            if (question && typeof question === "object") {
              questionsByKey.set(`${item.ordinal}:${index}`, question as ExamQuestion);
            }
          });
        }

        const answersByKey = new Map(
          ((answersRes.data ?? []) as Array<{
            question_key: string;
            answer: Record<string, unknown>;
            is_correct: boolean | null;
            self_score: number | null;
          }>).map((row) => [row.question_key, row])
        );

        const review: ReviewRow[] = [];
        for (const [key, question] of questionsByKey) {
          const answer = answersByKey.get(key);
          review.push({
            key,
            question,
            answer: (answer?.answer ?? {}) as Record<string, unknown>,
            is_correct: answer?.is_correct ?? null,
            self_score: answer?.self_score ?? null,
          });
        }

        const meta = session.metadata ?? {};
        setResult(initialResult ?? meta.result ?? null);
        setTitle(meta.title || "امتحان");
        setSubjectName(meta.subject_name || "");
        setCreatedAt(session.created_at || "");
        setRows(review);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "حصل خطأ — جرّب تاني.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialResult ثابت أثناء الرندر
  }, [sessionId]);

  if (loading) {
    return (
      <div className="py-16 text-center flex flex-col items-center gap-3">
        <span className="w-5 h-5 border-2 border-[#2A3050] border-t-amber-300 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">بنجهّز مراجعتك…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-sm text-red-400" role="alert">{error}</p>
        <button onClick={onBack} className="rounded-xl bg-[#2A3050] hover:bg-[#3A4060] px-5 py-2 text-sm font-bold transition-colors">
          رجوع لقائمتي
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition"
      >
        <ArrowRight size={15} aria-hidden />
        رجوع لقائمتي
      </button>

      {/* النتيجة */}
      <div className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-6 text-center space-y-5">
        <div className="text-3xl" aria-hidden>🎉</div>
        <div>
          <h2 className="text-xl font-extrabold">نتيجتك في {title}</h2>
          {createdAt && <p className="text-xs text-slate-500 mt-1">{shortDate(createdAt)}</p>}
        </div>

        {result ? (
          <>
            <div className="flex flex-wrap items-stretch justify-center gap-3">
              <ScoreCard
                label="إجابات آلية"
                value={`${result.auto.correct}/${result.auto.total}`}
                hint="اختيار من متعدد + صح/خطأ"
                tone="emerald"
              />
              <ScoreCard
                label="تقييم ذاتي"
                value={`${result.essay.score}/${result.essay.max}`}
                hint="أسئلة مقالية (من5 لكل سؤال)"
                tone="amber"
              />
            </div>
            <p className="text-sm text-slate-300">
              الإجمالي:{" "}
              <span className="text-2xl font-extrabold text-amber-300 ltr-num">
                {result.total.percent}%
              </span>{" "}
              · {result.total.score} من {result.total.max} درجة
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-400">الدرجة مش متاحة — راجع إجاباتك تحت.</p>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <button
            onClick={() => onNewExam(subjectName)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#0D1029] px-4 py-2 text-sm font-extrabold transition-colors"
          >
            <RefreshCw size={14} aria-hidden />
            امتحان جديد{subjectName ? ` في ${subjectName}` : ""}
          </button>
          <button
            onClick={onBack}
            className="rounded-xl border border-[#2A3050] px-4 py-2 text-sm font-bold text-slate-300 hover:border-slate-500 transition"
          >
            امتحاناتي
          </button>
        </div>
      </div>

      {/* المراجعة */}
      <section aria-label="مراجعة الأسئلة" className="space-y-3">
        <h3 className="text-sm font-extrabold text-slate-300">مراجعة الأسئلة</h3>
        {rows.map((row, index) => (
          <ReviewCard row={row} index={index} key={row.key} />
        ))}
      </section>
    </div>
  );
}

function ScoreCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "emerald" | "amber";
}) {
  return (
    <div className="rounded-2xl border border-[#2A3050] bg-[#0D1029] px-6 py-4 min-w-[9.5rem]">
      <p className={`text-2xl font-extrabold ltr-num ${tone === "emerald" ? "text-emerald-400" : "text-amber-300"}`}>
        {value}
      </p>
      <p className="text-xs font-bold text-slate-300 mt-1">{label}</p>
      <p className="text-[10px] text-slate-500 mt-0.5">{hint}</p>
    </div>
  );
}

function ReviewCard({ row, index }: { row: ReviewRow; index: number }) {
  const { question, answer, is_correct, self_score } = row;
  const [openModel, setOpenModel] = useState(false);

  const statusIcon =
    question.type === "essay"
      ? "⭐"
      : is_correct === true
        ? "✅"
        : is_correct === false
          ? "❌"
          : "⭕";

  return (
    <article className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-5 space-y-3">
      <div className="flex items-start gap-2.5">
        <span className="text-base shrink-0 mt-0.5" aria-hidden>{statusIcon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold text-slate-500 mb-1">
            سؤال {index + 1} · {TYPE_LABELS[question.type]}
            {question.type === "essay" && self_score != null && (
              <span className="text-amber-300"> · تقييمك: {self_score}/5</span>
            )}
          </p>
          <p className="text-sm font-bold leading-relaxed text-[#F0E6D2]">{question.question}</p>
        </div>
      </div>

      {/* إجابة الطالب */}
      <div className="rounded-xl bg-[#0D1029] border border-[#2A3050] p-3 space-y-1">
        <p className="text-[10px] font-extrabold text-slate-500">إجابتك</p>
        {question.type === "mcq" && (
          <p className="text-sm text-slate-300">
            {typeof answer.option === "number"
              ? `${["أ", "ب", "ج", "د"][answer.option]} — ${question.options[answer.option] ?? ""}`
              : "—"}
          </p>
        )}
        {question.type === "true_false" && (
          <p className="text-sm text-slate-300">{answer.value === true ? "✔ صح" : answer.value === false ? "✘ خطأ" : "—"}</p>
        )}
        {question.type === "essay" && (
          <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
            {(answer.text as string) || "—"}
          </p>
        )}
      </div>

      {/* الإجابة الصحيحة/النموذجية */}
      {question.type === "mcq" && (
        <div className="text-sm">
          <span className="text-slate-500">الصحيح: </span>
          <span className={is_correct ? "text-emerald-400" : "text-emerald-400"}>
            {["أ", "ب", "ج", "د"][question.correctAnswer]} — {question.options[question.correctAnswer]}
          </span>
        </div>
      )}
      {question.type === "true_false" && (
        <div className="text-sm">
          <span className="text-slate-500">الصحيح: </span>
          <span className="text-emerald-400">{question.correct ? "✔ صح" : "✘ خطأ"}</span>
        </div>
      )}
      {question.type === "mcq" || question.type === "true_false" ? (
        question.explanation ? (
          <p className="text-xs text-slate-400 leading-relaxed border-t border-[#2A3050] pt-2">
            💡 {question.explanation}
          </p>
        ) : null
      ) : (
        <div className="border-t border-[#2A3050] pt-2">
          <button
            onClick={() => setOpenModel((value) => !value)}
            className="text-xs font-bold text-amber-300 hover:text-amber-200 transition"
            aria-expanded={openModel}
          >
            {openModel ? "إخفاء الإجابة النموذجية" : "أظهر الإجابة النموذجية"}
          </button>
          {openModel && (
            <div className="mt-2 space-y-2">
              <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                {question.modelAnswer}
              </p>
              <ul className="space-y-1">
                {question.rubric.map((point, i) => (
                  <li key={i} className="text-xs text-slate-400 flex items-start gap-2">
                    <span className="text-amber-300 mt-0.5" aria-hidden>•</span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
