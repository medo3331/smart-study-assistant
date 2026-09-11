"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Baccalaureate subject sync is intentional */

import { useState, useEffect } from "react";

interface Recommendation {
  intent: string;
  message: string;
  recommendedActions: Array<{ capability: string; label: string; href: string; reason: string }>;
}

interface Props {
  onRecommendation?: (rec: Recommendation, goal: string) => void;
  gradeName?: string | null;
  trackName?: string | null;
  externalGoal?: string | null;
  onExternalGoalConsumed?: () => void;
  onOpenAi?: (subjectName: string) => void;
  onOpenLesson?: (subjectName?: string) => void;
}

const EXAMPLES = [
  "عايز أذاكر الأحياء",
  "عايز أحل امتحان شامل",
  "عايز أراجع الفصل",
  "عايز خطة بكالوريا",
];

export function BaccalaureateGoalInput({ onRecommendation, gradeName, trackName, externalGoal, onExternalGoalConsumed, onOpenAi, onOpenLesson }: Props) {
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
      const res = await fetch("/api/baccalaureate/goal", {
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
        message: "حدد مادة مسارك ونبدأ بخطة بكالوريا",
        recommendedActions: [
          { capability: "study", label: "ذاكر الدرس", href: "/dashboard", reason: "شرح معمق" },
          { capability: "exam", label: "امتحان شامل", href: "/exams", reason: "محاكاة" },
        ],
      });
      console.error("[BaccGoalInput]", msg);
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
      const ctx = `${gradeName || "البكالوريا"}${trackName ? ` ${trackName}` : ""}`;
      const promptMap: Record<string, string> = {
        study: `اشرحلي ${baseGoal || "الدرس"} لطلاب بكالوريا مسار ${ctx} بأسلوب معمق مع أمثلة امتحانية`,
        practice: `راجعلي ${baseGoal || "الدرس"} لبكالوريا ${ctx} مع أهم النقاط المتوقعة في الامتحان`,
        quiz: `اعملي 4 أسئلة بكالوريا عن ${baseGoal || "الدرس"} مسار ${ctx} مع إجابات`,
        exam: `اعملي امتحان بكالوريا شامل 5 أسئلة عن ${baseGoal || "الدرس"} مسار ${ctx} مع نموذج إجابة`,
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
            user: { role: "student", language: "ar", educationLevel: `baccalaureate ${ctx}` },
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
      setExplainTitle("خطة بكالوريا");
      setExplainContent("• حدد مواد مسارك الأساسية\n• 60 دقيقة لكل مادة مع مراجعة\n• امتحان أسبوعي شامل\n• متابعة مع المساعد للتصحيح");
    }
  }

  return (
    <section aria-label="هدف البكالوريا" className="sheet-card overflow-hidden border-amber-200/30">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-[1.03rem] font-semibold text-ink">ما هدفك في البكالوريا اليوم؟</h2>
            <p className="mt-1 text-sm leading-6 text-ink-soft">هدف مركز يقربك من الجامعة.</p>
          </div>
          <span aria-hidden className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-white">🎓</span>
        </div>

        <div className="mt-4 flex gap-2">
          <label htmlFor="bacc-goal-input" className="sr-only">هدف اليوم</label>
          <input
            id="bacc-goal-input"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !loading) void submit(goal); }}
            placeholder="مثال: عايز أحل امتحان أحياء شامل"
            className="flex-1 rounded-xl border border-amber-200/50 bg-amber-50/30 px-4 py-3 text-sm text-ink placeholder:text-ink-soft/60 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-100"
            disabled={loading}
            dir="rtl"
            autoComplete="off"
          />
          <button type="button" onClick={() => void submit(goal)} disabled={loading} className="inline-flex shrink-0 items-center justify-center rounded-xl bg-amber-600 px-5 py-3 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50">
            {loading ? "…" : "ابدأ"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => { setGoal(ex); void submit(ex); }} disabled={loading} className="rounded-full border border-rule bg-paper px-3.5 py-1.5 text-xs font-medium text-ink-soft hover:text-ink hover:bg-amber-50">
              {ex}
            </button>
          ))}
        </div>

        {error && <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 border border-amber-200">{error}</p>}

        {result && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
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
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-paper-2 p-4">
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
