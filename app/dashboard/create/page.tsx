"use client";

import React, { useRef, useState } from "react";
import { DataNotice, PageShell } from "../components/PageShell";
import { useAuthUser } from "../components/use-page-data";

const TYPES = [
  ["marketing_plan", "خطة تسويقية"],
  ["business_plan", "خطة عمل"],
  ["planning", "خطة مشروع"],
  ["roadmap", "Roadmap"],
] as const;

type Mode = "plan" | "image" | "imageAnalysis";

const MODES: Array<[Mode, string]> = [
  ["plan", "خطة"],
  ["image", "صورة"],
  ["imageAnalysis", "تحليل صورة"],
];

export default function CreatePlanPage() {
  const { session } = useAuthUser();
  const [mode, setMode] = useState<Mode>("plan");
  const [type, setType] = useState<(typeof TYPES)[number][0]>("planning");
  const [goal, setGoal] = useState("");
  const [context, setContext] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // صورة (توليد)
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  // تحليل صورة
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [analysisQuestion, setAnalysisQuestion] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // صياغة من الخطة عبر Groq
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState("");

  const generatePlan = async () => {
    if (goal.trim().length < 4 || loading) return;
    setLoading(true); setNotice(null); setDraft("");
    try {
      const res = await fetch("/api/ai/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, goal, context }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message || "تعذّر إنشاء الخطة.");
      setResult(data?.result || "");
    } catch (error) { setNotice(error instanceof Error ? error.message : "تعذّر إنشاء الخطة."); }
    finally { setLoading(false); }
  };

  const generateImage = async () => {
    if (imagePrompt.trim().length < 3 || loading) return;
    setLoading(true); setNotice(null); setImageUrl("");
    try {
      const res = await fetch("/api/ai/image-gen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: imagePrompt }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message || "تعذّر توليد الصورة.");
      setImageUrl(data?.image || "");
    } catch (error) { setNotice(error instanceof Error ? error.message : "تعذّر توليد الصورة."); }
    finally { setLoading(false); }
  };

  const analyzeImage = async (file: File) => {
    if (isAnalyzing) return;
    setIsAnalyzing(true); setNotice(null); setResult("");
    try {
      const form = new FormData();
      form.append("file", file);
      if (analysisQuestion.trim()) form.append("question", analysisQuestion);
      const res = await fetch("/api/ai/image-analysis", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message || "تعذّر تحليل الصورة.");
      setResult(data?.result || "");
    } catch (error) { setNotice(error instanceof Error ? error.message : "تعذّر تحليل الصورة."); }
    finally { setIsAnalyzing(false); }
  };

  /** الخطة اتعملت بـ Gemini — الصياغة النصية بتروح لـ Groq عبر Content Agent. */
  const draftFromPlan = async () => {
    if (result.trim().length < 10 || drafting) return;
    setDrafting(true); setNotice(null); setDraft("");
    try {
      const res = await fetch("/api/agents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: "content", goal: `اكتب محتوى تنفيذي مبنيًا على الخطة التالية (بوستات/رسايل/إعلانات حسب ما يناسب): ${goal}`, brief: result.slice(0, 4000) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message || "تعذّت الصياغة من الخطة.");
      setDraft(data?.result || "");
    } catch (error) { setNotice(error instanceof Error ? error.message : "تعذّت الصياغة من الخطة."); }
    finally { setDrafting(false); }
  };

  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setNotice("اتنسخ ✓"); setTimeout(() => setNotice(null), 2000); } catch { setNotice("المتصفح رفض النسخ — انسخه يدوي."); }
  };

  return <PageShell eyebrow="Create" title="أنشئ" lede="خطط بالـ Gemini، صور وتحليل صور، وتحويل الخطة لمحتوى جاهز بالـ Groq." feedbackPage="agents">
    {session.status !== "ready" ? <DataNotice message="لازم تسجّل دخول عشان تستخدم أدوات الإنشاء." /> : <>
      {notice && <DataNotice message={notice} />}
      <div className="flex flex-wrap gap-2">{MODES.map(([id, label]) => <button key={id} onClick={() => { setMode(id); setNotice(null); setResult(""); }} className={`btn text-sm ${mode === id ? "btn-marker" : "btn-quiet"}`}>{label}</button>)}</div>

      {mode === "plan" && <>
        <section className="sheet-card sheet-card-live p-5 space-y-4">
          <div className="flex flex-wrap gap-2">{TYPES.map(([id, label]) => <button key={id} onClick={() => setType(id)} className={`btn text-sm ${type === id ? "btn-marker" : "btn-quiet"}`}>{label}</button>)}</div>
          <label className="block"><span className="tag mb-1.5">الهدف</span><textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} maxLength={5000} placeholder="مثال: إطلاق متجر إلكتروني خلال 60 يومًا" className="w-full rounded-[var(--r-sm)] border border-rule bg-paper p-3 text-sm outline-none focus:border-rule-strong" /></label>
          <label className="block"><span className="tag mb-1.5">السياق المتاح (اختياري)</span><textarea value={context} onChange={(e) => setContext(e.target.value)} rows={4} maxLength={5000} placeholder="الميزانية، الفريق، الجمهور، القيود…" className="w-full rounded-[var(--r-sm)] border border-rule bg-paper p-3 text-sm outline-none focus:border-rule-strong" /></label>
          <button onClick={() => void generatePlan()} disabled={loading || goal.trim().length < 4} className="btn btn-marker text-sm disabled:opacity-40">{loading ? "بيجهّز الخطة…" : "أنشئ الخطة"}</button>
        </section>
        {result && <section className="sheet-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="eyebrow eyebrow-flush">الخطة (Gemini)</p>
            <div className="flex gap-2">
              <button onClick={() => void copyText(result)} className="btn btn-quiet text-xs">انسخ</button>
              <button onClick={() => void generatePlan()} disabled={loading} className="btn btn-quiet text-xs disabled:opacity-40">أعِد التوليد</button>
            </div>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-8">{result}</p>
          <div className="border-t border-rule pt-3">
            <button onClick={() => void draftFromPlan()} disabled={drafting} className="btn btn-marker text-xs disabled:opacity-40">{drafting ? "بيصيغ المحتوى بـ Groq…" : "حوّل الخطة لمحتوى (Content Agent)"}</button>
            {draft && <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="eyebrow eyebrow-flush">المحتوى (Groq)</p>
                <button onClick={() => void copyText(draft)} className="btn btn-quiet text-xs">انسخ</button>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-8">{draft}</p>
            </div>}
          </div>
        </section>}
      </>}

      {mode === "image" && <>
        <section className="sheet-card sheet-card-live p-5 space-y-4">
          <label className="block"><span className="tag mb-1.5">وصف الصورة</span><textarea value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} rows={3} maxLength={1000} placeholder="مثال: بوستر إعلاني بسيط لأكاديمية ذكاء اصطناعي، ألوان هادية، ستايل مسطح" className="w-full rounded-[var(--r-sm)] border border-rule bg-paper p-3 text-sm outline-none focus:border-rule-strong" /></label>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => void generateImage()} disabled={loading || imagePrompt.trim().length < 3} className="btn btn-marker text-sm disabled:opacity-40">{loading ? "بيولّد الصورة…" : "ولّد الصورة"}</button>
            {imageUrl && <a href={imageUrl} download="magiclly-image.png" className="btn btn-quiet text-sm">نزّل الصورة</a>}
          </div>
        </section>
        {imageUrl && <section className="sheet-card p-5">
          <p className="eyebrow eyebrow-flush mb-3">الصورة المتولدة (Gemini)</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={imagePrompt.slice(0, 100)} className="max-w-full rounded-[var(--r-sm)] border border-rule" />
        </section>}
      </>}

      {mode === "imageAnalysis" && <>
        <section className="sheet-card sheet-card-live p-5 space-y-4">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void analyzeImage(file); e.target.value = ""; }} />
          <label className="block"><span className="tag mb-1.5">سؤالك عن الصورة (اختياري)</span><textarea value={analysisQuestion} onChange={(e) => setAnalysisQuestion(e.target.value)} rows={2} maxLength={2000} placeholder="مثال: اشرحلي الرسمة دي وإيه أهم حاجة فيها" className="w-full rounded-[var(--r-sm)] border border-rule bg-paper p-3 text-sm outline-none focus:border-rule-strong" /></label>
          <button onClick={() => fileInputRef.current?.click()} disabled={isAnalyzing} className="btn btn-marker text-sm disabled:opacity-40">{isAnalyzing ? "بيحلل الصورة…" : "ارفع صورة للتحليل"}</button>
        </section>
        {result && <section className="sheet-card p-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow eyebrow-flush">التحليل (Gemini)</p>
            <button onClick={() => void copyText(result)} className="btn btn-quiet text-xs">انسخ</button>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-8">{result}</p>
        </section>}
      </>}
    </>}
  </PageShell>;
}
