"use client";
/**
 * AiStudioTabs — استوديو ماجيكلي لإنتاج المحتوى التعليمي
 *
 * ثلاث أدوات:
 *   🖼️ الصور     → ImageGenerator  (DALL-E 3 / Flux / SDXL)
 *   📊 المخططات  → DiagramGenerator (Mermaid — مجاني)
 *   📁 الملفات   → توليد محتوى منظم + تصدير (PDF / Word / Excel / PPT)
 */
import React, { useState } from "react";
import {
  Image as ImageIcon,
  Network,
  FolderDown,
  LoaderCircle,
  AlertTriangle,
} from "lucide-react";
import { ImageGenerator } from "./ImageGenerator";
import { DiagramGenerator } from "./DiagramGenerator";

type Tab = "image" | "diagram" | "file";

const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "image", label: "الصور التعليمية", icon: ImageIcon },
  { id: "diagram", label: "المخططات والخرائط", icon: Network },
  { id: "file", label: "الملفات القابلة للتحميل", icon: FolderDown },
];

// ─── تبويب الملفات ───
const CONTENT_TYPES = [
  { value: "summary", label: "📝 ملخص درس" },
  { value: "quiz", label: "❓ كويز / أسئلة" },
  { value: "study_plan", label: "🗓️ خطة مذاكرة" },
  { value: "flashcards", label: "🃏 بطاقات مراجعة" },
  { value: "report", label: "📄 تقرير / بحث" },
];

const FILE_FORMATS = [
  { value: "pdf", label: "PDF" },
  { value: "docx", label: "Word" },
  { value: "xlsx", label: "Excel" },
  { value: "pptx", label: "PowerPoint" },
];

function FileStudio() {
  const [topic, setTopic] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("summary");
  const [format, setFormat] = useState("pdf");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const generateAndDownload = async () => {
    if (topic.trim().length < 3 || loading) return;
    setLoading(true);
    setError(null);
    setDone(null);

    try {
      const res = await fetch("/api/ai/file/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          subject: subject.trim() || undefined,
          content,
          type: format,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error?.message ?? "تعذّر إنشاء الملف. حاول مرة تانية."
        );
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const star = /filename\*=UTF-8''([^;]+)/.exec(disposition);
      const filename = star?.[1]
        ? decodeURIComponent(star[1])
        : `${topic.trim().replace(/\s+/g, "_")}.${format}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setDone(`تم إنشاء ${filename} وبدأ التحميل ✅`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر إنشاء الملف.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4" dir="rtl">
      <div>
        <label className="block text-xs font-bold text-slate-300 mb-2">
          📁 موضوع الملف
        </label>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          maxLength={300}
          placeholder="مثال: ملخص درس قوانين نيوتن / كويز على الكسور / خطة مذاكرة الأسبوع..."
          className="w-full rounded-xl bg-slate-950/70 border border-slate-700 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">نوع المحتوى</label>
          <select
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full rounded-xl bg-slate-950/70 border border-slate-700 px-2 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
          >
            {CONTENT_TYPES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">صيغة الملف</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="w-full rounded-xl bg-slate-950/70 border border-slate-700 px-2 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
          >
            {FILE_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">المادة (اختياري)</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="فيزياء، رياضيات..."
            className="w-full rounded-xl bg-slate-950/70 border border-slate-700 px-2 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-950/30 px-3 py-2.5 text-xs text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}
      {done && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3 py-2.5 text-xs text-emerald-300">
          {done}
        </div>
      )}

      <button
        onClick={generateAndDownload}
        disabled={loading || topic.trim().length < 3}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-purple-600 to-fuchsia-600 px-4 py-3 text-sm font-bold text-white transition-opacity disabled:opacity-50 hover:opacity-90"
        type="button"
      >
        {loading ? (
          <>
            <LoaderCircle className="h-4 w-4 animate-spin" />
            جاري التوليد والتصدير...
          </>
        ) : (
          <>
            <FolderDown className="h-4 w-4" />
            ولّد وحمّل الملف
          </>
        )}
      </button>

      <p className="text-[11px] text-slate-500 leading-relaxed">
        الـ AI بيولّد المحتوى (ملخص/كويز/خطة...) ويحوّله لملف منسق بالعربية.
        راجع المحتوى دائمًا قبل الاستخدام الرسمي.
      </p>
    </div>
  );
}

export function AiStudioTabs() {
  const [tab, setTab] = useState<Tab>("image");

  return (
    <div className="mx-auto max-w-3xl space-y-6" dir="rtl">
      {/* شريط التبويبات */}
      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 min-w-[150px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
                active
                  ? "bg-gradient-to-l from-purple-600 to-fuchsia-600 text-white"
                  : "text-slate-300 hover:bg-slate-800/70"
              }`}
              type="button"
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* المحتوى */}
      {tab === "image" && <ImageGenerator />}
      {tab === "diagram" && <DiagramGenerator />}
      {tab === "file" && <FileStudio />}
    </div>
  );
}
