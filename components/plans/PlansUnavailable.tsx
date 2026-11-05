"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * حالة خطأ موحّدة لصفحات الباقات.
 *
 * ⚠️ السبب: كان في `app/plans` و`app/checkout` **fallback** بقيم باقات مكتوبة
 * في الكود. لو فشل استعلام `subscription_plans` كان المستخدم يشوف أسعارًا
 * وحدودًا قديمة — أي بيانات كاذبة تُقرأ كأنها حقيقية. الآن: القاعدة هي
 * المصدر الوحيد، وفشلها يُعرض كخطأ صريح قابل لإعادة المحاولة.
 */
export default function PlansUnavailable({
  title = "تعذّر تحميل الخطط",
  message = "حدث خطأ في تحميل الخطط. جرّب تاني.",
}: {
  title?: string;
  message?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <main
      dir="rtl"
      className="min-h-[60vh] flex items-center justify-center px-4 py-16 bg-[#0D1029] text-[#E7E9F5]"
    >
      <div
        role="alert"
        className="w-full max-w-md rounded-2xl border border-[#2A3050] bg-[#13182E] p-6 text-center"
      >
        <h1 className="text-xl font-extrabold text-[#F0E6D2] mb-2">{title}</h1>
        <p className="text-sm text-[#9AA0C0] mb-6 leading-relaxed">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => startTransition(() => router.refresh())}
            disabled={isPending}
            className="rounded-xl bg-[#7C5CFF]/20 px-5 py-2.5 text-sm font-bold text-[#B69CFF] hover:bg-[#7C5CFF]/30 disabled:opacity-60 transition"
          >
            {isPending ? "جارٍ المحاولة…" : "إعادة المحاولة"}
          </button>
          <Link
            href="/dashboard"
            className="rounded-xl border border-[#2A3050] px-5 py-2.5 text-sm font-bold text-[#9AA0C0] hover:text-white transition"
          >
            رجوع
          </Link>
        </div>
      </div>
    </main>
  );
}
