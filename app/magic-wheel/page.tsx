'use client';

import MagicWheelDashboard, { WHEEL_BRANCHES } from '@/components/MagicWheelDashboard';

/* ===========================================================================
   صفحة "عجلة ماجيك" — مسار مستقل (/magic-wheel) لعرض التصميم الجديد
   يمكن ربطه من أي مكان دون التأثير على الصفحة الرئيسية الحالية.
   =========================================================================== */

export default function MagicWheelPage() {
  return (
    <main dir="rtl" className="min-h-screen bg-[#0a0a0c] text-[#f1f1f4]">
      <MagicWheelDashboard />
    </main>
  );
}

/* تصدير المسارات للمرجع (للتأكد من الربط) */
export { WHEEL_BRANCHES };
