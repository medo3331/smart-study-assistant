"use client";

import { useEffect } from "react";

/**
 * Error boundary لصفحة الإعدادات (Phase B1.6b).
 *
 * ⚠️ السبب: خطأ عرض واحد (مثل تمرير كائن غير متوقع إلى JSX) كان يُسقط
 * الصفحة بالكامل ويترك المستخدم أمام شاشة مكسورة. الآن يظهر خطأ مفهوم
 * مع زر إعادة محاولة، والبيانات في القاعدة لا تتأثر.
 */
export default function AdminSettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // لوج للتشخيص فقط — لا تُعرض الرسالة الخام للمستخدم.
    console.error("[admin/settings] render error:", error.message, error.digest ?? "");
  }, [error]);

  return (
    <div dir="rtl" className="space-y-4 p-6">
      <div
        role="alert"
        className="mx-auto max-w-lg rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-center"
      >
        <h1 className="mb-2 text-lg font-extrabold text-rose-200">تعذّر عرض صفحة الإعدادات</h1>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          حدث خطأ أثناء العرض. البيانات في قاعدة البيانات لم تتأثر، وأي حفظ فاشل لم يُطبَّق.
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-rose-500/20 px-5 py-2.5 text-sm font-bold text-rose-200 transition hover:bg-rose-500/30"
        >
          إعادة المحاولة
        </button>
        {error.digest ? (
          <p className="mt-3 font-mono text-[10px] text-slate-500" dir="ltr">
            digest: {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  );
}
