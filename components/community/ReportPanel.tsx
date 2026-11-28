"use client";

// ===========================================================================
// MAGICLY — Community C4: لوحة الإبلاغ الموحدة (منشور / تعليق / حساب)
// ===========================================================================

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { REPORT_REASONS, modErrorAr, type ReportTargetType } from "@/lib/community/types";

export default function ReportPanel({
  targetType,
  targetId,
  onDone,
  onCancel,
}: {
  targetType: ReportTargetType;
  targetId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      const res = await fetch("/api/community/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason, details: details || null }),
      });
      const d = await res.json();
      if (d.success) {
        onDone();
      } else {
        alert(modErrorAr(d.code, "تعذّر إرسال الإبلاغ."));
      }
    } catch {
      alert("مشكلة شبكة — حاول تاني.");
    } finally {
      setBusy(false);
    }
  };

  const label =
    targetType === "post" ? "المنشور" : targetType === "comment" ? "التعليق" : "الحساب";

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
      <p className="text-xs font-semibold text-amber-800">الإبلاغ عن {label} — اختار السبب:</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {REPORT_REASONS.map((r) => (
          <button
            key={r.id}
            onClick={() => setReason(r.id)}
            className={`rounded-full border px-2.5 py-1 text-xs transition ${
              reason === r.id
                ? "border-amber-500 bg-amber-500/10 font-semibold text-amber-800"
                : "border-slate-200 bg-white text-ink-soft hover:border-amber-300"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder="تفاصيل إضافية (اختياري، حتى 500 حرف)"
        rows={2}
        maxLength={500}
        className="mt-2 w-full rounded border border-amber-200 bg-white p-2 text-xs"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button onClick={onCancel} className="rounded px-3 py-1 text-xs text-ink-soft hover:bg-amber-100">
          إلغاء
        </button>
        <button
          onClick={() => void submit()}
          disabled={!reason || busy}
          className="inline-flex items-center gap-1 rounded bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          إرسال الإبلاغ
        </button>
      </div>
    </div>
  );
}
