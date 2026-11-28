"use client";

// components/unified-ai/AgentArtifacts.tsx
//
// 🛠️ كروت أدوات Magic Agent — عرض نتائج التنفيذ داخل الشات:
//   web_results → مصادر البحث بالروابط
//   diagram     → مخطط Mermaid مرسوم
//   image       → صورة مولّدة
//   file        → زر تحميل (MD/PDF/DOCX/PPTX) + «افتح في النوته»
//   quiz        → اختبار تفاعلي ملون بشريط تقدم وشاشة نتيجة + «افتح في النوته»

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MermaidViewer } from "@/components/ui/MermaidViewer";
import { importArtifactToNotes } from "@/lib/notes/agent-import";
import type { AgentArtifact, FileArtifact, QuizArtifact, TaskListArtifact, TaskSavedArtifact } from "@/lib/agent/actions";

const FORMAT_LABELS: Record<string, string> = {
  md: "Markdown",
  pdf: "PDF",
  docx: "Word",
  pptx: "PowerPoint",
};

function Card({ title, accent, children }: { title: string; accent?: string; children: React.ReactNode }) {
  return (
    <div className="my-2 rounded-xl border border-rule bg-paper overflow-hidden shadow-sm">
      <div
        className="px-3 py-2 text-xs font-bold text-white border-b border-rule"
        style={{ background: accent || "linear-gradient(90deg, #7C3AED, #4F46E5)" }}
      >
        🛠️ {title}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 📓 زر «افتح في النوته» — يحفظ المحتوى كنوتة ويفتحها                          */
/* -------------------------------------------------------------------------- */

function OpenInNotesButton({ title, blocks }: { title: string; blocks: { heading: string; body: string }[] }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  async function open() {
    if (blocks.length === 0) return;
    setState("saving");
    try {
      const notebookId = await importArtifactToNotes(title, blocks);
      router.push(`/notes/${notebookId}`);
    } catch {
      setState("error");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={state === "saving" || blocks.length === 0}
      className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border border-rule bg-paper text-ink-soft hover:bg-paper-3 transition disabled:opacity-50"
    >
      {state === "saving" ? "⏳ بيتحفظ..." : state === "error" ? "⚠️ فشل — جرب تاني" : "📓 افتح في النوته"}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* 📄 الملفات                                                                  */
/* -------------------------------------------------------------------------- */

function DownloadButton({ artifact }: { artifact: FileArtifact }) {
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
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={href}
        download={artifact.filename || `${artifact.title}.${artifact.format}`}
        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full text-white hover:opacity-90 transition"
        style={{ background: "linear-gradient(90deg, #7C3AED, #4F46E5)" }}
      >
        ⬇️ تحميل {FORMAT_LABELS[artifact.format] || artifact.format}
        {typeof artifact.size === "number" && artifact.size > 0 && (
          <span className="opacity-80">({Math.round(artifact.size / 1024)} KB)</span>
        )}
      </a>
      {artifact.sections && artifact.sections.length > 0 && (
        <OpenInNotesButton title={artifact.title} blocks={artifact.sections} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 📝 الاختبار التفاعلي — منظم وملون                                           */
/* -------------------------------------------------------------------------- */

const OPTION_LETTERS = ["أ", "ب", "ج", "د", "هـ", "و"];

function QuizCard({ artifact }: { artifact: QuizArtifact }) {
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [finished, setFinished] = useState(false);

  const total = artifact.questions.length;
  const answered = Object.keys(revealed).length;
  const correctCount = artifact.questions.reduce(
    (acc, q, i) => acc + (revealed[i] && picked[i] === q.answerIndex ? 1 : 0),
    0,
  );
  const progress = Math.round((answered / total) * 100);

  const grade = useMemo(() => {
    const pct = total > 0 ? (correctCount / total) * 100 : 0;
    if (pct === 100) return { emoji: "🏆", text: "علامة كاملة — انت جبار!", color: "#059669" };
    if (pct >= 80) return { emoji: "🌟", text: "ممتاز جدًا! كمل كده.", color: "#059669" };
    if (pct >= 60) return { emoji: "👍", text: "كويس — راجع اللي فاتك وهتتوحّد.", color: "#D97706" };
    if (pct >= 40) return { emoji: "💪", text: "محتاج مراجعة — متقلقش، مع بعض هنوصل.", color: "#D97706" };
    return { emoji: "📚", text: "يبقى نرجع للمحتوى تاني — عايزين شوية تركيز.", color: "#DC2626" };
  }, [correctCount, total]);

  function restart() {
    setPicked({});
    setRevealed({});
    setFinished(false);
  }

  const notesBlocks = useMemo(
    () => [
      {
        heading: "الأسئلة والإجابات",
        body: artifact.questions
          .map(
            (q, i) =>
              `${i + 1}) ${q.question}\n` +
              q.options.map((o, oi) => `${OPTION_LETTERS[oi] || oi + 1}. ${o}`).join("\n") +
              `\n✔ الإجابة: ${q.options[q.answerIndex]}${q.explanation ? `\n💡 ${q.explanation}` : ""}`,
          )
          .join("\n\n"),
      },
    ],
    [artifact.questions],
  );

  if (finished) {
    return (
      <div className="text-center py-4 space-y-2">
        <p className="text-4xl">{grade.emoji}</p>
        <p className="text-2xl font-black" style={{ color: grade.color }}>
          {correctCount}/{total}
        </p>
        <p className="text-sm text-ink-soft">{grade.text}</p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={restart}
            className="text-xs font-bold px-3 py-1.5 rounded-full text-white hover:opacity-90 transition"
            style={{ background: "linear-gradient(90deg, #7C3AED, #4F46E5)" }}
          >
            🔄 حاول تاني
          </button>
          <OpenInNotesButton title={artifact.title} blocks={notesBlocks} />
        </div>
      </div>
    );
  }

  const currentIdx = artifact.questions.findIndex((_, i) => !revealed[i]);

  return (
    <div className="space-y-3">
      {/* شريط التقدم */}
      <div>
        <div className="flex items-center justify-between text-[11px] font-bold text-ink-soft mb-1">
          <span>
            سؤال {Math.min(answered + 1, total)} من {total}
          </span>
          <span>
            ✅ {correctCount} صح
          </span>
        </div>
        <div className="h-2 rounded-full bg-paper-3 overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%`, background: "linear-gradient(90deg, #7C3AED, #4F46E5)" }}
          />
        </div>
      </div>

      {artifact.questions.map((q, qi) => {
        const isRevealed = Boolean(revealed[qi]);
        if (!isRevealed && qi !== currentIdx) return null; // سؤال واحد قدامك في كل مرة
        const choice = picked[qi];
        return (
          <div
            key={qi}
            className="rounded-xl border-2 p-3 bg-paper transition"
            style={{ borderColor: isRevealed ? (choice === q.answerIndex ? "#059669" : "#DC2626") : "#E2E8F0" }}
          >
            <p className="text-sm font-bold mb-2">
              <span
                className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-[11px] font-black me-1.5"
                style={{ background: "linear-gradient(135deg, #7C3AED, #4F46E5)" }}
              >
                {qi + 1}
              </span>
              {q.question}
            </p>
            <div className="grid gap-1.5">
              {q.options.map((opt, oi) => {
                const isPicked = choice === oi;
                const isCorrect = q.answerIndex === oi;
                let cls = "border-rule hover:bg-paper-3";
                if (isRevealed && isCorrect) cls = "border-emerald-600 bg-emerald-500/10";
                else if (isRevealed && isPicked && !isCorrect) cls = "border-rose-600 bg-rose-500/10";
                else if (isPicked) cls = "border-indigo-600 bg-indigo-500/10";
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={isRevealed}
                    onClick={() => setPicked((p) => ({ ...p, [qi]: oi }))}
                    className={`text-right text-xs px-3 py-2 rounded-lg border-2 transition disabled:cursor-default font-medium ${cls}`}
                  >
                    <span className="font-black">{OPTION_LETTERS[oi] || oi + 1}.</span> {opt}
                    {isRevealed && isCorrect && " ✓"}
                    {isRevealed && isPicked && !isCorrect && " ✗"}
                  </button>
                );
              })}
            </div>
            {isRevealed ? (
              <div className="mt-2 space-y-1">
                <p className={`text-xs font-bold ${choice === q.answerIndex ? "text-emerald-700" : "text-rose-700"}`}>
                  {choice === q.answerIndex ? "✅ صح! برافو" : `❌ الصح: ${q.options[q.answerIndex]}`}
                </p>
                {q.explanation && <p className="text-[11px] text-ink-soft">💡 {q.explanation}</p>}
                {qi === total - 1 && (
                  <button
                    type="button"
                    onClick={() => setFinished(true)}
                    className="mt-1 text-xs font-bold px-4 py-1.5 rounded-full text-white hover:opacity-90 transition"
                    style={{ background: "linear-gradient(90deg, #7C3AED, #4F46E5)" }}
                  >
                    شوف نتيجتك 🎯
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                disabled={typeof choice !== "number"}
                onClick={() => setRevealed((r) => ({ ...r, [qi]: true }))}
                className="mt-2 text-[11px] font-bold px-3 py-1 rounded-full text-white disabled:opacity-40 hover:opacity-90 transition"
                style={{ background: "linear-gradient(90deg, #7C3AED, #4F46E5)" }}
              >
                صحّح الإجابة
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 📋 المهام الشخصية — task_saved / task_list                                  */
/* -------------------------------------------------------------------------- */

function formatDueDate(iso: string): string {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (iso === todayIso) return "النهارده";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });
}

function TaskSavedCard({ artifact }: { artifact: TaskSavedArtifact }) {
  if (artifact.error) {
    return <p className="text-xs text-rose-600">⚠️ {artifact.error}</p>;
  }
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-bold text-emerald-700">✅ اتسجّلت المهمة في مخططك</p>
      <p className="text-xs text-ink leading-relaxed">📌 {artifact.title}</p>
      <p className="text-[11px] text-ink-soft">
        {artifact.dueDate ? `🗓️ الميعاد: ${formatDueDate(artifact.dueDate)}` : "🗓️ من غير ميعاد — في أي وقت"}
        {artifact.priority === 2 ? " · ⭐ مهمة" : ""}
      </p>
      <p className="text-[11px] text-ink-soft">
        لما تخلّصها من صفحة{" "}
        <Link href="/dashboard/planner" className="font-bold text-[var(--accent)] hover:underline">
          المخطط
        </Link>{" "}
        بتكسب كوينز 🪙
      </p>
    </div>
  );
}

function TaskListCard({ artifact }: { artifact: TaskListArtifact }) {
  if (artifact.tasks.length === 0) {
    return <p className="text-xs text-ink-soft">مفيش مهام مفتوحة — تحب نقترح مهمة لليوم؟</p>;
  }
  return (
    <ul className="space-y-1.5">
      {artifact.tasks.map((t) => (
        <li key={t.id} className="flex items-start gap-2 text-xs text-ink leading-relaxed">
          <span aria-hidden>{t.priority === 2 ? "⭐" : "📌"}</span>
          <span className="min-w-0 flex-1">
            {t.title}
            {t.dueDate && <span className="text-ink-soft"> — {formatDueDate(t.dueDate)}</span>}
          </span>
        </li>
      ))}
      <li className="pt-1">
        <Link href="/dashboard/planner" className="text-[11px] font-bold text-[var(--accent)] hover:underline">
          افتح المخطط ←
        </Link>
      </li>
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* العرض الرئيسي                                                               */
/* -------------------------------------------------------------------------- */

export function AgentArtifacts({ artifacts }: { artifacts: AgentArtifact[] }) {
  if (!artifacts || artifacts.length === 0) return null;
  return (
    <div className="mt-2 space-y-2">
      {artifacts.map((a, i) => {
        if (a.kind === "web_results") {
          return (
            <Card key={i} title={a.title} accent="linear-gradient(90deg, #0EA5E9, #6366F1)">
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
            <Card key={i} title={a.title} accent="linear-gradient(90deg, #059669, #0EA5E9)">
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
            <Card key={i} title={a.title} accent="linear-gradient(90deg, #D97706, #DC2626)">
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
        if (a.kind === "task_saved") {
          return (
            <Card key={i} title="مهمة شخصية جديدة" accent="linear-gradient(90deg, #059669, #7C3AED)">
              <TaskSavedCard artifact={a} />
            </Card>
          );
        }
        if (a.kind === "task_list") {
          return (
            <Card key={i} title="مهامك المفتوحة" accent="linear-gradient(90deg, #D97706, #7C3AED)">
              <TaskListCard artifact={a} />
            </Card>
          );
        }
        return (
          <Card key={i} title={a.subject ? `${a.title} — ${a.subject}` : a.title} accent="linear-gradient(90deg, #7C3AED, #DB2777)">
            <QuizCard artifact={a} />
          </Card>
        );
      })}
    </div>
  );
}
