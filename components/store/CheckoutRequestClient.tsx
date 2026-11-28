"use client";

import { useEffect, useRef, useState } from "react";
import PaymentConfirmForm from "@/components/store/PaymentConfirmForm";
import { createPurchaseRequest } from "@/lib/store/purchase-client";

/**
 * تدفق طلب الاشتراك داخل التطبيق (بدل الواتساب): إنشاء طلب ثم تأكيد الدفع.
 * يعرف إن كان للمستخدم طلب نشط لنفس الباقة فيعرض حالته بدل التكرار.
 */
export default function CheckoutRequestClient({
  planKey,
  durationDays,
  isAuthenticated,
  paymentsEnabled,
}: {
  planKey: string;
  durationDays: number;
  isAuthenticated: boolean;
  paymentsEnabled: boolean;
}) {
  const [requestId, setRequestId] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const checkedActive = useRef(false);

  // لو فيه طلب نشط لنفس الباقة، اعرضه بدل محاولة إنشاء مكرر (الـ API يرجع 409).
  useEffect(() => {
    if (!isAuthenticated || checkedActive.current) return;
    checkedActive.current = true;
    (async () => {
      try {
        const res = await fetch("/api/store/purchase-requests", { cache: "no-store" });
        const body = await res.json().catch(() => null);
        const requests = (body?.requests ?? []) as Array<{ id: string; kind: string; plan_key: string | null; status: string; ticket_id?: string | null }>;
        const active = requests.find(
          (r) => r.kind === "plan" && r.plan_key === planKey && (r.status === "awaiting_payment" || r.status === "payment_submitted")
        );
        if (active) {
          setRequestId(active.id);
          setTicketId(active.ticket_id ?? null);
          setSubmitted(active.status === "payment_submitted");
        }
      } catch {
        // لا شيء — المستخدم ينشئ الطلب يدويًا.
      }
    })();
  }, [isAuthenticated, planKey]);

  async function createRequest(viaSupport: boolean) {
    setError(null);
    setCreating(true);
    const result = await createPurchaseRequest({ kind: "plan", planKey, durationDays, viaSupport });
    setCreating(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRequestId(result.data.requestId);
    setTicketId(result.data.ticketId ?? null);
  }

  if (!paymentsEnabled) {
    return (
      <div className="rounded-xl bg-amber-400/10 border border-amber-400/30 p-4 text-amber-300 font-bold text-sm">
        الدفع غير مفعل حالياً. الاشتراك متاح عبر الدعم المباشر فقط.
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <a
        href="/login"
        className="inline-block w-full text-center rounded-xl font-bold py-3.5 transition bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white hover:brightness-110"
      >
        سجّل الدخول لطلب الاشتراك
      </a>
    );
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-300 font-bold text-sm">
        ✅ تم إرسال تأكيد الدفع — طلبك قيد المراجعة وسيصلك إشعار بالنتيجة.
      </div>
    );
  }

  if (requestId) {
    return (
      <div className="space-y-3">
        {ticketId && (
          <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3 text-sm text-violet-300">
            فتحنا لك محادثة دعم بتفاصيل الطلب — تقدر تكمل مع الإدارة من هناك:{" "}
            <a href={`/inbox?category=support&ticket=${encodeURIComponent(ticketId)}`} className="underline font-bold">
              اذهب إلى المحادثة ↗
            </a>
          </div>
        )}
        <p className="text-sm text-[#9AA0C0]">حولت المبلغ؟ سجّل وسيلة الدفع ورقم العملية ليتراجع طلبك.</p>
        <PaymentConfirmForm
          requestId={requestId}
          onConfirmed={() => setSubmitted(true)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => createRequest(false)}
          disabled={creating}
          className="rounded-xl font-bold py-3.5 transition bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:brightness-110 disabled:opacity-50"
        >
          {creating ? "جارٍ إنشاء الطلب…" : "اطلب الاشتراك"}
        </button>
        <button
          type="button"
          onClick={() => createRequest(true)}
          disabled={creating}
          className="rounded-xl font-bold py-3.5 transition border border-violet-500/40 text-violet-300 hover:bg-violet-500/10 disabled:opacity-50"
        >
          اطلب عبر رسايل الدعم
        </button>
      </div>
      <p className="text-xs text-[#7A8298] text-center">
        سينشئ طلبًا بحالة «بانتظار الدفع» — بعد التحويل أكّد الدفع هنا، والإدارة تراجع الطلب وتفعّل الاشتراك.
        عبر رسايل الدعم تفتح لك محادثة مع الإدارة لتأكيد الدفع والمتابعة.
      </p>
    </div>
  );
}
