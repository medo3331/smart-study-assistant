"use client";

import React, { useState } from "react";
import { PageShell } from "../dashboard/components/PageShell";
import { useAuthUser } from "../dashboard/components/use-page-data";
import { ImageGenerator } from "@/components/ai/ImageGenerator";
import { DiagramGenerator } from "@/components/ai/DiagramGenerator";

/* ============================================================
   CreateStudioPage â€” ظˆط§ط¬ظ‡ط© AI Studio ظ…ظ†ط³ظ‚ط© ظƒظ…ظ„ط²ظ…ط©
   طھط¬ظ…ط¹ 4 ط®ط¯ظ…ط§طھ ظپظٹ طھط¨ظˆظٹط¨ط§طھ ظˆط§ط­ط¯ط©: ط§ظ„ط®ط·ط· â€¢ ط§ظ„طµظˆط± â€¢ ط§ظ„ظ…ط®ط·ط·ط§طھ â€¢ ط§ظ„ظ…ظ„ظپط§طھ
   ============================================================ */

type Tab = "plans" | "image" | "diagram" | "file";

const PLAN_TYPES = [
  ["marketing_plan", "ط®ط·ط© طھط³ظˆظٹظ‚ظٹط©"],
  ["business_plan", "ط®ط·ط© ط¹ظ…ظ„"],
  ["planning", "ط®ط·ط© ظ…ط´ط±ظˆط¹"],
  ["roadmap", "Roadmap"],
] as const;

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "plans", label: "ط§ظ„ط®ط·ط·", icon: <PlayCircle className="h-4 w-4" /> },
  { id: "image", label: "طµظˆط±ط©", icon: <ImageIcon className="h-4 w-4" /> },
  { id: "diagram", label: "ظ…ط®ط·ط·", icon: <Network className="h-4 w-4" /> },
  { id: "file", label: "ظ…ظ„ظپ", icon: <FolderDown className="h-4 w-4" /> },
];

const CONTENT_TYPES = [
  { value: "summary", label: "ظ…ظ„ط®طµ ط¯ط±ط³" },
  { value: "quiz", label: "ظƒظˆظٹط² ظˆط£ط³ط¦ظ„ط©" },
  { value: "study_plan", label: "ط®ط·ط© ظ…ط°ط§ظƒط±ط©" },
  { value: "flashcards", label: "ط¨ط·ط§ظ‚ط§طھ ظ…ط±ط§ط¬ط¹ط©" },
  { value: "report", label: "طھظ‚ط±ظٹط± / ط¨ط­ط«" },
] as const;

const FILE_FORMATS = [
  { value: "pdf", label: "PDF" },
  { value: "docx", label: "Word" },
  { value: "xlsx", label: "Excel" },
  { value: "pptx", label: "PowerPoint" },
] as const;

export default function CreateStudioPage() {
  const { session } = useAuthUser();

  /* ---- ط­ط§ظ„ط© ط§ظ„طھط¨ظˆظٹط¨ط§طھ ---- */
  const [tab, setTab] = useState<Tab>("plans");

  /* ---- ط­ط§ظ„ط© ط§ظ„ط®ط·ط© (ط§ظ„ط®ط·ط·) ---- */
  const [goal, setGoal] = useState("");
  const [subject, setSubject] = useState("");
  const [planType, setPlanType] = useState<(typeof PLAN_TYPES)[number][0]>("planning");
  const [planResult, setPlanResult] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  /* ---- ط­ط§ظ„ط© ط§ظ„ظ…ظ„ظپط§طھ ---- */
  const [fileTopic, setFileTopic] = useState("");
  const [fileContent, setFileContent] = useState<(typeof CONTENT_TYPES)[number]["value"]>("summary");
  const [fileFormat, setFileFormat] = useState<(typeof FILE_FORMATS)[number]["value"]>("pdf");
  const [fileResult, setFileResult] = useState<{ filename: string; size: number } | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  /* ========================================================
     1) طھظˆظ„ظٹط¯ ط§ظ„ط®ط·ط© (API: /api/ai/plan)
     ======================================================== */
  const handleGeneratePlan = async () => {
    if (goal.trim().length < 4 || planLoading) return;
    setPlanLoading(true);
    setNotice(null);
    setPlanResult(null);
    try {
      const res = await fetch("/api/ai/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: planType, goal, context: subject }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message || "طھط¹ط°ظ‘ط± ط¥ظ†ط´ط§ط، ط§ظ„ط®ط·ط©.");
      setPlanResult(data?.result || "");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "طھط¹ط°ظ‘ط± ط¥ظ†ط´ط§ط، ط§ظ„ط®ط·ط©.");
    } finally {
      setPlanLoading(false);
    }
  };

  /* ========================================================
     2) طھظˆظ„ظٹط¯ ط§ظ„ظ…ظ„ظپ (API: /api/ai/file/generate)
     ======================================================== */
  const handleGenerateFile = async () => {
    if (fileTopic.trim().length < 3 || fileLoading) return;
    setFileLoading(true);
    setFileError(null);
    setFileResult(null);
    try {
      const res = await fetch("/api/ai/file/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: fileTopic.trim(),
          content: fileContent,
          type: fileFormat,
          subject: subject.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        throw new Error(data?.error?.message || "طھط¹ط°ظ‘ط± ط¥ظ†ط´ط§ط، ط§ظ„ظ…ظ„ظپ.");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const star = /filename\*=UTF-8''([^;]+)/.exec(disposition);
      const filename = star?.[1]
        ? decodeURIComponent(star[1])
        : `${fileTopic.trim().replace(/\s+/g, "_")}.${fileFormat}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setFileResult({ filename, size: blob.size });
      setFileTopic("");
      {/* ============ طھط¨ظˆظٹط¨ط§طھ ط§ظ„طھط¨ط¯ظٹظ„ ============ */}
      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${active ? "bg-gradient-to-l from-purple-600 to-fuchsia-600 text-white shadow-[0_4px_14px_var(--shade)]" : "bg-slate-800/70 text-slate-300 hover:bg-slate-800"}`} type="button">
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "plans" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">ظ†ظˆط¹ ط§ظ„ط®ط·ط©</label>
              <select value={planType} onChange={(e) => setPlanType(e.target.value as (typeof PLAN_TYPES)[number][0])} className="w-full rounded-xl bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/60">
                {PLAN_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">ط§ظ„ظ…ط§ط¯ط© (ط§ط®طھظٹط§ط±ظٹ)</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="ظ…ط«ظ„ط§ظ‹: ط£ط­ظٹط§ط،طŒ ظپظٹط²ظٹط§ط،طŒ ط±ظٹط§ط¶ظٹط§طھ..." className="w-full rounded-xl bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/60" />
            </div>
          </div>

          <div className="flex gap-2">
            <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="ط§ظƒطھط¨ ظ‡ط¯ظپ ط§ظ„ط®ط·ط© (ظ£ ط£ط­ط±ظپ ط¹ظ„ظ‰ ط§ظ„ط£ظ‚ظ„)" className="flex-1 rounded-xl bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/60" />
            <button onClick={handleGeneratePlan} disabled={planLoading} className="rounded-xl bg-gradient-to-l from-purple-600 to-fuchsia-600 px-4 py-2 text-sm font-bold text-white transition-opacity disabled:opacity-50 hover:opacity-90" type="button">{planLoading ? "ط¬ط§ط±ظٹ ط§ظ„ط¥ظ†ط´ط§ط،..." : "ط¥ظ†ط´ط§ط، ط§ظ„ط®ط·ط©"}</button>
          </div>

          {notice && <p className="text-xs text-red-400">{notice}</p>}

          {planResult && (
            <div className="rounded-xl border border-slate-700 p-3 space-y-2">
              <p className="text-xs text-slate-400">ظ…ط®ط·ط·ظƒ ط§ظ„ظ†ط§ط¬ط­:</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{planResult}</p>
            </div>
          )}
        </div>
      )}

      {tab === "image" && <ImageGenerator />}

      {tab === "diagram" && <DiagramGenerator />}

      {tab === "file" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input value={fileTopic} onChange={(e) => setFileTopic(e.target.value)} placeholder="ط¹ظ†ظˆط§ظ† ط§ظ„ظ…ظ„ظپ (ظ£ ط£ط­ط±ظپ ط¹ظ„ظ‰ ط§ظ„ط£ظ‚ظ„)" className="rounded-xl bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/60" />
            <select value={fileContent} onChange={(e) => setFileContent(e.target.value as any)} className="rounded-xl bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/60">
              {CONTENT_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select value={fileFormat} onChange={(e) => setFileFormat(e.target.value as any)} className="rounded-xl bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/60">
              {FILE_FORMATS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>

          <div className="flex gap-2">
            <button onClick={handleGenerateFile} disabled={fileLoading} className="rounded-xl bg-gradient-to-l from-purple-600 to-fuchsia-600 px-4 py-2 text-sm font-bold text-white transition-opacity disabled:opacity-50 hover:opacity-90" type="button">{fileLoading ? "ط¬ط§ط±ظٹ ط§ظ„طھظˆظ„ظٹط¯..." : "طھظˆظ„ظٹط¯ ظˆط­ظ…ظ„ ط§ظ„ظ…ظ„ظپ"}</button>
          </div>

          {fileError && <p className="text-xs text-red-400">{fileError}</p>}

          {fileResult && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">âœ“ {fileResult.filename} â€” ط§ظ„ط­ط¬ظ…: {fileResult.size} ط¨ط§ظٹطھ</div>
          )}
        </div>
      )}
    </PageShell>
  );
}


