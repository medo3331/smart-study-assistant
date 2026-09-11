"use client";
/* eslint-disable react-hooks/set-state-in-effect -- University subject sync is intentional */

import { useState, useEffect } from "react";

interface Recommendation {
  intent: string;
  message: string;
  recommendedActions: Array<{ capability: string; label: string; href: string; reason: string }>;
}

interface Props {
  onRecommendation?: (rec: Recommendation, goal: string) => void;
  departmentName?: string | null;
  externalGoal?: string | null;
  onExternalGoalConsumed?: () => void;
  onOpenAi?: (subjectName: string) => void;
  onOpenLesson?: (subjectName?: string) => void;
}

const EXAMPLES = [
  "عايز أذاكر الخوارزميات",
  "عايز أحل أسئلة",
  "عايز أراجع مادة",
  "عايز خطة للمذاكرة",
];

export function UniversityGoalInput({ onRecommendation, departmentName, externalGoal, onExternalGoalConsumed, onOpenAi, onOpenLesson }: Props) {
  const [goal, setGoal] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Recommendation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState<string | null>(null);
  const [explainContent, setExplainContent] = useState<string | null>(null);
  const [explainTitle, setExplainTitle] = useState<string | null>(null);

  useEffect(() => {
    if (externalGoal && externalGoal.trim().length > 1) {
      setGoal(externalGoal);
      void submit(externalGoal);
      onExternalGoalConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalGoal]);

  async function submit(g: string) {
    const trimmed = g.trim();
    if (!trimmed || trimmed.length < 2) {
      setError("اكتب هدفك أولاً");
      return;
    }
    setLoading(true);
    setError(null);
    setExplainContent(null);
    try {
      const res = await fetch("/api/university/goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: trimmed }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "تعذر الاتصال");
      const rec: Recommendation = json.data;
      setResult(rec);
      onRecommendation?.(rec, trimmed);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطأ";
      setError("حصل خلل بسيط. جرّب تاني");
      setResult({
        intent: "general",
        message: "حدد مادة تخصصك ونبدأ بخطة جامعية",
        recommendedActions: [
          { capability: "study", label: "ذاكر المادة", href: "/dashboard", reason: "شرح أكاديمي" },
          { capability: "quiz", label: "حل أسئلة", href: "/exams", reason: "تدريب" },
        ],
      });
      console.error("[UniversityGoalInput]", msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(cap: string, label: string) {
    const baseGoal = goal.trim() || result?.message || "";
    if ((cap === "study" || cap === "practice") && onOpenAi) {
      onOpenAi(baseGoal || label);
      return;
    }
    if ((cap === "quiz" || cap === "exam") && onOpenAi) {
      onOpenAi(baseGoal ? `${cap} ${baseGoal}` : label);
      return;
    }
    if (cap === "study_plan" && onOpenLesson) {
      onOpenLesson(baseGoal);
      return;
    }
    if (cap === "study" || cap === "practice" || cap === "quiz" || cap === "exam") {
      const promptMap: Record<string, string> = {
        study: `اشرحلي ${baseGoal || "المادة"} لطلاب جامعة تخصص ${departmentName || "عام"} بأسلوب أكاديمي معمق`,
        practice: `راجعلي ${baseGoal || "المادة"} مع خلاصة ونقاط مهمة`,
        quiz: `اعملي 4 أسئلة جامعية عن ${baseGoal || "المادة"} مع إجابات`,
        exam: `اعملي امتحان جامعي شامل عن ${baseGoal || "المادة"} مع نموذج إجابة`,
      };
      const prompt = promptMap[cap] || `اشرحلي ${baseGoal}`;
      setExplainLoading(cap);
      setExplainContent(null);
      setExplainTitle(label);
      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task: cap === "study" || cap === "practice" ? "explain" : "chat",
            messages: [{ role: "user", content: prompt }],
            user: { role: "student", language: "ar", educationLevel: `university ${departmentName || ""}` },
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error?.message || "تعذر");
        setExplainContent((json.data?.content || "").slice(0, 4000));
      } catch {
        setExplainContent("حصل خلل بسيط. جرّب تاني");
      } finally {
        setExplainLoading(null);
      }
      return;
    }
    if (cap === "study_plan") {
      setExplainTitle("خطة جامعية");
      setExplainContent("• حدد مواد الفصل\n• 60 دقيقة لكل مادة\n• مشروع تطبيقي أسبوعي\n• مراجعة مع المساعد");
    }
  }

  return (
    <section aria-label="هدف جامعي" className="sheet-card overflow-hidden">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-[1.03rem] font-semibold text-ink">ما هدفك الأكاديمي اليوم؟</h2>
            <p className="mt-1 text-sm leading-6 text-ink-soft">هدف واضح يقود تقدمك الجامعي.</p>
          </div>
          <span aria-hidden className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">🎓</span>
        </div>

        <div className="mt-4 flex gap-2">
          <label htmlFor="uni-goal-input" className="sr-only">هدف اليوم</label>
          <input
            id="uni-goal-input"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !loading) void submit(goal); }}
            placeholder="مثال: عايز أذاكر الخوارزميات"
            className="flex-1 rounded-xl border border-rule bg-paper-2 px-4 py-3 text-sm text-ink placeholder:text-ink-soft/60 focus:border-ink/20 focus:outline-none focus:ring-2 focus:ring-slate-200"
            disabled={loading}
            dir="rtl"
            autoComplete="off"
          />
          <button type="button" onClick={() => void submit(goal)} disabled={loading} className="inline-flex shrink-0 items-center justify-center rounded-xl bg-ink px-5 py-3 text-sm font-bold text-white hover:bg-ink/90 disabled:opacity-50">
            {loading ? "…" : "ابدأ"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => { setGoal(ex); void submit(ex); }} disabled={loading} className="rounded-full border border-rule bg-paper px-3.5 py-1.5 text-xs font-medium text-ink-soft hover:text-ink hover:bg-paper-3">
              {ex}
            </button>
          ))}
        </div>

        {error && <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 border border-amber-200">{error}</p>}

        {result && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-ink">{result.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {result.recommendedActions.map((a) => (
                <button key={a.capability} type="button" onClick={() => void handleAction(a.capability, a.label)} disabled={!!explainLoading} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs font-bold text-white hover:bg-ink/90 disabled:opacity-50">
                  <span>{a.label}</span>
                  {explainLoading === a.capability ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <span aria-hidden className="text-[10px]">→</span>}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-ink-soft">{result.recommendedActions.map(a=>a.reason).join(" · ")}</p>
          </div>
        )}

        {explainContent && (
          <div className="mt-4 rounded-xl border border-rule bg-paper-2 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-ink">{explainTitle || "الشرح"}</h3>
              <button type="button" onClick={() => setExplainContent(null)} className="text-xs text-ink-soft underline">إخفاء</button>
            </div>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-ink">{explainContent}</div>
          </div>
        )}
      </div>
    </section>
  );
}
