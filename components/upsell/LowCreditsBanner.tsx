"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

import { useCreditStatus } from "@/lib/upsell/use-credit-status";

const DISMISS_KEY = "upsell:banner_dismissed_until";
const DISMISS_TTL_MS = 60 * 60 * 1000; // ساعة

/**
 * بانر «الرصيد منخفض» — يظهر عند status = low/critical فقط.
 *
 * ⚠️ قراءة sessionStorage في `useEffect` لا في جسم العرض: القراءة أثناء
 * العرض تُنتج اختلافًا بين HTML السيرفر وأول render في العميل (hydration).
 */
export function LowCreditsBanner() {
  const { status } = useCreditStatus();
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const until = Number(sessionStorage.getItem(DISMISS_KEY) ?? "0");
      if (Number.isFinite(until) && until > Date.now()) setDismissed(true);
    } catch {
      // sessionStorage محظور (private mode) — البانر يظل قابلًا للإخفاء بالزر.
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_TTL_MS));
    } catch {
      // لا شيء: الإخفاء محلي لهذه الصفحة فقط.
    }
  };

  if (!mounted || dismissed || !status) return null;
  if (status.status !== "low" && status.status !== "critical") return null;
  if (!status.next_plan) return null;

  const isCritical = status.status === "critical";

  return (
    <div
      dir="rtl"
      role="status"
      className={`mx-auto mt-4 max-w-3xl rounded-xl border px-4 py-3 shadow-lg ${
        isCritical
          ? "border-rose-500/40 bg-rose-500/10"
          : "border-amber-500/40 bg-amber-500/10"
      }`}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-xl">{isCritical ? "🔴" : "⚡"}</span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold ${isCritical ? "text-rose-200" : "text-amber-200"}`}>
            باقي {status.credits_remaining} كريدت فقط ({status.credits_percent}%)
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            ترقّي إلى {status.next_plan.toUpperCase()} ورصيد شهري أكبر.
          </p>
        </div>
        <Link
          href={status.checkout_url ?? "/pricing"}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-black ${
            isCritical ? "bg-rose-400 hover:bg-rose-300" : "bg-amber-400 hover:bg-amber-300"
          }`}
        >
          ترقّي
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="إغلاق التنبيه"
          className="shrink-0 text-[var(--color-text-muted)] transition hover:text-[var(--color-text-primary)]"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
