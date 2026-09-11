"use client";
/**
 * DiagramGenerator — أداة توليد المخططات والخرائط الذهنية
 *
 * الطالب بيختار الموضوع + نوع المخطط + مستوى التفصيل،
 * والأداة بتضرب /api/ai/diagram وبتعرض النتيجة في DiagramCanvas
 * مع أزرار نسخ الكود والتحميل كـ SVG.
 */
import React, { useState } from "react";
import { Copy, Check, LoaderCircle, Network, AlertTriangle } from "lucide-react";
import { DiagramCanvas } from "./DiagramCanvas";

const DIAGRAM_TYPES = [
  { value: "mindmap", label: "🧠 خريطة ذهنية" },
  { value: "flowchart", label: "🔀 مخطط انسيابي" },
  { value: "timeline", label: "📅 جدول زمني" },
  { value: "pie", label: "🥧 رسم دائري" },
  { value: "gantt", label: "🗓️ مخطط جانت (خطة مذاكرة)" },
  { value: "graph", label: "📈 رسم بياني" },
  { value: "sequence", label: "🔁 مخطط تسلسلي" },
  { value: "classDiagram", label: "🧩 مخطط تصنيفي" },
];

const DETAILS = [
  { value: "simple", label: "بسيط (5-8 عناصر)" },
  { value: "medium", label: "متوسط (8-15 عنصر)" },
  { value: "detailed", label: "مفصّل (15-25 عنصر)" },
];

interface DiagramGeneratorProps {
  defaultSubject?: string;
}

export function DiagramGenerator({ defaultSubject }: DiagramGeneratorProps) {
  const [topic, setTopic] = useState("");
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [type, setType] = useState("mindmap");
  const [detail, setDetail] = useState("medium");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ mermaidCode: string; title: string; type: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (topic.trim().length < 3 || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/ai/diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          type,
          detail,
          subject: subject.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data?.error?.message ??
            (res.status === 402
              ? "وصلت لحد المخططات اليومي — بيُجدَّد كل يوم."
              : "تعذّر توليد المخطط. حاول مرة تانية.")
        );
        return;
      }

      setResult({ mermaidCode: data.mermaidCode, title: data.title, type: data.type });
    } catch {
      setError("حصل خطأ في الاتصال. تأكد من الإنترنت وجرّب تاني.");
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.mermaidCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4" dir="rtl">
      <div>
        <label className="block text-xs font-bold text-slate-300 mb-2">
          📊 موضوع المخطط
        </label>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          maxLength={300}
          placeholder="مثال: الجهاز الهضمي في الإنسان / خطوات حل المعادلة التربيعية..."
          className="w-full rounded-xl bg-slate-950/70 border border-slate-700 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">نوع المخطط</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-xl bg-slate-950/70 border border-slate-700 px-2 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
          >
            {DIAGRAM_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">مستوى التفصيل</label>
          <select
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            className="w-full rounded-xl bg-slate-950/70 border border-slate-700 px-2 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
          >
            {DETAILS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 md:col-span-1">
          <label className="block text-xs text-slate-400 mb-1">المادة (اختياري)</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="أحياء، رياضيات..."
            disabled={!!defaultSubject}
            className="w-full rounded-xl bg-slate-950/70 border border-slate-700 px-2 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/60 disabled:opacity-60"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-950/30 px-3 py-2.5 text-xs text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <button
        onClick={generate}
        disabled={loading || topic.trim().length < 3}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-purple-600 to-fuchsia-600 px-4 py-3 text-sm font-bold text-white transition-opacity disabled:opacity-50 hover:opacity-90"
        type="button"
      >
        {loading ? (
          <>
            <LoaderCircle className="h-4 w-4 animate-spin" />
            جاري توليد المخطط...
          </>
        ) : (
          <>
            <Network className="h-4 w-4" />
            ارسم المخطط
          </>
        )}
      </button>

      {result && (
        <div className="space-y-2">
          <DiagramCanvas code={result.mermaidCode} type={result.type} title={result.title} />
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={copyCode}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
              type="button"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "تم النسخ" : "نسخ الكود"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** تحميل مخطط كصورة SVG من الكود الخام. */
export function downloadMermaidAsSvg(code: string, name = "diagram") {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.opacity = "0";
  document.body.appendChild(container);

  import("mermaid")
    .then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: "dark" });
      const { svg } = await mermaid.render(`export-${Date.now()}`, code);
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}_${Date.now()}.svg`;
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch(() => undefined)
    .finally(() => container.remove());
}
