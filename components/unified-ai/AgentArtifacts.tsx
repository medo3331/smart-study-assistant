"use client";

// components/unified-ai/AgentArtifacts.tsx
//
// 🛠️ كروت أدوات Magic Agent — عرض نتائج التنفيذ داخل الشات:
//   web_results → مصادر البحث بالروابط
//   diagram     → مخطط Mermaid مرسوم
//   image       → صورة مولّدة
//   file        → زر تحميل (MD/PDF/DOCX/PPTX)
//   quiz        → اختبار تفاعلي (اختيار من متعدد + تصحيح فوري)

import { useState } from "react";
import { MermaidViewer } from "@/components/ui/MermaidViewer";
import type { AgentArtifact, QuizArtifact } from "@/lib/agent/actions";

const FORMAT_LABELS: Record<string, string> = {
  md: "Markdown",
  pdf: "PDF",
  docx: "Word",
  pptx: "PowerPoint",
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="my-2 rounded-xl border border-rule bg-paper overflow-hidden">
      <div className="px-3 py-2 text-xs font-bold bg-paper-3 text-ink-soft border-b border-rule">🛠️ {title}</div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function DownloadButton({ artifact }: { artifact: Extract<AgentArtifact, { kind: "file" }> }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  function getHref(): string {
    if (artifact.dataUrl) return artifact.dataUrl;
    if (artifact.content) {
      if (blobUrl) return blobUrl;
      const blob = new Blob([artifact.content], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      return url;
    }
    return "";
  }

  if (artifact.error) {
    return <p className="text-xs text-rose-600">⚠️ {artifact.error}</p>;
  }
  const href = getHref();
  if (!href) return <p className="text-xs text-ink-soft">الملف فاضي.</p>;
  return (
    <a
      href={href}
      download={artifact.filename || `${artifact.title}.${artifact.format}`}
      className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-[var(--accent)] text-[var(--on-marker)] hover:opacity-90 transition"
    >
      ⬇️ تحميل {FORMAT_LABELS[artifact.format] || artifact.format}
      {typeof artifact.size === "number" && artifact.size > 0 && (
        <span className="opacity-80">({Math.round(artifact.size / 1024)} KB)</span>
      )}
    </a>
  );
}

function QuizCard({ artifact }: { artifact: QuizArtifact }) {
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const answeredCount = Object.keys(revealed).length;
  const correctCount = artifact.questions.reduce(
    (acc, q, i) => acc + (revealed[i] && picked[i] === q.answerIndex ? 1 : 0),
    0,
  );

  return (
    <div className="space-y-3">
      {artifact.questions.map((q, qi) => {
        const isRevealed = Boolean(revealed[qi]);
        const choice = picked[qi];
        return (
          <div key={qi} className="rounded-lg border border-rule p-3 bg-paper">
            <p className="text-sm font-bold mb-2">
              {qi + 1}. {q.question}
            </p>
            <div className="grid gap-1.5">
              {q.options.map((opt, oi) => {
                const isPicked = choice === oi;
                const isCorrect = q.answerIndex === oi;
                let cls = "border-rule hover:bg-paper-3";
                if (isRevealed && isCorrect) cls = "border-emerald-500 bg-emerald-500/10";
                else if (isRevealed && isPicked && !isCorrect) cls = "border-rose-500 bg-rose-500/10";
                else if (isPicked) cls = "border-[var(--accent)] bg-[var(--accent)]/10";
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={isRevealed}
                    onClick={() => setPicked((p) => ({ ...p, [qi]: oi }))}
                    className={`text-right text-xs px-3 py-1.5 rounded-lg border transition disabled:cursor-default ${cls}`}
                  >
                    {["أ", "ب", "ج", "د", "هـ", "و"][oi] || oi + 1}. {opt}
                    {isRevealed && isCorrect && " ✓"}
                  </button>
                );
              })}
            </div>
            {!isRevealed ? (
              <button
                type="button"
                disabled={typeof choice !== "number"}
                onClick={() => setRevealed((r) => ({ ...r, [qi]: true }))}
                className="mt-2 text-[11px] font-bold px-3 py-1 rounded-full bg-[var(--accent)] text-[var(--on-marker)] disabled:opacity-40"
              >
                صحّح الإجابة
              </button>
            ) : (
              picked[qi] !== q.answerIndex && q.explanation && (
                <p className="mt-2 text-[11px] text-ink-soft">💡 {q.explanation}</p>
              )
            )}
          </div>
        );
      })}
      {answeredCount > 0 && (
        <p className="text-xs font-bold text-ink-soft">
          النتيجة: {correctCount}/{artifact.questions.length}
          {correctCount === artifact.questions.length && " — ممتاز! 🎉"}
        </p>
      )}
    </div>
  );
}

export function AgentArtifacts({ artifacts }: { artifacts: AgentArtifact[] }) {
  if (!artifacts || artifacts.length === 0) return null;
  return (
    <div className="mt-2 space-y-2">
      {artifacts.map((a, i) => {
        if (a.kind === "web_results") {
          return (
            <Card key={i} title={a.title}>
              {a.answer && <p className="text-xs mb-2 leading-relaxed">{a.answer}</p>}
              {a.results.length === 0 && !a.answer && (
                <p className="text-xs text-ink-soft">خدمة البحث غير متاحة حاليًا.</p>
              )}
              <ul className="space-y-2">
                {a.results.map((r, ri) => (
                  <li key={ri} className="text-xs">
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-bold text-[var(--accent)] hover:underline">
                      {r.title || r.url}
                    </a>
                    {r.snippet && <p className="text-ink-soft mt-0.5 leading-relaxed">{r.snippet}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          );
        }
        if (a.kind === "diagram") {
          return (
            <Card key={i} title={a.title}>
              {a.error || !a.mermaidCode ? (
                <p className="text-xs text-rose-600">⚠️ {a.error || "تعذّر توليد المخطط."}</p>
              ) : (
                <MermaidViewer chart={a.mermaidCode} label={a.title} />
              )}
            </Card>
          );
        }
        if (a.kind === "image") {
          return (
            <Card key={i} title={a.title}>
              {a.error || !a.url ? (
                <p className="text-xs text-rose-600">⚠️ {a.error || "تعذّر توليد الصورة."}</p>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={a.url} alt={a.title} className="max-w-full rounded-lg" loading="lazy" />
              )}
            </Card>
          );
        }
        if (a.kind === "file") {
          return (
            <Card key={i} title={`${a.title} — ${FORMAT_LABELS[a.format] || a.format}`}>
              <DownloadButton artifact={a} />
            </Card>
          );
        }
        return (
          <Card key={i} title={a.subject ? `${a.title} — ${a.subject}` : a.title}>
            <QuizCard artifact={a} />
          </Card>
        );
      })}
    </div>
  );
}
