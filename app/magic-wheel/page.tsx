'use client';

/* ===========================================================================
   صفحة "عجلة ماجيك" — مسار مستقل (/magic-wheel) لمعاينة التصميم الجديد
   بدون أي تأثير على الداشبورد الحالي. الخلفية والنصوص من توكينز الثيم،
   فزرار الثيمات الأربعة اللي جوه العجلة بيغيّر الصفحة كلها مباشرة.

   جدول الربط تحت العجلة هو «ملاحظات العمل» — متعمّد إنه يظهر هنا بس
   (مش جوه /dashboard) عشان يسهّل مراجعتك للمسارات.
   =========================================================================== */

import MagicWheelDashboard, { WHEEL_BRANCHES } from '@/components/MagicWheelDashboard';

export default function MagicWheelPage() {
  return (
    <main dir="rtl" className="min-h-screen bg-[var(--app-bg)] text-[var(--text)]">
      <MagicWheelDashboard />

      <section className="mx-auto w-full max-w-3xl px-4 pb-12" aria-label="مراجعة الربط">
        <details className="rounded-2xl border border-[var(--rule)] bg-[var(--card-primary)] px-5 py-4">
          <summary className="cursor-pointer text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-md">
            📋 جدول الربط الفعلي لكل فرع (للمراجعة)
          </summary>
          <ul className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
            {WHEEL_BRANCHES.map((b) => (
              <li key={b.id} className="flex flex-wrap items-baseline gap-2">
                <span className="font-bold">{b.label}</span>
                <code className="font-mono text-[0.68rem] text-[var(--accent)]" dir="ltr">
                  {b.href ?? 'action — drawer'}
                </code>
                <span className="text-[var(--muted)]">— {b.note}</span>
              </li>
            ))}
          </ul>
        </details>
      </section>
    </main>
  );
}

/* تصدير المسارات للمرجع (للتأكد من الربط) */
export { WHEEL_BRANCHES };
