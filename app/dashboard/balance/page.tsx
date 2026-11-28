"use client";

import Link from "next/link";
import { Coins, CreditCard, RefreshCw, Wallet } from "lucide-react";
import { PageShell, DataNotice, LoadingSheets } from "@/app/dashboard/components/PageShell";
import { usePlanQuota } from "@/lib/upsell/use-plan-quota";

/* ==========================================================================
   الرصيد والباقة

   البند اللي في القايمة الجانبية («الرصيد») كان بيوصل لصفحة مش موجودة.
   الصفحة بتقرا من /api/me/plan-quota عبر usePlanQuota — يعيد الجلب
   تلقائيًا عند الرجوع للتاب وبعد كل استهلاك كريدت (حدث ai-credits-changed)،
   فالرقم مش بيفضل قديم بعد استخدام الذكاء الاصطناعي.
   ========================================================================== */

const TIER_LABEL: Record<string, string> = {
  free: "المجانية",
  pro: "برو",
  ultra: "ألترا",
};

export default function BalancePage() {
  // جلب + إعادة جلب تلقائية (focus / visibility / ai-credits-changed)
  const { data: quota, loading, error: fetchError, refresh } = usePlanQuota();

  const error = fetchError
    ? fetchError.includes("401")
      ? "سجّل الدخول الأول عشان تشوف رصيدك."
      : "مش قادرين نجيب رصيدك دلوقتي. جرّب تحدّث الصفحة."
    : null;

  const credits = quota?.credits;
  const tier = quota?.tier ?? "free";
  const messages = quota?.messages;

  return (
    <PageShell
      eyebrow="Balance"
      title="الرصيد والباقة"
      lede="كل أرقامك المالية في مكان واحد: رصيد الكريدت، باقتك الحالية، واستهلاكك اليومي من الخدمات."
    >
      <div className="flex justify-end mb-2">
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="btn btn-quiet text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
          aria-label="تحديث الرصيد"
        >
          <RefreshCw size={13} aria-hidden className={loading ? "animate-spin" : ""} />
          تحديث
        </button>
      </div>

      {error && <DataNotice message={error} />}

      {!error && !quota && loading && <LoadingSheets count={3} />}

      {!error && !quota && !loading && <DataNotice message="مفيش بيانات رصيد متاحة حاليًا." />}

      {!error && quota && (
        <>
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="sheet-card p-5">
              <div className="flex items-center gap-2 text-ink-soft">
                <Wallet size={16} aria-hidden />
                <p className="tag m-0">رصيد الكريدت</p>
              </div>
              <p className="mt-2 text-3xl font-extrabold text-ink ltr-num" dir="ltr">
                {typeof credits === "number" ? credits.toLocaleString("ar-EG") : "—"}
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                الكريدت بيتخصم من استخدام الذكاء الاصطناعي، وبيتجدد حسب باقتك.
              </p>
            </div>

            <div className="sheet-card p-5">
              <div className="flex items-center gap-2 text-ink-soft">
                <CreditCard size={16} aria-hidden />
                <p className="tag m-0">الباقة الحالية</p>
              </div>
              <p className="mt-2 text-3xl font-extrabold text-ink">{TIER_LABEL[tier] ?? tier}</p>
              <Link href="/pricing" className="btn btn-marker text-sm mt-3 inline-flex">
                استعرض الباقات
              </Link>
            </div>
          </section>

          {messages && messages.limit > 0 && (
            <section className="sheet-card p-5 space-y-2">
              <div className="flex items-center gap-2">
                <Coins size={16} aria-hidden className="text-ink-soft" />
                <h2 className="text-sm font-bold text-ink m-0">رسائل المساعد</h2>
              </div>
              <p className="text-xs text-ink-soft m-0">
                استخدمت <span className="ltr-num font-bold text-ink">{messages.used}</span> من{" "}
                <span className="ltr-num font-bold text-ink">{messages.limit}</span> رسالة في آخر ٢٤ ساعة.
              </p>
              <div className="h-2 rounded-full bg-paper-3 overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-500"
                  style={{
                    width: `${Math.min(100, Math.round((messages.used / Math.max(1, messages.limit)) * 100))}%`,
                  }}
                />
              </div>
            </section>
          )}

          {quota.services && quota.services.length > 0 && (
            <section className="sheet-card p-5 space-y-4">
              <h2 className="text-sm font-bold text-ink m-0">استهلاك الخدمات</h2>
              <ul className="space-y-3 list-none m-0 p-0">
                {quota.services.map((service) => {
                  const pct = service.limit > 0 ? Math.min(100, Math.round((service.used / service.limit) * 100)) : 0;
                  return (
                    <li key={service.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-ink">{service.label}</span>
                        <span className="ltr-num text-ink-soft" dir="ltr">
                          {service.used} / {service.limit}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-paper-3 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </PageShell>
  );
}
