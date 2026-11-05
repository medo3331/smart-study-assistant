"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";

/** تظهر عند محاولة ميزة تتطلب باقة أعلى — تُغلق تلقائيًا بعد 8 ثوانٍ. */
export function FeatureGateToast({
  open,
  onClose,
  feature,
  requiredPlan,
  checkoutUrl,
}: {
  open: boolean;
  onClose: () => void;
  feature: string;
  requiredPlan: "pro" | "ultra";
  checkoutUrl: string | null;
}) {
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(onClose, 8000);
    return () => clearTimeout(timer);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      dir="rtl"
      role="status"
      className="fixed bottom-24 left-1/2 z-[55] w-[90%] max-w-md -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-900/95 px-4 py-3 shadow-2xl backdrop-blur"
    >
      <div className="flex items-center gap-3">
        <Sparkles className="shrink-0 text-amber-400" size={20} />
        <p className="flex-1 text-sm text-slate-200">
          <span className="font-bold">{feature}</span> متاح في خطة{" "}
          <span className="font-bold text-amber-300">{requiredPlan.toUpperCase()}</span>
        </p>
        <Link
          href={checkoutUrl ?? "/pricing"}
          className="shrink-0 rounded-lg bg-amber-500 px-3 py-1 text-xs font-bold text-black transition hover:bg-amber-400"
        >
          ترقّي
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="shrink-0 text-slate-500 transition hover:text-white"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
