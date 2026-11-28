"use client";

// ===========================================================================
// MAGICLY — Community C4: حالة الإشراف للطالب (لافتة العقوبة + تقديم اعتراض)
// ===========================================================================

import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldAlert, Gavel } from "lucide-react";
import type { ModerationStatus } from "@/lib/community/types";
import { modErrorAr } from "@/lib/community/types";

const ACTION_AR: Record<string, string> = {
  warning: "تحذير",
  restrict: "تقييد مؤقت",
  suspend: "إيقاف",
};

export default function ModerationStatus() {
  const [status, setStatus] = useState<ModerationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealText, setAppealText] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/community/moderation", { cache: "no-store" });
      const d = await res.json();
      if (d.success && d.status?.ok) setStatus(d.status as ModerationStatus);
    } catch {
      // فشل صامت — اللافتة مش حرجة
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submitAppeal = async () => {
    const action = status?.active_action;
    if (!action) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/community/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: action.id, message: appealText }),
      });
      const d = await res.json();
      if (d.success) {
        setAppealOpen(false);
        setAppealText("");
        setFeedback("وصل الاعتراض — فريق المراجعة هيراجعه ويرد عليك بإشعار.");
        void load();
      } else {
        setFeedback(modErrorAr(d.code, "تعذّر إرسال الاعتراض."));
      }
    } catch {
      setFeedback("مشكلة شبكة — حاول تاني.");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !status) return null;

  const hasActive = status.banned || !!status.restricted_until;
  const pendingAppeal = status.my_appeals?.some((a) => a.status === "pending");
  if (!hasActive && !status.warning_count && !pendingAppeal) return null;

  const untilText = status.restricted_until
    ? new Date(status.restricted_until).toLocaleString("ar-EG")
    : null;

  return (
    <div
      className={`rounded-xl border p-4 ${
        hasActive ? "border-red-200 bg-red-50/70" : "border-amber-200 bg-amber-50/70"
      }`}
    >
      {hasActive ? (
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-bold text-red-800">
              {status.banned ? "حسابك موقوف من المجتمع" : "حسابك مقيّد مؤقتًا في المجتمع"}
            </p>
            {status.active_action?.reason ? (
              <p className="mt-1 text-red-700">السبب: {status.active_action.reason}</p>
            ) : null}
            {untilText ? <p className="mt-0.5 text-xs text-red-600">ينتهي: {untilText}</p> : null}
            {pendingAppeal ? (
              <p className="mt-2 text-xs font-medium text-amber-700">اعتراضك تحت المراجعة حاليًا — هتوصلك نتيجته بإشعار.</p>
            ) : status.active_action && !status.my_appeals?.some((a) => a.action_id === status.active_action?.id) ? (
              appealOpen ? (
                <div className="mt-2">
                  <textarea
                    value={appealText}
                    onChange={(e) => setAppealText(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="اكتب اعتراضك — ليه تعتقد إن الإجراء لازم يتزحزح؟ (10–1000 حرف)"
                    className="w-full rounded border border-red-200 bg-white p-2 text-xs"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => void submitAppeal()}
                      disabled={busy || appealText.trim().length < 10}
                      className="inline-flex items-center gap-1 rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      إرسال الاعتراض
                    </button>
                    <button onClick={() => setAppealOpen(false)} className="rounded px-3 py-1.5 text-xs text-ink-soft hover:bg-red-100">
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAppealOpen(true)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                >
                  <Gavel className="h-3.5 w-3.5" />
                  تقديم اعتراض
                </button>
              )
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-xs text-amber-800">
          ⚠️ عندك {status.warning_count} تحذير إشرافي — التكرار ممكن يؤدي لتقييد الحساب.
        </p>
      )}
      {feedback ? <p className="mt-2 text-xs font-medium text-ink">{feedback}</p> : null}
    </div>
  );
}
