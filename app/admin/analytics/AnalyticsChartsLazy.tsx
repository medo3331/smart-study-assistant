"use client";

/**
 * AnalyticsChartsLazy — غلاف Client بسيط حوالين AnalyticsCharts.
 *
 * ⚡ الأداء: `app/admin/analytics/page.tsx` مكوّن سيرفر، و`next/dynamic`
 * بـ `ssr: false` مش مسموح جوه مكوّن سيرفر. الغلاف ده بيسمح بتأجيل
 * recharts (~360KB غير مضغوط مع d3) لحد ما الصفحة تظهر على العميل بدل
 * ما تتحمّل مع أول بايت.
 */

import dynamic from "next/dynamic";

const AnalyticsCharts = dynamic(() => import("./AnalyticsCharts"), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-hidden>
      <div className="h-72 animate-pulse rounded border bg-gray-100 dark:bg-gray-800" />
      <div className="h-72 animate-pulse rounded border bg-gray-100 dark:bg-gray-800" />
    </div>
  ),
});

export default AnalyticsCharts;
