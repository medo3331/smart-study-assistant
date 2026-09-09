"use client";
/* eslint-disable react-hooks/set-state-in-effect -- Primary subject selection sync is intentional; externalGoal is external system */

import { useState, useEffect } from "react";

interface Recommendation {
  intent: string;
  message: string;
  recommendedActions: Array<{ capability: string; label: string; href: string; reason: string }>;
}

interface Props {
  onRecommendation?: (rec: Recommendation, goal: string) => void;
  gradeName?: string | null;
  externalGoal?: string | null;
  onExternalGoalConsumed?: () => void;
  onOpenAi?: (subjectName: string) => void;
  onOpenLesson?: (subjectName?: string) => void;
}

const EXAMPLES = [
  "عايز أذاكر الرياضيات",
  "عايز أحل أسئلة",
  "عايز أراجع الدرس",
  "عايز أعمل خطة",
];

export function PrimaryGoalInput({ onRecommendation, gradeName, externalGoal, onExternalGoalConsumed, onOpenAi, onOpenLesson }: Props) {
  const [goal, setGoal] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Recommendation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState<string | null>(null);
  const [explainContent, setExplainContent] = useState<string | null>(null);
  const [explainTitle, setExplainTitle] = useState<string | null>(null);

  // Sync external subject selection into goal input (intentional sync with external system)
  useEffect(() => {
    if (externalGoal && externalGoal.trim().length > 1) {
      setGoal(externalGoal);
      void submit(externalGoal);
      onExternalGoalConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- submit is stable for this effect
  }, [externalGoal]);

  async function submit(g: string) {
    const trimmed = g.trim();
    if (!trimmed || trimmed.length < 2) {
      setError("اكتب هدفك الصغير أولاً ✏️");
      return;
    }
    setLoading(true);
    setError(null);
    setExplainContent(null);
    try {
      const res = await fetch("/api/primary/goal", {
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
      const msg = e instanceof Error ? e.message : "حصل خطأ";
      setError("حصل خلل بسيط. جرّب تاني أو اختار مادة من تحت 🌟");
      setResult({
        intent: "general",
        message: "ابدأ باختيار المادة اللي تحبها ونذاكرها مع بعض 📚",
        recommendedActions: [
          { capability: "study", label: "اشرحلي الدرس", href: "/dashboard", reason: "ابدأ بدرس صغير" },
          { capability: "quiz", label: "حل أسئلة", href: "/exams", reason: "اختبر فهمك" },
        ],
      });
      console.error("[PrimaryGoalInput] error", msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(cap: string, label: string) {
    const baseGoal = goal.trim() || result?.message || "";
    // Prefer real lesson/AI assistant when wired (actual study)
    if ((cap === "study" || cap === "practice") && onOpenAi) {
      onOpenAi(baseGoal || label);
      return;
    }
    if (cap === "quiz" && onOpenAi) {
      onOpenAi(baseGoal ? `quiz ${baseGoal}` : label);
      return;
    }
    if (cap === "study_plan" && onOpenLesson) {
      onOpenLesson(baseGoal);
      return;
    }
    if (cap === "study" || cap === "practice" || cap === "quiz") {
      const promptMap: Record<string, string> = {
        study: "اشرحلي " + (baseGoal || "الدرس") + " بطريقة بسيطة جداً للصف " + (gradeName || "الابتدائي") + " مع مثال سهل وسؤال صغير في الآخر",
        practice: "راجعلي " + (baseGoal || "الدرس") + " بسرعة مع أهم النقاط",
        quiz: "اعملي 3 أسئلة بسيطة عن " + (baseGoal || "الدرس") + " للصف " + (gradeName || "الابتدائي") + " مع الإجابات",
      };
      const prompt = promptMap[cap] || "اشرحلي " + baseGoal;
      setExplainLoading(cap);
      setExplainContent(null);
      setExplainTitle(label === "ذاكر الدرس" ? "اشرحلي الدرس" : label);
      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task: cap === "quiz" ? "chat" : "explain",
            messages: [{ role: "user", content: prompt }],
            user: { role: "student", language: "ar", educationLevel: gradeName ? "primary " + gradeName : "primary" },
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error?.message || "تعذر الشرح");
        const content = json.data?.content || "";
        setExplainContent(content.slice(0, 4000));
      } catch (err) {
        setExplainContent("حصل خلل بسيط في الشرح. جرّب تاني 🌟");
        console.error("explain fetch", err);
      } finally {
        setExplainLoading(null);
      }
      return;
    }
    if (cap === "study_plan") {
      setExplainTitle("خطتك اليوم");
      setExplainContent("يلا نرتب يومك:\n• اختار مادة واحدة\n• ذاكر 20 دقيقة\n• حل سؤالين\n• خد راحة قصيرة 🌟");
    }
  }

  return (
    <section aria-label="ماذا تريد أن تفعل اليوم" className="sheet-card overflow-hidden">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-[1.05rem] font-bold text-ink">عايز تعمل إيه النهارده؟ ✨</h2>
            <p className="mt-1 text-sm leading-6 text-ink-soft">اكتب هدف صغير ونبدأه مع بعض خطوة بخطوة.</p>
          </div>
          <span aria-hidden className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--hl-yellow)]/40 text-lg">🎯</span>
        </div>

        <div className="mt-4 flex gap-2">
          <label htmlFor="primary-goal-input" className="sr-only">هدف اليوم</label>
          <input
            id="primary-goal-input"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !loading) void submit(goal); }}
            placeholder="مثلاً: عايز أذاكر الرياضيات"
            className="flex-1 rounded-xl border border-rule bg-paper-2 px-4 py-3 text-sm text-ink placeholder:text-ink-soft/60 focus:border-ink/20 focus:outline-none focus:ring-2 focus:ring-[var(--hl-yellow)]/30"
            disabled={loading}
            dir="rtl"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => void submit(goal)}
            disabled={loading}
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-ink px-5 py-3 text-sm font-bold text-paper-2 hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 disabled:opacity-50 disabled:pointer-events-none transition"
          >
            {loading ? "ثواني…" : "يلا"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => { setGoal(ex); void submit(ex); }}
              disabled={loading}
              className="rounded-full border border-rule bg-paper px-3.5 py-1.5 text-xs font-medium text-ink-soft hover:text-ink hover:border-ink/15 hover:bg-paper-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/10"
            >
              {ex}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 border border-amber-200">{error}</p>
        )}

        {result && (
          <div className="mt-4 rounded-xl border border-[var(--hl-yellow-ink)]/15 bg-[var(--hl-yellow)]/15 p-4" aria-live="polite">
            <p className="text-sm font-bold text-ink">{result.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {result.recommendedActions.map((a) => (
                <button
                  key={a.capability}
                  type="button"
                  onClick={() => void handleAction(a.capability, a.label)}
                  disabled={!!explainLoading}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs font-bold text-paper-2 hover:bg-ink/90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 disabled:opacity-50"
                >
                  <span>{a.label === "ذاكر الدرس" ? "اشرحلي الدرس" : a.label}</span>
                  {explainLoading === a.capability ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-paper-2 border-t-transparent" aria-hidden /> : <span aria-hidden className="text-[10px] opacity-70">↗</span>}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-4 text-ink-soft">{result.recommendedActions.map(a => a.reason).join(" · ")}</p>
          </div>
        )}

        {explainContent && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4" aria-live="polite">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-sm text-emerald-900">{explainTitle || "الشرح"}</h3>
              <button type="button" onClick={() => setExplainContent(null)} className="text-xs text-emerald-700 hover:text-emerald-900 underline">إخفاء</button>
            </div>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-emerald-900">{explainContent}</div>
          </div>
        )}
      </div>
    </section>
  );
}
