"use client";

import { useState, useCallback } from "react";
import { claimPremiumTrial } from "@/app/plans/actions-trial";

export default function PremiumTrialCard() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
    code: string;
    balance?: number;
    spent?: number;
    expiresAt?: string | null;
  } | null>(null);

  const handleClaim = useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await claimPremiumTrial();
      setResult(res);
      // Refresh user state will be handled by parent / revalidate / next refresh
      // Do NOT manually adjust coin balance here — server is source of truth
    } catch {
      setResult({ ok: false, message: "حدث خطأ، حاول مرة أخرى.", code: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  const isSuccess = result?.ok === true && result?.code === "success";
  const isAlready = result?.code === "already_claimed";
  const isInsufficient = result?.code === "insufficient_coins";
  const isUnauthorized = result?.code === "unauthorized";

  return (
    <section
      dir="rtl"
      className="rounded-3xl border border-[#7C5CFF]/30 bg-gradient-to-b from-[#1A1030] to-[#13182E] p-6 md:p-8 shadow-xl relative overflow-hidden"
      aria-label="تجربة Premium المجانية"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#B69CFF] to-[#F0E6D2] opacity-80" aria-hidden />

      <div className="flex items-start justify-between mb-3">
        <h2 className="text-2xl font-extrabold text-[#F0E6D2]">تجربة Premium — 7 أيام</h2>
        <span className="text-xs font-bold bg-[#B69CFF]/15 text-[#B69CFF] px-2.5 py-1 rounded-full whitespace-nowrap">500 Coins</span>
      </div>

      <p className="text-[#9AA0C0] text-sm mb-5 leading-relaxed">
        جرب كل مزايا Premium لمدة 7 أيام: حدود ذكاء اصطناعي أعلى (1000 طلب / فترة)، الوصول الكامل، وتجربة غير محدودة.
      </p>

      <ul className="space-y-2.5 mb-6 text-sm text-[#E7E9F5]">
        <li className="flex items-center gap-2.5">
          <span aria-hidden className="text-[#B69CFF] text-base shrink-0">✓</span>
          <span>7 أيام من المزايا الكاملة</span>
        </li>
        <li className="flex items-center gap-2.5">
          <span aria-hidden className="text-[#B69CFF] text-base shrink-0">✓</span>
          <span>تكلفة: <span className="font-bold text-[#F0E6D2]">500 Coins</span> فقط</span>
        </li>
        <li className="flex items-center gap-2.5">
          <span aria-hidden className="text-[#B69CFF] text-base shrink-0">✓</span>
          <span>مرة واحدة لكل حساب</span>
        </li>
        <li className="flex items-center gap-2.5">
          <span aria-hidden className="text-[#B69CFF] text-base shrink-0">✓</span>
          <span>تنتهي تلقائيًا بعد 7 أيام</span>
        </li>
      </ul>

      {/* Status message area */}
      {result && (
        <div
          role="status"
          aria-live="polite"
          className={`mb-5 rounded-xl px-4 py-3 text-sm font-semibold transition ${
            isSuccess
              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
              : isAlready
              ? "bg-amber-400/10 border border-amber-400/30 text-amber-300"
              : isInsufficient
              ? "bg-amber-400/10 border border-amber-400/30 text-amber-300"
              : isUnauthorized
              ? "bg-red-500/10 border border-red-500/30 text-red-300"
              : "bg-red-500/10 border border-red-500/30 text-red-300"
          }`}
        >
          <p className="mb-0">{result.message}</p>
          {isSuccess && result.expiresAt && (
            <p className="text-xs mt-1 opacity-80">
              ينتهي في: {new Date(result.expiresAt).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          )}
          {isSuccess && typeof result.balance === "number" && (
            <p className="text-xs mt-1 opacity-80">الرصيد المتبقي: {result.balance} Coins</p>
          )}
          {isInsufficient && typeof result.balance === "number" && (
            <p className="text-xs mt-1 opacity-80">رصيدك الحالي: {result.balance} Coins (تحتاج 500)</p>
          )}
        </div>
      )}

      <button
        onClick={handleClaim}
        disabled={loading || isAlready || isSuccess}
        aria-busy={loading}
        aria-disabled={loading || isAlready || isSuccess}
        className={`w-full rounded-xl font-extrabold py-3.5 transition text-sm md:text-base shadow-lg focus:outline-none focus:ring-2 focus:ring-[#B69CFF]/50 focus:ring-offset-2 focus:ring-offset-[#13182E] ${
          isSuccess || isAlready
            ? "bg-[#2A3050] text-[#9AA0C0] cursor-default"
            : loading
            ? "bg-[#B69CFF]/60 text-[#0D1029] cursor-wait"
            : "bg-gradient-to-r from-[#B69CFF] to-[#F0E6D2] text-[#0D1029] hover:brightness-110 active:scale-[0.995]"
        }`}
      >
        {loading
          ? "جاري التفعيل..."
          : isSuccess
          ? "تم التفعيل بنجاح"
          : isAlready
          ? "تم استخدام التجربة من قبل"
          : "استخدم 500 Coins — تجربة Premium 7 أيام"}
      </button>

      <p className="text-[11px] text-[#7A8298] mt-3 text-center">تتم العملية على الخادم فقط — لا يتم تعديل الرصيد من المتصفح.</p>
    </section>
  );
}
