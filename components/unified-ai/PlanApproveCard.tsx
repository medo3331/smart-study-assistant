"use client";

import { useState } from "react";
import type { PlanDraft } from "@/lib/agent/plan-draft";

type PlanState = "idle" | "saving" | "done" | "error";

export function PlanApproveCard({ draft }: { draft: PlanDraft }) {
  const [state, setState] = useState<PlanState>("idle");
  const [href, setHref] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function approve() {
    setState("saving");
    setError("");
    try {
      const res = await fetch("/api/agent/study-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setHref(data.href ?? "/dashboard/planner");
        setState("done");
      } else {
        setError(data?.error ?? "حصل خطأ أثناء إنشاء الخطة.");
        setState("error");
      }
    } catch {
      setError("مشكلة في الاتصال — جرب تاني.");
      setState("error");
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-rule bg-paper px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-ink">
        🎯 خطة مذاكرة جاهزة للاعتماد — {draft.subject} ({draft.days.length} أيام، الامتحان {draft.examDate})
      </div>
      {state === "done" ? (
        <p className="mt-1.5 text-[11px] text-emerald-700">
          ✅ اتعملت الخطة في حسابك{" "}
          {href && (
            <a href={href} className="underline font-bold">
              افتح المخطط
            </a>
          )}
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={approve}
            disabled={state === "saving"}
            className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-extrabold text-[var(--on-marker)] transition hover:brightness-110 disabled:opacity-60"
          >
            {state === "saving" ? "جاري الإنشاء…" : "✅ اعتمد الخطة وأنشئها"}
          </button>
          {state === "error" && <p className="mt-1.5 text-[11px] text-rose-600">{error}</p>}
        </>
      )}
    </div>
  );
}
