"use client";

/* ==========================================================================
   قسم Magic Credits في المتجر (D-M-02 — دمج /store داخل /shop)

   نفس مسار الدفع اليدوي: طلب → الدفع خارج المنصة → تأكيد برقم العملية
   → مراجعة أدمن → `grant_credits`. تعليمات الدفع من
   `app_settings.billing_payment_instructions` (قراءة عامة مسموحة).
   ========================================================================== */

import { useCallback, useEffect, useState } from "react";
import { Gem } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import PaymentConfirmForm from "@/components/store/PaymentConfirmForm";
import {
  cancelPurchaseRequest,
  createPurchaseRequest,
  fetchMyRequests,
  type PurchaseRequestClientRow,
} from "@/lib/store/purchase-client";

type CreditPack = {
  id: string;
  title_ar: string;
  credits: number;
  price: number;
  currency: string;
};

const ACTIVE_STATUSES = ["awaiting_payment", "payment_submitted"] as const;

export function CreditPacksPanel({
  supabase,
  creditBalance,
  onCreditsGranted,
}: {
  supabase: SupabaseClient | null;
  /** رصيد الكريدت الحالي (ai_credit_balance) — للعرض فقط. */
  creditBalance: number | null;
  /** بيتنده لو فيه طلب اتشحن (approved) — عشان الأرصدة تتحدّث. */
  onCreditsGranted: () => void;
}) {
  const [packs, setPacks] = useState<CreditPack[] | null>(null);
  const [instructions, setInstructions] = useState<string | null>(null);
  const [requests, setRequests] = useState<PurchaseRequestClientRow[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyPackId, setBusyPackId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refreshRequests = useCallback(async () => {
    const result = await fetchMyRequests();
    if (result.ok) {
      const creditRequests = result.data.requests.filter((r) => r.kind === "credits");
      setRequests(creditRequests);
      if (creditRequests.some((r) => r.status === "approved")) onCreditsGranted();
    }
  }, [onCreditsGranted]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase
      .from("credit_packs")
      .select("id, title_ar, credits, price, currency")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => {
        if (alive) setPacks((data ?? []) as CreditPack[]);
      });
    void supabase
      .from("app_settings")
      .select("value")
      .eq("key", "billing_payment_instructions")
      .maybeSingle()
      .then(({ data }) => {
        const value = (data as { value?: string } | null)?.value;
        if (alive) setInstructions(typeof value === "string" && value.trim() ? value.trim() : null);
      });
    void refreshRequests();
    return () => { alive = false; };
  }, [supabase, refreshRequests]);

  async function orderPack(packId: string) {
    setBusyPackId(packId);
    setMessage(null);
    const result = await createPurchaseRequest({ kind: "credits", packId });
    setBusyPackId(null);
    if (!result.ok) {
      setMessage({ ok: false, text: result.error });
      return;
    }
    setMessage({ ok: true, text: "اتعمل الطلب — كمّل الدفع وبعدين أكّده بالرقم المرجعي." });
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

  if (!packs || packs.length === 0) return null;

  return (
    <section id="credits" className="space-y-3 scroll-mt-24" aria-labelledby="credit-packs-title">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 id="credit-packs-title" className="font-display font-extrabold text-[15px] text-ink flex items-center gap-2">
          <Gem className="w-4 h-4 text-ink-soft" aria-hidden />
          Magic Credits — رصيد الذكاء الاصطناعي
        </h2>
        <span className="mono text-[11px] text-ink-soft">
          رصيدك: <b className="text-ink ltr-num tnum">{creditBalance ?? "—"}</b> كريدت
        </span>
      </div>

      <p className="text-[11px] text-ink-soft">
        الكريدت للخدمات اللي ليها تكلفة تشغيل فعلية (شرح، امتحانات، مراجعات) — والدفع يدوي وبيتراجعه فريقنا قبل الشحن.
      </p>

      {message && (
        <p
          role="status"
          className={`text-[12px] rounded-[var(--r-sm,8px)] border px-3 py-2 ${
            message.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
              : "border-rose-500/30 bg-rose-500/10 text-rose-600"
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="shop-grid">
        {packs.map((pack) => {
          const hasActive = requests.some(
            (r) => r.pack_id === pack.id && ACTIVE_STATUSES.includes(r.status as typeof ACTIVE_STATUSES[number]),
          );
          return (
            <div key={pack.id} className="shop-card">
              <p className="font-display font-extrabold text-[13px] text-ink leading-tight">{pack.title_ar}</p>
              <p className="text-[12px] text-ink-soft">
                <b className="text-ink ltr-num tnum text-[16px]">{pack.credits}</b> كريدت
              </p>
              <p className="text-[13px] font-extrabold text-ink ltr-num tnum">
                {Number(pack.price).toFixed(0)} {pack.currency}
              </p>
              <button
                type="button"
                onClick={() => void orderPack(pack.id)}
                disabled={busyPackId === pack.id || hasActive}
                className="btn btn-marker text-[12px] mt-auto"
              >
                {hasActive
                  ? "عندك طلب مفتوح للحزمة دي"
                  : busyPackId === pack.id
                    ? "جارٍ إنشاء الطلب…"
                    : "اطلب الحزمة"}
              </button>
            </div>
          );
        })}
      </div>

      <details className="rounded-[var(--r-md,12px)] border border-rule bg-paper-2 px-4 py-3">
        <summary className="text-[12px] font-bold text-ink cursor-pointer">طرق الدفع</summary>
        <p className="text-[11px] text-ink-soft leading-relaxed whitespace-pre-line mt-2">
          {instructions || "فودافون كاش · إنستاباي · فيزا — بيانات التحويل تظهر قريبًا."}
        </p>
      </details>

      {confirmingId && (
        <div className="rounded-[var(--r-md,12px)] border border-emerald-500/30 bg-paper-2 p-4 space-y-2">
          <h3 className="font-display font-extrabold text-[14px] text-ink">تأكيد الدفع</h3>
          <p className="text-[11px] text-ink-soft">
            حوّلت المبلغ؟ سجّل وسيلة الدفع ورقم العملية، والرصيد هيتشحن بعد مراجعة الإدارة.
          </p>
          <PaymentConfirmForm
            requestId={confirmingId}
            onConfirmed={() => {
              setConfirmingId(null);
              setMessage({ ok: true, text: "اتسجّل تأكيد الدفع — هيوصلك إشعار بعد المراجعة." });
              void refreshRequests();
            }}
            onCancel={() => setConfirmingId(null)}
          />
        </div>
      )}

      {requests.length > 0 && (
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-[var(--r-sm,8px)] border border-rule bg-paper-2 px-3 py-2 text-[12px]">
              <span className="font-bold text-ink">{r.credits} كريدت</span>
              <span className="text-ink-soft ltr-num tnum">
                {r.amount != null ? `${Number(r.amount).toFixed(0)} ${r.currency}` : ""}
              </span>
              <span className={`mono text-[10px] rounded-full border px-2 py-0.5 ${
                r.status === "approved" ? "text-emerald-600 border-emerald-500/30"
                : r.status === "payment_submitted" ? "text-amber-600 border-amber-500/30"
                : r.status === "rejected" ? "text-rose-600 border-rose-500/30"
                : "text-ink-soft border-rule"
              }`}>
                {r.status === "awaiting_payment" ? "بانتظار الدفع"
                : r.status === "payment_submitted" ? "قيد المراجعة"
                : r.status === "approved" ? "تم الشحن ✅"
                : r.status === "rejected" ? "مرفوض" : "ملغى"}
              </span>
              {r.status === "rejected" && r.admin_note && (
                <span className="text-[10px] text-rose-500">السبب: {r.admin_note}</span>
              )}
              {r.status === "awaiting_payment" && (
                <>
                  <button type="button" onClick={() => setConfirmingId(r.id)} className="text-[11px] text-emerald-600 underline underline-offset-4">
                    أكّد الدفع
                  </button>
                  <button type="button" onClick={() => void cancelRequest(r.id)} className="text-[11px] text-ink-soft hover:text-ink">
                    إلغاء
                  </button>
                </>
              )}
              {r.ticket_id && (
                <a href={`/inbox?category=support&ticket=${encodeURIComponent(r.ticket_id)}`} className="text-[10px] text-ink-soft underline">
                  محادثة الدعم ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
