"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell, DataNotice, LoadingSheets } from "../components/PageShell";
import { useAuthUser } from "../components/use-page-data";
import { AI_AGENTS, AI_AGENT_IDS, type AiAgentId } from "@/lib/ai/agents";

type HistoryItem = {
  id: string;
  agent: AiAgentId;
  task_type: string;
  provider: "groq" | "gemini";
  model: string;
  input: Record<string, unknown>;
  output: string;
  created_at: string;
};

const TONES = ["مباشر", "ودود", "احترافي", "جريء"];
const OUTPUTS = ["نقاط عملية", "جدول", "محتوى جاهز للنشر", "تقرير مختصر"];

function inputText(value: unknown) {
  return typeof value === "string" ? value : "";
}

export default function AgentsPage() {
  const { session } = useAuthUser();
  const searchParams = useSearchParams();
  const agentFromUrl = searchParams.get("agent");
  const [agent, setAgent] = useState<AiAgentId>("marketing");
  const [mode, setMode] = useState("copy");
  const [goal, setGoal] = useState("");
  const [brief, setBrief] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("احترافي");
  const [output, setOutput] = useState("نقاط عملية");
  const [result, setResult] = useState("");
  const [resultMeta, setResultMeta] = useState<{ provider: string; taskType: string } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyPersistent, setHistoryPersistent] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const definition = AI_AGENTS[agent];
  const researchDisclaimer = agent === "research";
  const historyTitle = useMemo(() => `نتائج ${definition.name}`, [definition.name]);

  const loadHistory = async (currentAgent = agent) => {
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/agents/history?agent=${currentAgent}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error?.message || "مقدرتناش نحمّل السجل.");
      setHistory(Array.isArray(data?.items) ? data.items : []);
      setHistoryPersistent(data?.persistent !== false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "مقدرتناش نحمّل السجل.");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (session.status !== "ready") return;
    void loadHistory(agent);
    // Agent switch intentionally reloads only its own history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, session.status]);

  useEffect(() => {
    if (agentFromUrl === "marketing" || agentFromUrl === "research" || agentFromUrl === "content") selectAgent(agentFromUrl);
    // Read the URL once; switching agent is otherwise a direct user action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentFromUrl]);

  const selectAgent = (nextAgent: AiAgentId) => {
    setAgent(nextAgent);
    setMode(AI_AGENTS[nextAgent].modes[0].id);
    setResult("");
    setResultMeta(null);
    setNotice(null);
  };

  const generate = async () => {
    if (generating) return;
    if (goal.trim().length < 4) {
      setNotice("اكتب هدفًا أو طلبًا واضحًا من 4 حروف على الأقل.");
      return;
    }
    setGenerating(true);
    setNotice(null);
    try {
      const response = await fetch("/api/agents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent, mode, goal, brief, audience, tone, output }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error?.message || "حصلت مشكلة أثناء التوليد.");
      if (typeof data?.result !== "string" || !data.result.trim()) throw new Error("النتيجة رجعت ناقصة. حاول تاني.");
      setResult(data.result);
      setResultMeta({ provider: data.provider, taskType: data.taskType });
      await loadHistory(agent);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "حصلت مشكلة أثناء التوليد.");
    } finally {
      setGenerating(false);
    }
  };

  const copyResult = async (text = result) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("اتنسخت النتيجة.");
    } catch {
      setNotice("ما قدرناش ننسخ تلقائيًا. انسخ النص يدويًا.");
    }
  };

  const restoreHistory = (item: HistoryItem) => {
    setGoal(inputText(item.input.goal));
    setBrief(inputText(item.input.brief));
    setAudience(inputText(item.input.audience));
    setTone(inputText(item.input.tone) || "احترافي");
    setOutput(inputText(item.input.output) || "نقاط عملية");
    setMode(inputText(item.input.mode) || AI_AGENTS[agent].modes[0].id);
    setResult(item.output);
    setResultMeta({ provider: item.provider, taskType: item.task_type });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (session.status === "loading") {
    return <PageShell eyebrow="AI Agents" title="وكلاء الذكاء" feedbackPage="agents"><LoadingSheets count={3} /></PageShell>;
  }

  if (session.status !== "ready") {
    return <PageShell eyebrow="AI Agents" title="وكلاء الذكاء" lede="سجّل دخولك لاستخدام الوكلاء وحفظ نتائجك." feedbackPage="agents"><DataNotice message="لازم تسجّل دخول عشان تستخدم الوكلاء." /></PageShell>;
  }

  return (
    <PageShell
      eyebrow="AI Agents"
      title="وكلاء الذكاء"
      lede="اختَر النتيجة التي تريدها، واكتب السياق، والنظام يختار الـProvider المناسب تلقائيًا."
      feedbackPage="agents"
      feedbackLabel="وكلاء الذكاء"
    >
      {notice && <DataNotice message={notice} />}

      <section aria-label="اختيار الوكيل" className="grid gap-3 md:grid-cols-3">
        {AI_AGENT_IDS.map((id) => {
          const item = AI_AGENTS[id];
          const selected = id === agent;
          return (
            <button
              key={id}
              type="button"
              onClick={() => selectAgent(id)}
              aria-pressed={selected}
              className={`sheet-card p-4 text-right transition ${selected ? "border-rule-strong bg-paper-3" : "hover:border-rule-strong"}`}
            >
              <span className="text-2xl" aria-hidden>{item.icon}</span>
              <p className="font-display font-extrabold text-sm mt-4">{item.name}</p>
              <p className="text-xs text-ink-soft leading-relaxed mt-1">{item.description}</p>
            </button>
          );
        })}
      </section>

      <section className="sheet-card sheet-card-live p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="eyebrow eyebrow-flush">{definition.name}</p>
            <h2 className="font-display font-extrabold text-lg mt-1">ابدأ بالمطلوب</h2>
          </div>
          <div className="flex flex-wrap gap-1.5" aria-label="نوع المهمة">
            {definition.modes.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setMode(option.id)}
                aria-pressed={mode === option.id}
                className={`text-xs rounded-full border px-3 py-1.5 transition ${mode === option.id ? "bg-paper-3 border-rule-strong text-ink" : "bg-paper-2 border-rule text-ink-soft hover:text-ink"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {researchDisclaimer && (
          <div className="notice text-xs leading-relaxed">
            Research Agent لا يملك Web Search حقيقيًا حاليًا؛ التحليل سيكون من معلوماتك والمعرفة العامة، مع توضيح أي افتراضات.
          </div>
        )}

        <label className="block">
          <span className="tag mb-1.5">إيه المطلوب؟</span>
          <textarea value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={5000} rows={3} placeholder="مثال: اعمل خطة إطلاق لمنتج عناية بالبشرة في مصر" className="w-full resize-y rounded-[var(--r-sm)] border border-rule bg-paper px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-rule-strong" />
        </label>
        <label className="block">
          <span className="tag mb-1.5">تفاصيل أو مصادر متاحة (اختياري)</span>
          <textarea value={brief} onChange={(event) => setBrief(event.target.value)} maxLength={4000} rows={4} placeholder="اكتب المعلومات أو المقارنة أو مواصفات المنتج التي تريد الاعتماد عليها…" className="w-full resize-y rounded-[var(--r-sm)] border border-rule bg-paper px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-rule-strong" />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label><span className="tag mb-1.5">الجمهور</span><input value={audience} onChange={(event) => setAudience(event.target.value)} maxLength={300} placeholder="مثال: أصحاب مشاريع صغيرة" className="w-full rounded-[var(--r-sm)] border border-rule bg-paper px-3 py-2 text-sm outline-none focus:border-rule-strong" /></label>
          <label><span className="tag mb-1.5">النبرة</span><select value={tone} onChange={(event) => setTone(event.target.value)} className="w-full rounded-[var(--r-sm)] border border-rule bg-paper px-3 py-2 text-sm outline-none">{TONES.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span className="tag mb-1.5">شكل النتيجة</span><select value={output} onChange={(event) => setOutput(event.target.value)} className="w-full rounded-[var(--r-sm)] border border-rule bg-paper px-3 py-2 text-sm outline-none">{OUTPUTS.map((value) => <option key={value}>{value}</option>)}</select></label>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap border-t border-rule pt-4">
          <p className="text-[11px] text-ink-soft">لا تختار Provider يدويًا — الـRouter يحدد المناسب للمهمة.</p>
          <button onClick={() => void generate()} disabled={generating || goal.trim().length < 4} className="btn btn-marker text-sm disabled:opacity-45">
            {generating ? "بيجهّز النتيجة…" : "ولّد النتيجة"}
          </button>
        </div>
      </section>

      {result && (
        <section className="sheet-card p-5 space-y-3" aria-live="polite">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div><p className="eyebrow eyebrow-flush">النتيجة</p>{resultMeta && <p className="tag mt-1">{resultMeta.provider === "gemini" ? "Gemini" : "Groq"} · {resultMeta.taskType}</p>}</div>
            <div className="flex gap-2"><button onClick={() => void copyResult()} className="btn btn-quiet text-sm">انسخ</button><button onClick={() => void generate()} disabled={generating} className="btn btn-quiet text-sm">إعادة التوليد</button></div>
          </div>
          <p className="whitespace-pre-wrap text-sm text-ink leading-8">{result}</p>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3"><div><p className="eyebrow eyebrow-flush">History</p><h2 className="font-display font-extrabold text-base mt-1">{historyTitle}</h2></div><button onClick={() => void loadHistory()} className="btn btn-quiet text-sm">تحديث</button></div>
        {!historyPersistent && <div className="notice text-xs">شغّل ملف قاعدة البيانات `db/ai-agents.sql` لتفعيل حفظ History بين الجلسات.</div>}
        {historyLoading ? <LoadingSheets count={2} /> : history.length === 0 ? <p className="sheet-card p-5 text-sm text-ink-soft">لسه مفيش نتائج محفوظة للوكيل ده.</p> : <div className="grid gap-3">{history.map((item) => <article key={item.id} className="sheet-card p-4 space-y-2"><div className="flex items-start justify-between gap-3"><p className="text-sm font-bold line-clamp-2">{inputText(item.input.goal) || "طلب بدون عنوان"}</p><span className="tag shrink-0">{item.provider === "gemini" ? "Gemini" : "Groq"}</span></div><p className="text-xs text-ink-soft line-clamp-3 whitespace-pre-wrap">{item.output}</p><div className="flex gap-2"><button onClick={() => restoreHistory(item)} className="btn btn-quiet text-xs">افتح</button><button onClick={() => void copyResult(item.output)} className="btn btn-quiet text-xs">انسخ</button></div></article>)}</div>}
      </section>
    </PageShell>
  );
}
