"use client";

// ===========================================================================
// MAGICLY — Community C1: أزرار العلاقات في صفحة البروفايل
// ===========================================================================
// حالة العلاقة (من السيرفر) → مجموعة الأزرار المناسبة:
//   none / following      → إضافة صديق · متابعة/إلغاء · ابدأ محادثة · حظر
//   pending_sent          → إلغاء الطلب
//   pending_received      → قبول · رفض
//   friends               → ابدأ محادثة · إزالة الصداقة · حظر
//   self                  → تعديل الملف (لينك للإعدادات)
//   blocked               → إلغاء الحظر فقط
//
// كل إجراء بيمر عبر APIs بتستدعي RPCs بفرض القواعد على مستوى قاعدة البيانات —
// الواجهة هنا مجرد عرض، ومفيش محاولة تنفيذ إجراء مش مسموح.
// ===========================================================================

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { RelationState } from "@/lib/community/types";
import { relationErrorAr } from "@/lib/community/types";
import ReportPanel from "@/components/community/ReportPanel";

type Props = {
  targetUserId: string;
  initialState: RelationState;
  initialRequestId?: string | null;
  canMessage: boolean;
  canFriendRequest: boolean;
};

export default function ProfileActions({
  targetUserId,
  initialState,
  initialRequestId,
  canMessage,
  canFriendRequest,
}: Props) {
  const router = useRouter();
  const [state, setState] = useState<RelationState>(initialState);
  const [requestId, setRequestId] = useState<string | null>(initialRequestId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reported, setReported] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/community/relation?target=${encodeURIComponent(targetUserId)}`);
    const data = await res.json();
    if (data.success) {
      setState(data.state as RelationState);
      setRequestId(data.request_id ?? null);
    }
  }, [targetUserId]);

  const run = useCallback(async (fn: () => Promise<Response>, okNote: string) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fn();
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success !== false && data.ok !== false) {
        setNote(okNote);
        await refresh();
        router.refresh();
      } else {
        setError(relationErrorAr(data.code, data.error || "حصل خطأ — جرّب تاني."));
        await refresh();
      }
    } catch {
      setError("تعذّر الاتصال — جرّب تاني.");
    } finally {
      setBusy(false);
    }
  }, [refresh, router]);

  const friendAction = (action: string, payload: Record<string, string>, okNote: string) =>
    run(
      () =>
        fetch("/api/community/friends", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...payload }),
        }),
      okNote,
    );

  const followAction = (action: "follow" | "unfollow", okNote: string) =>
    run(
      () =>
        fetch("/api/community/follow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: targetUserId, action }),
        }),
      okNote,
    );

  const blockAction = (action: "block" | "unblock", okNote: string) =>
    run(
      () =>
        fetch("/api/community/block", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: targetUserId, action }),
        }),
      okNote,
    );

  const startChat = () =>
    run(
      () =>
        fetch("/api/messages/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receiver_profile_id: targetUserId, note: "" }),
        }),
      "تم إرسال طلب المراسلة — هيوصل إشعار لصاحب الحساب.",
    );

  const btn = "rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";
  const primary = `${btn} bg-marker text-white hover:opacity-90`;
  const ghost = `${btn} border border-rule text-ink hover:bg-paper-2`;
  const danger = `${btn} border border-red-200 text-red-600 hover:bg-red-50`;

  if (state === "self") {
    return (
      <a href="/dashboard/profile" className={ghost}>
        تعديل ملفك
      </a>
    );
  }

  if (showReport) {
    return (
      <div className="w-full max-w-lg" dir="rtl">
        <ReportPanel
          targetType="user"
          targetId={targetUserId}
          onDone={() => { setReported(true); setShowReport(false); }}
          onCancel={() => setShowReport(false)}
        />
        {reported && <span className="mt-2 block text-xs text-emerald-600">تم إرسال الإبلاغ — فريق الإشراف هيراجعه.</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2" dir="rtl">
      {(state === "none" || state === "following") && canFriendRequest && (
        <button className={primary} disabled={busy} onClick={() => friendAction("request", { target: targetUserId }, "تم إرسال طلب الصداقة.")}>
          إضافة صديق
        </button>
      )}
      {(state === "none" || state === "following") && !canFriendRequest && (
        <span className="text-xs text-ink-soft">صاحب الحساب مش بيقبل طلبات صداقة</span>
      )}

      {state === "pending_sent" && (
        <button className={ghost} disabled={busy || !requestId} onClick={() => friendAction("cancel", { requestId: requestId! }, "تم إلغاء الطلب.")}>
          إلغاء طلب الصداقة
        </button>
      )}

      {state === "pending_received" && (
        <>
          <button className={primary} disabled={busy || !requestId} onClick={() => friendAction("accept", { requestId: requestId! }, "مبروك — بقيتو أصدقاء!")}>
            قبول الطلب
          </button>
          <button className={ghost} disabled={busy || !requestId} onClick={() => friendAction("reject", { requestId: requestId! }, "تم رفض الطلب.")}>
            رفض
          </button>
        </>
      )}

      {(state === "none" || state === "friends") && (
        <button className={ghost} disabled={busy} onClick={() => followAction(state === "friends" ? "follow" : "follow", "تمت المتابعة.")}>
          متابعة
        </button>
      )}
      {state === "following" && (
        <button className={ghost} disabled={busy} onClick={() => followAction("unfollow", "تم إلغاء المتابعة.")}>
          إلغاء المتابعة
        </button>
      )}

      {(state === "friends" || state === "following" || state === "none") && canMessage && (
        <button className={ghost} disabled={busy} onClick={startChat}>
          ابدأ محادثة
        </button>
      )}

      {state === "friends" && (
        <button className={danger} disabled={busy} onClick={() => friendAction("remove", { target: targetUserId }, "تمت إزالة الصداقة.")}>
          إزالة الصداقة
        </button>
      )}

      {state === "blocked" ? (
        <button className={ghost} disabled={busy} onClick={() => blockAction("unblock", "تم إلغاء الحظر.")}>
          إلغاء الحظر
        </button>
      ) : (
        (
          <button className={danger} disabled={busy} onClick={() => blockAction("block", "تم الحظر — مش هيقدر يوصللك.")}>
            حظر
          </button>
        )
      )}

      {!reported && (
        <button
          className={`${btn} text-ink-soft hover:text-amber-600`}
          disabled={busy}
          onClick={() => setShowReport(true)}
        >
          إبلاغ عن الحساب
        </button>
      )}

      {note && <span className="text-xs text-emerald-600 w-full">{note}</span>}
      {error && <span className="text-xs text-red-600 w-full">{error}</span>}
    </div>
  );
}
