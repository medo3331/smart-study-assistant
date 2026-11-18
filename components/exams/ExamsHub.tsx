"use client";

/* ==========================================================================
   ExamsHub — تبويبات /exams + قائمة «امتحاناتي» + تحويلات الشاشات
   ============================================================================

   • تبويبان: «امتحاناتي» (الافتراضي — المولّد) و«بنك الامتحانات الرسمي»
     (المحتوى بيتمرّر من الصفحة كـchildren — يفضل server-rendered).
   • شاشات «امتحاناتي»: قائمة ← توليد ← تجهيز ← حل ← نتيجة (state machine
     بسيط — كل شاشة مكوّن مستقل بيحمّل بياناتها بنفسه).
   • القراءة كلها RLS مباشر (المالك يقرأ) — مفيش APIs جديدة للقراءة؛
     الكتابة (إنشاء/معالجة/إجابات) عبر راوتس الـAPI.
   ========================================================================== */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Plus, Sparkles } from "lucide-react";
import { ExamGenerator, type ExamGeneratorInitial } from "./ExamGenerator";
import { ExamRunner } from "./ExamRunner";
import { ExamPaper } from "./ExamPaper";
import { ExamResults } from "./ExamResults";

export type ExamsInitial = ExamGeneratorInitial & { tab: "my" | "bank"; gen: boolean };

type View =
  | { kind: "list" }
  | { kind: "generate" }
  | { kind: "runner"; sessionId: string }
  | { kind: "paper"; sessionId: string }
  | { kind: "results"; sessionId: string };

type SessionListItem = {
  id: string;
  status: string;
  metadata: { title?: string; subject_name?: string; spec?: { count?: number }; result?: ExamResultPayload } | null;
  created_at: string;
  completed_at: string | null;
};

export type ExamResultPayload = {
  auto: { correct: number; total: number };
  essay: { score: number; max: number };
  total: { score: number; max: number; percent: number };
};

const STATUS_LABELS: Record<string, string> = {
  created: "في انتظار التوليد",
  generating: "بيتولّد…",
  ready: "جاهز للحل",
  completed: "مكتمل",
  failed: "فشل",
  abandoned: "متروك",
};

function shortDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ar-EG", { day: "numeric", month: "long" });
}

/* ═══════════════════════ القائمة ═══════════════════════ */

function MyExamsList({
  onOpen,
  onCreate,
}: {
  onOpen: (view: View) => void;
  onCreate: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [answeredBySession, setAnsweredBySession] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        /**
         * ⚠️ القائمة بتيجي من `GET /api/exam-sessions` (سيرفر) مش من
         *    استعلامين في المتصفح: العدّ بقى على السيرفر، ومفيش سحب
         *    لكل صفوف `exam_session_answers` عشان نعدّها.
         */
        const response = await fetch("/api/exam-sessions?limit=20", { cache: "no-store" });
        const data = (await response.json().catch(() => null)) as
          | { sessions?: Array<SessionListItem & { answered?: number }> }
          | null;
        if (cancelled) return;
        if (!response.ok || !Array.isArray(data?.sessions)) {
          throw new Error(
            response.status === 401
              ? "الجلسة انتهت — سجّل الدخول تاني عشان تشوف امتحاناتك."
              : "مقدرناش نحمّل امتحاناتك.",
          );
        }

        const rows = data.sessions;
        setSessions(rows);

        const counts = new Map<string, number>();
        for (const row of rows) {
          if (typeof row.answered === "number" && row.answered > 0) {
            counts.set(row.id, row.answered);
          }
        }
        setAnsweredBySession(counts);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "مقدرناش نحمّل امتحاناتك.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="py-16 text-center flex flex-col items-center gap-3">
        <span className="w-5 h-5 border-2 border-[#2A3050] border-t-amber-300 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">بنحمّل امتحاناتك…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-16 text-center space-y-3">
        <p className="text-sm text-red-400">{error}</p>
        <button onClick={() => window.location.reload()} className="rounded-xl bg-[#2A3050] hover:bg-[#3A4060] px-4 py-2 text-sm font-bold">
          جرّب تاني
        </button>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#2A3050] bg-[#13182E]/60 p-10 text-center" role="status" aria-live="polite">
        <div className="text-4xl mb-3">📝</div>
        <h2 className="text-xl font-extrabold mb-2">مفيش امتحانات لسه</h2>
        <p className="text-slate-400 text-sm leading-relaxed max-w-md mx-auto">
          اعمل امتحان سريع من محاضراتك — كريدت واحد لكل امتحان.
          <br />
          <span className="text-slate-500">💡 نصيحة: تقدر تبدأ من زر «اختبر فهمك» في صفحة أي درس والمادة هتكون جاهزة.</span>
        </p>
        <button
          onClick={onCreate}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#0D1029] px-5 py-2.5 text-sm font-extrabold transition-colors"
        >
          <Sparkles size={15} aria-hidden />
          ولّد امتحانك الأول
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#0D1029] px-4 py-2 text-sm font-extrabold transition-colors"
        >
          <Plus size={15} aria-hidden />
          ولّد امتحان جديد
        </button>
      </div>

      {sessions.map((session) => {
        const meta = session.metadata ?? {};
        const title = meta.title || (meta.subject_name ? `امتحان ${meta.subject_name}` : "امتحان سريع");
        const expected = typeof meta.spec?.count === "number" ? meta.spec.count : null;
        const answered = answeredBySession.get(session.id) ?? 0;
        const result = meta.result;
        const isOpenable =
          session.status === "ready" ||
          session.status === "created" ||
          session.status === "generating" ||
          session.status === "completed";

        return (
          <article
            key={session.id}
            className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-5"
            aria-label={title}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-base font-extrabold leading-snug">{title}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  {meta.subject_name ? `${meta.subject_name} · ` : ""}
                  {shortDate(session.created_at)}
                </p>
              </div>
              <span
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                  session.status === "completed"
                    ? "text-emerald-300 bg-emerald-950/40 border-emerald-800/40"
                    : session.status === "failed" || session.status === "abandoned"
                      ? "text-red-300 bg-red-950/40 border-red-900/40"
                      : "text-amber-300 bg-amber-950/40 border-amber-800/40"
                }`}
              >
                {STATUS_LABELS[session.status] ?? session.status}
              </span>
            </div>

            {session.status === "completed" && result ? (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <span className="text-slate-300">
                  <span className="text-amber-300 font-extrabold">{result.total.percent}%</span>{" "}
                  · الدرجة {result.total.score}/{result.total.max}
                </span>
                <span className="text-xs text-slate-500">
                  آلي {result.auto.correct}/{result.auto.total} · ذاتي {result.essay.score}/{result.essay.max}
                </span>
              </div>
            ) : expected && expected > 0 ? (
              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span>الأسئلة المتجاوب بها</span>
                  <span className="ltr-num">
                    {Math.min(answered, expected)}/{expected}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[#0D1029] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-400/80 transition-all"
                    style={{ width: `${Math.min(100, Math.round((answered / expected) * 100))}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {session.status === "ready" && (
                <button
                  onClick={() => onOpen({ kind: "paper", sessionId: session.id })}
                  className="rounded-xl bg-amber-400 hover:bg-amber-300 text-[#0D1029] px-4 py-2 text-sm font-extrabold transition-colors"
                >
                  ابدأ الحل
                </button>
              )}
              {(session.status === "created" || session.status === "generating") && (
                <button
                  onClick={() => onOpen({ kind: "runner", sessionId: session.id })}
                  className="rounded-xl bg-amber-400 hover:bg-amber-300 text-[#0D1029] px-4 py-2 text-sm font-extrabold transition-colors"
                >
                  تابع التوليد
                </button>
              )}
              {session.status === "completed" && (
                <button
                  onClick={() => onOpen({ kind: "results", sessionId: session.id })}
                  className="rounded-xl bg-[#2A3050] hover:bg-[#3A4060] px-4 py-2 text-sm font-bold transition-colors"
                >
                  راجع النتيجة
                </button>
              )}
              {!isOpenable && <span className="text-xs text-slate-500 self-center">—</span>}
            </div>
          </article>
        );
      })}
    </div>
  );
}

/* ═══════════════════════ الـHub ═══════════════════════ */

export function ExamsHub({ initial, children }: { initial: ExamsInitial; children: ReactNode }) {
  const [tab, setTab] = useState<"my" | "bank">(initial.tab);
  const [view, setView] = useState<View>(initial.gen ? { kind: "generate" } : { kind: "list" });
  const [generatePreset, setGeneratePreset] = useState<string | undefined>(
    initial.subject || undefined
  );
  const [lastResult, setLastResult] = useState<ExamResultPayload | null>(null);

  // مزامنة التبويب مع الرابط (مشاركة/رجوع بلا reload) — نفس نمط الـWorkspace.
  const switchTab = useCallback((next: "my" | "bank") => {
    setTab(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  }, []);

  const openView = useCallback((next: View) => {
    setView(next);
    if (next.kind !== "generate") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <main dir="rtl" className="min-h-screen bg-[#0D1029] text-[#F0E6D2] font-sans">
      {/* رأس التبويبات */}
      <div className="sticky top-0 z-30 border-b border-[#2A3050] bg-[#0D1029]/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 pt-6 pb-3 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight">امتحاناتي</h1>
          {tab === "my" && view.kind === "list" && (
            <button
              onClick={() => openView({ kind: "generate" })}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#0D1029] px-4 py-2 text-sm font-extrabold transition-colors"
            >
              <Plus size={15} aria-hidden />
              ولّد امتحان
            </button>
          )}
        </div>
        <div className="max-w-5xl mx-auto px-6 pb-3 flex gap-2" role="tablist" aria-label="أقسام الامتحانات">
          <TabButton active={tab === "my"} onClick={() => switchTab("my")}>
            📝 امتحاناتي
          </TabButton>
          <TabButton active={tab === "bank"} onClick={() => switchTab("bank")}>
            🏛️ بنك الامتحانات الرسمي
          </TabButton>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 pb-16">
        {tab === "bank" ? (
          children
        ) : view.kind === "list" ? (
          <div className="pt-6">
            <MyExamsList onOpen={openView} onCreate={() => openView({ kind: "generate" })} />
          </div>
        ) : view.kind === "generate" ? (
          <div className="pt-6">
            <ExamGenerator
              initial={initial}
              presetSubject={generatePreset}
              onCreated={(sessionId) => openView({ kind: "runner", sessionId })}
              onCancel={() => openView({ kind: "list" })}
            />
          </div>
        ) : view.kind === "runner" ? (
          <div className="pt-6">
            <ExamRunner
              sessionId={view.sessionId}
              onReady={() => openView({ kind: "paper", sessionId: view.sessionId })}
              onCancel={() => openView({ kind: "list" })}
            />
          </div>
        ) : view.kind === "paper" ? (
          <ExamPaper
            sessionId={view.sessionId}
            onDone={(result) => {
              setLastResult(result);
              openView({ kind: "results", sessionId: view.sessionId });
            }}
            onExit={() => openView({ kind: "list" })}
          />
        ) : (
          <div className="pt-6">
            <ExamResults
              sessionId={view.sessionId}
              initialResult={lastResult}
              onBack={() => openView({ kind: "list" })}
              onNewExam={(subject) => {
                setGeneratePreset(subject || undefined);
                openView({ kind: "generate" });
              }}
            />
          </div>
        )}
      </div>
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-4 py-2 rounded-t-xl text-sm font-bold transition-colors border-b-2 ${
        active
          ? "border-amber-400 text-amber-300 bg-[#13182E]"
          : "border-transparent text-slate-400 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}
