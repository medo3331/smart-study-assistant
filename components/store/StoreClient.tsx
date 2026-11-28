"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PaymentConfirmForm from "@/components/store/PaymentConfirmForm";
import {
  cancelPurchaseRequest,
  createPurchaseRequest,
  fetchMyRequests,
  type PurchaseRequestClientRow,
} from "@/lib/store/purchase-client";

export type CreditPack = {
  id: string;
  title_ar: string;
  credits: number;
  price: number;
  currency: string;
};

const STATUS_BADGE: Record<PurchaseRequestClientRow["status"], { text: string; cls: string }> = {
  awaiting_payment: { text: "بانتظار الدفع", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  payment_submitted: { text: "قيد المراجعة", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  approved: { text: "تم الشحن ✅", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  rejected: { text: "مرفوض", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  cancelled: { text: "ملغى", cls: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
};

/**
 * واجهة المتجر: حزم الكريدت + إنشاء طلب + تأكيد الدفع + قائمة «طلباتي».
 * للمُسجَّلين فقط — الزائر يُوجَّه لتسجيل الدخول (isAuthenticated=false).
 */
export default function StoreClient({
  packs,
  instructions,
  isAuthenticated,
}: {
  packs: CreditPack[];
  instructions: string | null;
  isAuthenticated: boolean;
}) {
  const [requests, setRequests] = useState<PurchaseRequestClientRow[] | null>(isAuthenticated ? null : []);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyPackId, setBusyPackId] = useState<string | null>(null);

  const refreshRequests = useCallback(async () => {
    if (!isAuthenticated) return;
    const result = await fetchMyRequests();
    setRequests(result.ok ? result.data.requests : []);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let alive = true;
    fetchMyRequests().then((result) => {
      if (alive) setRequests(result.ok ? result.data.requests : []);
    }).catch(() => {
      if (alive) setRequests([]);
    });
    return () => { alive = false; };
  }, [isAuthenticated]);

  async function orderPack(packId: string) {
    setBusyPackId(packId);
    setMessage(null);
    const result = await createPurchaseRequest({ kind: "credits", packId });
    setBusyPackId(null);
    if (!result.ok) {
      setMessage({ ok: false, text: result.error });
      return;
    }
    setMessage({ ok: true, text: "تم إنشاء الطلب — أكمل الدفع ثم أكّده بالرقم المرجعي." });
    setConfirmingId(result.data.requestId);
    await refreshRequests();
  }

  async function cancelRequest(id: string) {
    const result = await cancelPurchaseRequest(id);
    if (!result.ok) {
      setMessage({ ok: false, text: result.error });
      return;
    }
    setMessage({ ok: true, text: "تم إلغاء الطلب." });
    await refreshRequests();
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          role="status"
          className={`rounded-xl border p-3 text-sm ${
            message.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-rose-500/30 bg-rose-500/10 text-rose-300"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* حزم الكريدت */}
      <section>
        <h2 className="text-xl font-extrabold mb-4">حزم الرصيد (AI Credits)</h2>
        {packs.length === 0 ? (
          <div className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-6 text-[#9AA0C0]">
            لا توجد حزم متاحة حاليًا.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {packs.map((pack) => (
              <div key={pack.id} className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-lg">{pack.title_ar}</h3>
                  <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-bold text-violet-300">
                    {pack.credits} كريدت
                  </span>
                </div>
                <div className="text-2xl font-extrabold text-violet-300">
                  {Number(pack.price).toFixed(0)} <span className="text-sm text-[#9AA0C0]">{pack.currency}</span>
                </div>
                {isAuthenticated ? (
                  <button
                    type="button"
                    onClick={() => orderPack(pack.id)}
                    disabled={busyPackId === pack.id}
                    className="mt-auto w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-2.5 font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                  >
                    {busyPackId === pack.id ? "جارٍ إنشاء الطلب…" : "اطلب الحزمة"}
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className="mt-auto block w-full rounded-xl border border-violet-500/40 py-2.5 text-center font-bold text-violet-300"
                  >
                    سجّل الدخول للشراء
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* تعليمات الدفع */}
      <section className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-6">
        <h2 className="text-xl font-extrabold mb-3">طرق الدفع</h2>
        <p className="text-sm leading-7 text-[#9AA0C0] whitespace-pre-line">
          {instructions || "فودافون كاش · إنستا باي · فيزا — بيانات التحويل تظهر قريبًا."}
        </p>
      </section>

      {/* نموذج تأكيد الدفع للطلب الحالي */}
      {confirmingId && (
        <section className="rounded-2xl border border-emerald-500/30 bg-[#13182E] p-6">
          <h2 className="text-xl font-extrabold mb-1">تأكيد الدفع</h2>
          <p className="text-sm text-[#9AA0C0] mb-4">
            حولت المبلغ؟ سجّل وسيلة الدفع ورقم العملية، وسيتراجع الطلب من الإدارة.
          </p>
          <PaymentConfirmForm
            requestId={confirmingId}
            onConfirmed={() => {
              setConfirmingId(null);
              setMessage({ ok: true, text: "تم إرسال تأكيد الدفع — سيصلك إشعار بعد المراجعة." });
              void refreshRequests();
            }}
            onCancel={() => setConfirmingId(null)}
          />
        </section>
      )}

      {/* طلباتي */}
      {isAuthenticated && (
        <section>
          <h2 className="text-xl font-extrabold mb-4">طلباتي</h2>
          {requests === null ? (
            <div className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-6 text-[#9AA0C0]">جارٍ التحميل…</div>
          ) : requests.length === 0 ? (
            <div className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-6 text-[#9AA0C0]">لا توجد طلبات بعد.</div>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => {
                const badge = STATUS_BADGE[r.status];
                return (
                  <div key={r.id} className="rounded-2xl border border-[#2A3050] bg-[#13182E] p-4 flex flex-wrap items-center gap-3 justify-between">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${badge.cls}`}>{badge.text}</span>
                      <span className="font-bold">
                        {r.kind === "plan"
                          ? `اشتراك ${r.plan_key === "pro" ? "احترافي" : r.plan_key === "ultra" ? "ألتميت" : r.plan_key} · ${r.plan_duration_days} يوم`
                          : r.kind === "coins"
                            ? `${r.coins} كوين`
                            : `${r.credits} كريدت`}
                      </span>
                      <span className="text-[#9AA0C0] font-mono" dir="ltr">
                        {r.amount != null ? `${Number(r.amount).toFixed(0)} ${r.currency}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {r.admin_note && r.status === "rejected" && (
                        <span className="text-xs text-rose-300">سبب الرفض: {r.admin_note}</span>
                      )}
                      {r.status === "awaiting_payment" && (
                        <>
                          <button
                            type="button"
                            onClick={() => setConfirmingId(r.id)}
                            className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-600"
                          >
                            أكّد الدفع
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelRequest(r.id)}
                            className="rounded-lg border border-[#2A3050] px-3 py-1.5 text-sm text-[#9AA0C0] hover:text-white"
                          >
                            إلغاء
                          </button>
                        </>
                      )}
                      {r.ticket_id && (
                        <a
                          href={`/inbox?category=support&ticket=${encodeURIComponent(r.ticket_id)}`}
                          className="text-xs text-violet-300 underline"
                        >
                          محادثة الدعم ↗
                        </a>
                      )}
                      <span className="text-xs text-[#5A6180]">
                        {new Date(r.created_at).toLocaleDateString("ar-EG")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
