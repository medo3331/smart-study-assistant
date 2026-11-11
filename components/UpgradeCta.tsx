"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { useCreditStatus } from "@/lib/upsell/use-credit-status";
import { normalizeTier } from "@/lib/upsell/credit-status";
import { cn } from "@/lib/cn";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/* ==========================================================================
   زر «ترقية» — دعوة للترقية للباقة الأعلى

   📌 مكانه: آخر الشريط العلوي (أقصى الشمال في العربي). اللون `--marker`
      لأنه لون الإجراء الأساسي في نظام التصميم — الزر ده **إجراء** مش
      تنقّل.

   ⚠️ مين يشوفه؟
      - مستخدم **مجاني** → يشوفه (ده هدفه).
      - مستخدم **pro / ultra** → مايشوفش (هو مشترك أصلاً).
      - **زائر** (من غير جلسة) → يشوفه. الـ endpoint بيرجّع 401 للزائر،
        فمحدش يعرف باقته — والزائر مش مشترك بأي باقة، فينفع يتعرض عليه.

   💡 ليه `useCreditStatus` مش استعلام تاني؟
      ده نفس الـ hook اللي بيستخدمه `LowCreditsBanner` و`ExhaustedGuard` —
      نفس مصدر الحقيقة (جدول `entitlements`)، ومن غير طلب شبكة زيادة.

   ⚠️ ليه `null` أثناء التحميل؟
      لو رندرنا الزر قبل ما نعرف الباقة، المستخدم المدفوع هيشوفه ويختفي
      — وميتحصلش flash.

   ⚠️ ليه المساحة محجوزة (`w-[4.5rem]`)؟
      الـ navbar بيوزّع المسافات بـ `justify-between`، فلو الزر ظهر بعد
      تحميل البيانات، كل المجموعات هتتزحلق 39px-y (= shift مرئي).
      الحجز بيبقّي الشريط **ثابت** مهما كانت باقة المستخدم: الزر بيظهر
      في مكانه، أو المساحة بتفضل فاضية عند حد مدفوع (والفراغ ده على
      حافة الحاوية، فبيندمج مع هامش الصفحة).
   ========================================================================== */

/** عرض الزر المحجوز — بيساوي عرض "ترقية ↗" + الحشو. */
const CTA_SLOT = "w-[4.5rem]";

export function UpgradeCta({ className }: { className?: string }) {
  const { locale } = useLanguage();
  const isAr = locale === "ar";
  const { status, loading } = useCreditStatus();

  // بنستنى لحد ما الباقة تتحدد.
  if (loading) return null;

  // باقة مدفوعة → الزر مش لازم (هو مشترك أصلاً).
  if (status && normalizeTier(status.tier) !== "free") return null;

  return (
    <Link
      href="/pricing"
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--r-sm)] bg-marker px-3 py-2 text-sm font-bold text-onmarker transition-opacity hover:opacity-90",
        className,
      )}
    >
      <span>{isAr ? "ترقية" : "Upgrade"}</span>
      <ArrowUpRight aria-hidden size={14} strokeWidth={2.5} />
    </Link>
  );
}

/**
 * الخانة اللي الزر بيعيش فيها — **دايماً موجودة** بنفس العرض.
 *
 * ⚠️ لازم تستخدمها في الـ navbar (مش الزر نفسه): هي اللي بتحجز
 *    المساحة وتمنع الـ layout shift.
 */
export function UpgradeCtaSlot({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 justify-start", CTA_SLOT, className)}>
      <UpgradeCta />
    </span>
  );
}
