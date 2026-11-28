import { requireAdminPermission } from "@/lib/admin/auth-check";
import { getEconomyBalancing } from "@/lib/admin/economy-balancing";
import { isPgConfigured } from "@/lib/admin/pg";
import { AdminCard, AdminNotice, AdminPageHeader, AdminStatCard } from "@/components/admin/ui";
import { EconomyBalancingClient } from "./EconomyBalancingClient";

/**
 * 🎛️ Economy Balancing (D-M-06) — تعديل المكافآت والأسعار من الجداول
 * بدون كود، مع Audit Log على كل تغيير. Owner فقط (rewards.manage).
 */
export default async function AdminEconomyPage() {
  await requireAdminPermission("rewards.manage");

  if (!isPgConfigured()) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Economy Balancing" subtitle="تعديل اقتصاد العملات من الجداول" badge="rewards.manage = Owner" permissionKey="rewards.manage" />
        <AdminNotice tone="rose">DATABASE_URL غير متاح — غير قابل للتحقق من هنا.</AdminNotice>
      </div>
    );
  }

  const { data, error } = await getEconomyBalancing();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Economy Balancing"
        subtitle="تعديل المكافآت والأسعار ومحوّل العملات من الجداول — بدون نشر، وكل تغيير بيتسجّل في Audit Log (D-M-06)."
        badge="rewards.manage = Owner"
        permissionKey="rewards.manage"
      />

      {error ? <AdminNotice tone="rose">خطأ قراءة: {error}</AdminNotice> : null}
      {!data ? (
        <AdminNotice tone="rose">لا توجد بيانات.</AdminNotice>
      ) : (
        <>
          <AdminCard title="نظرة عامة على الإصدار" description="من أين بتيجي الكوينز؟ (ضد التضخم — التصميم §10)" tone="emerald">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {data.byClass.map((c) => (
                <AdminStatCard key={c.source_class} label={`إصدار (${c.source_class})`} value={`${c.total} 🪙`} />
              ))}
              <AdminStatCard label="متوسط رصيد الطالب" value={`${data.avgBalance} 🪙`} />
              <AdminStatCard label="يكسبون" value={data.earnUsers} hint="عندهم حركة earn" />
              <AdminStatCard label="ينفقون" value={data.spendUsers} hint="عندهم حركة spend" />
            </div>
            {data.topBalances.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-bold text-amber-300 mb-2">أعلى الأرصدة (مراقبة أرصدة غير طبيعية)</p>
                <div className="space-y-1">
                  {data.topBalances.map((t) => (
                    <div key={t.user_id} className="flex justify-between text-[11px] text-slate-300 font-mono">
                      <span dir="ltr">{t.user_id.slice(0, 8)}…</span>
                      <span className="text-amber-300">{t.balance} 🪙</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </AdminCard>

          <EconomyBalancingClient
            rules={data.rules}
            exchange={data.exchange}
            coinPacks={data.coinPacks}
            creditPacks={data.creditPacks}
          />
        </>
      )}
    </div>
  );
}
