"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import type { CreditStatusPayload } from "@/lib/upsell/credit-status";

/**
 * نافذة «الرصيد صفر» — تحجب التفاعل (overlay) حتى يقرر المستخدم.
 *
 * لا تعرض أسعارًا مكتوبة في الكود: الأسعار مصدرها القاعدة وصفحة
 * /checkout تعرضها. هذا يمنع drift كالذي أصلحناه في B1.3/B1.4.
 */
export function ExhaustedModal({
  open,
  onClose,
  status,
}: {
  open: boolean;
  onClose: () => void;
  status: Pick<CreditStatusPayload, "next_plan" | "checkout_url" | "tier"> | null;
}) {
  if (!open || !status) return null;

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exhausted-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20">
            <AlertTriangle className="text-amber-400" size={24} />
          </span>
          <div>
            <h3 id="exhausted-title" className="text-lg font-bold text-white">
              خلصت الكريدت
            </h3>
            <p className="text-xs text-slate-400">
              باقتك الحالية: <span className="font-mono">{status.tier}</span> — تحتاج ترقية للمتابعة.
            </p>
          </div>
        </div>

        {status.next_plan ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-sm text-slate-300">
              الخطة التالية: <span className="font-bold text-white">{status.next_plan.toUpperCase()}</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              رصيد شهري أكبر + حدود أعلى — التفاصيل والسعر في صفحة الاشتراك.
            </p>
          </div>
        ) : null}

        <div className="flex gap-2">
          <Link
            href={status.checkout_url ?? "/pricing"}
            className="flex-1 rounded-lg bg-amber-500 px-4 py-2.5 text-center text-sm font-bold text-black transition hover:bg-amber-400"
          >
            {status.checkout_url ? "ترقّي الآن" : "الأسعار"}
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-bold text-slate-300 transition hover:bg-slate-700"
          >
            استنى
          </button>
        </div>
      </div>
    </div>
  );
}
