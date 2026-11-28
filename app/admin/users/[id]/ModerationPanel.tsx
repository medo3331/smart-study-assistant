"use client";

// ===========================================================================
// MAGICLY — لوحة إشراف المستخدم داخل صفحة تفاصيل الطالب بالأدمن
// - تعرض حالة الحظر/التقييد/التحذيرات دائمًا (الحساب المحظور لا يختفي من الأدمن)
// - إجراءات: تحذير / تقييد مؤقت / حظر مؤقت / رفع الإجراء — عبر C4 RPCs
//   (mod_issue_action / mod_lift_action) في /api/admin/community/moderation
// ===========================================================================

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Gavel, ShieldOff } from "lucide-react";

export type ActiveAction = {
  id: string;
  action_type: string;
  reason: string;
  expires_at: string | null;
  created_at: string;
};

export type UserModStatus = {
  is_banned: boolean;
  banned_at: string | null;
  ban_reason: string | null;
  restriction_until: string | null;
  warning_count: number;
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "—";

export function UserModerationPanel({
  userId,
  status,
  activeActions,
  canModerate,
}: {
  userId: string;
  status: UserModStatus;
  activeActions: ActiveAction[];
  canModerate: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("7");

  const call = async (payload: Record<string, unknown>, okText: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/community/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ tone: "ok", text: okText });
        setReason("");
        router.refresh();
      } else {
        setMsg({ tone: "err", text: data.error || "فشل تنفيذ الإجراء." });
      }
    } catch {
      setMsg({ tone: "err", text: "خطأ في الشبكة." });
    } finally {
      setBusy(false);
    }
  };

  const needsReason = () => {
    if (!reason.trim()) {
      setMsg({ tone: "err", text: "اكتب سبب الإجراء أولًا." });
      return true;
    }
    return false;
  };

  const parsedDays = () => {
    const n = parseInt(days, 10);
    return Number.isFinite(n) && n > 0 && n <= 365 ? n : null;
  };

  const statusLabel = status.is_banned
    ? { text: "محظور (موقوف)", cls: "bg-rose-500/15 text-rose-300 border-rose-500/40" }
    : status.restriction_until && new Date(status.restriction_until).getTime() > Date.now()
      ? { text: "مقيّد حتى " + fmtDate(status.restriction_until), cls: "bg-amber-500/15 text-amber-300 border-amber-500/40" }
      : { text: "سليم — لا توجد قيود", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusLabel.cls}`}>
          الحالة: {statusLabel.text}
        </span>
        <span className="text-xs text-slate-400">تحذيرات نشطة: {status.warning_count ?? 0}</span>
        {status.banned_at ? (
          <span className="text-xs text-rose-300">تاريخ الحظر: {fmtDate(status.banned_at)}</span>
        ) : null}
      </div>

      {status.ban_reason ? (
        <p className="text-xs text-slate-400">سبب الحظر/التقييد المسجل: {status.ban_reason}</p>
      ) : null}

      {activeActions.length > 0 ? (
        <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950/40 text-xs">
          {activeActions.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="font-bold text-slate-200">
                {{ warning: "تحذير", restrict: "تقييد", suspend: "حظر مؤقت", lift: "رفع إجراء" }[a.action_type] ?? a.action_type}
                {" — "}
                {a.reason}
              </span>
              <span className="flex items-center gap-2 text-slate-400">
                ينتهي: {a.expires_at ? fmtDate(a.expires_at) : "غير محدد"}
                {canModerate ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => call({ action: "lift_action", actionId: a.id, notes: "رفع من صفحة المستخدم" }, "تم رفع الإجراء.")}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600/80 px-2 py-1 font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    <ShieldOff size={12} /> رفع
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">لا توجد إجراءات إشراف نشطة.</p>
      )}

      {canModerate ? (
        <div className="space-y-3 border-t border-slate-800 pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-400">
              سبب الإجراء
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="مثال: تنمر على الطلاب في المنشورات"
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-600"
              />
            </label>
            <label className="text-xs text-slate-400">
              المدة (أيام) — للحظر/التقييد المؤقت
              <input
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => !needsReason() && call({ action: "issue_action", userId, actionType: "warning", reason: reason.trim() }, "تم إصدار تحذير.")}
              className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-500 disabled:opacity-50"
            >
              تحذير
            </button>
            <button
              type="button"
              disabled={busy || !parsedDays()}
              onClick={() => !needsReason() && call({ action: "issue_action", userId, actionType: "restrict", reason: reason.trim(), days: parsedDays() }, `تم التقييد لمدة ${days} يوم.`)}
              className="rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-500 disabled:opacity-50"
            >
              تقييد مؤقت
            </button>
            <button
              type="button"
              disabled={busy || !parsedDays()}
              onClick={() => !needsReason() && call({ action: "issue_action", userId, actionType: "suspend", reason: reason.trim(), days: parsedDays() }, `تم الحظر المؤقت لمدة ${days} يوم.`)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50"
            >
              <Gavel size={13} /> حظر مؤقت
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            الإجراءات تُسجَّل في سجل التدقيق، وتُخفي منشورات المستخدم المقيّد/المحظور من المجتمع، ويصل المستخدم إشعار بها.
            الاعتراض متاح له من صفحة الإشراف.
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-500">ليس لديك صلاحية community.moderate — العرض فقط.</p>
      )}

      {msg ? (
        <p className={`text-xs font-bold ${msg.tone === "ok" ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p>
      ) : null}
    </div>
  );
}
