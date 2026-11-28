"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import type { CreditStatusPayload } from "@/lib/upsell/credit-status";

/**
 * بانر «الرصيد صفر» — اقتراح غير حاجز أسفل الشاشة (مش overlay بيقفل التفاعل).
 *
 * لا تعرض أسعارًا مكتوبة في الكود: الأسعار مصدرها القاعدة وصفحة
 * /pricing تعرضها. هذا يمنع drift كالذي أصلحناه في B1.3/B1.4.
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
      role="status"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md space-y-3 rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl sm:inset-x-auto sm:right-4"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
          <AlertTriangle className="text-amber-400" size={20} />
        </span>
        <div>
          <h3 className="text-base font-bold text-white">خلصت الكريدت</h3>
          <p className="text-xs text-slate-400">
            تقدر تكمل باقي المنصة عادي — ولو محتاج كريدت أكتر، شوف الباقات.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="mr-auto rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
        >
          ✕
        </button>
      </div>

      {status.next_plan ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <p className="text-sm text-slate-300">
            الخطة التالية: <span className="font-bold text-white">{status.next_plan.toUpperCase()}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            رصيد أكبر وحدود أعلى — التفاصيل والسعر في صفحة الباقات.
          </p>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Link
          href={status.checkout_url ?? "/pricing"}
          className="flex-1 rounded-lg bg-amber-500 px-4 py-2 text-center text-sm font-bold text-black transition hover:bg-amber-400"
        >
          شوف الباقات
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-slate-300 transition hover:bg-slate-700"
        >
          لاحقًا
        </button>
      </div>
    </div>
  );
}
