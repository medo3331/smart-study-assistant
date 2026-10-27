"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type SuspectedTerm = {
  term: string;
  suggested_correction: string;
  reason: string;
  start: number;
  end: number;
  segment_index: number;
  word_index: number;
};

type Decision = {
  termId: string;
  action: "accept" | "reject" | "manual_edit";
  finalValue?: string;
  decidedAt: string;
};

function termId(t: SuspectedTerm) {
  return `${t.segment_index}:${t.word_index}:${t.start}`;
}

export default function ReviewPage() {
  const params = useParams();
  const id = params?.id as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suspected, setSuspected] = useState<SuspectedTerm[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [reviewedText, setReviewedText] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [transcriptText, setTranscriptText] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/lectures/${id}/transcript/review-state`);
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        setSuspected(data.suspectedTerms ?? []);
        setReviewedText(data.reviewedText ?? null);
        setReviewStatus(data.reviewStatus ?? null);
        setTranscriptText(data.transcriptText ?? null);
        const decs: Decision[] = data.reviewDecisions ?? [];
        const map: Record<string, Decision> = {};
        for (const d of decs) map[d.termId] = d;
        setDecisions(map);
      } catch {
        setError("تعذّر تحميل حالة المراجعة.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function runDetect() {
    setDetecting(true);
    setError(null);
    try {
      const res = await fetch(`/api/lectures/${id}/transcript/detect-suspects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const code = d?.error?.code;
        if (code === "EMPTY_TRANSCRIPT") {
          throw new Error("هذا التفريغ (قديم) لا يحتوي على بيانات مقاطع/كلمات، لذا لا يمكن كشف المصطلحات تلقائيًا. يمكنك مراجعة النص يدويًا.");
        }
        throw new Error(d?.error?.message ?? "failed");
      }
      const data = await res.json();
      setSuspected(data.suspectedTerms ?? []);
      setReviewStatus("pending");
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل كشف المصطلحات.");
    } finally {
      setDetecting(false);
    }
  }

  function setDecision(t: SuspectedTerm, action: Decision["action"], finalValue?: string) {
    const tid = termId(t);
    setDecisions((prev) => ({
      ...prev,
      [tid]: { termId: tid, action, finalValue, decidedAt: new Date().toISOString() },
    }));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const decList = Object.values(decisions);
      const res = await fetch(`/api/lectures/${id}/transcript/submit-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions: decList }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error?.message ?? "failed");
      }
      const data = await res.json();
      setReviewedText(data.reviewedText ?? null);
      setReviewStatus(data.reviewStatus ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل حفظ المراجعة.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-ink-soft">جاري التحميل…</div>;

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">مراجعة النص</h1>
        <Link href="/lectures" className="text-sm text-indigo-600 hover:underline">← العودة</Link>
      </div>

      {error && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-xl border border-[var(--rule)] bg-[var(--card-primary)] p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--text)]">النص الأصلي</h2>
          <span className="text-xs text-[var(--muted)]">
            {reviewStatus === "completed" ? "تمت المراجعة" : reviewStatus ? "قيد المراجعة" : "لم تُراجع"}
          </span>
        </div>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/5 p-3 text-sm leading-relaxed text-ink dark:bg-white/10">
          {transcriptText ?? "—"}
        </pre>
      </div>

      {suspected.length === 0 && (
        <div className="text-center">
          <button
            onClick={runDetect}
            disabled={detecting}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {detecting ? "جاري الكشف…" : "كشف المصطلحات المشkok فيها"}
          </button>
        </div>
      )}

      {suspected.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-[var(--text)]">المصطلحات المشكوك فيها</h2>
          {suspected.map((t) => {
            const tid = termId(t);
            const d = decisions[tid];
            return (
              <div key={tid} className="rounded-xl border border-[var(--rule)] bg-[var(--card-primary)] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--text)]">{t.term}</span>
                  <span className="text-xs text-[var(--muted)]">{t.reason}</span>
                </div>
                <div className="text-xs text-[var(--muted)]">اقتراح: <span className="text-emerald-700">{t.suggested_correction}</span></div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setDecision(t, "accept")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${d?.action === "accept" ? "bg-emerald-600 text-white" : "bg-emerald-500/10 text-emerald-700"}`}
                  >
                    قبول
                  </button>
                  <button
                    onClick={() => setDecision(t, "reject")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${d?.action === "reject" ? "bg-red-600 text-white" : "bg-red-500/10 text-red-700"}`}
                  >
                    رفض
                  </button>
                  <input
                    type="text"
                    placeholder="تصحيح يدوي"
                    value={d?.action === "manual_edit" ? (d.finalValue ?? "") : ""}
                    onChange={(e) => setDecision(t, "manual_edit", e.target.value)}
                    className="flex-1 rounded-lg border border-[var(--rule)] bg-[var(--app-bg)] px-2 py-1 text-xs text-[var(--text)]"
                  />
                </div>
              </div>
            );
          })}
          <button
            onClick={submit}
            disabled={submitting || Object.keys(decisions).length === 0}
            className="w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? "جاري الحفظ…" : "حفظ المراجعة"}
          </button>
        </div>
      )}

      {reviewedText && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <h2 className="mb-2 text-sm font-bold text-emerald-700">النص المُراجع</h2>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-emerald-900">
            {reviewedText}
          </pre>
        </div>
      )}
    </div>
  );
}
