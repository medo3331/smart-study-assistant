import { redirect } from "next/navigation";
import { Gift, ShoppingBag } from "lucide-react";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import { getEconomyOverview } from "@/lib/admin/economy-overview";
import { getMostActiveUsers } from "@/app/admin/actions/rewards-activity";
import { getRewardsHistory } from "@/app/admin/actions/rewards-winners";
import { AdminCard, AdminNotice, AdminPageHeader, AdminStatCard, AdminTableWrap } from "@/components/admin/ui";

/**
 * 🎁 المكافآت — اتنقلت من الصفحة الموحّدة (المرحلة 1).
 *
 * RBAC: الصفحة محتاجة rewards.manage = Owner فقط. إصدار المكافأة بيمر على
 * issueReward الموجودة اللي بتتحقق من الدور تاني وتسجّل rewards.manage
 * (مستقل عن subscriptions.manage حتى مع إعادة استخدام subscription_activations).
 */
export default async function AdminRewardsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const { user, isOwner } = await requireAdminPermission("rewards.manage");

  const [economy, winners, mostActive] = await Promise.all([
    getEconomyOverview(),
    getRewardsHistory(10),
    getMostActiveUsers(10),
  ]);

  const e = economy.data;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="المكافآت والاقتصاد"
        subtitle="إحصاءات العملات الحقيقية + سجل الفائزين + إصدار مكافأة (Owner فقط)."
        badge="rewards.manage = Owner"
        permissionKey="rewards.manage"
      />

      {sp.success ? <AdminNotice tone="emerald">تم: {sp.success}</AdminNotice> : null}
      {sp.error ? <AdminNotice tone="rose">خطأ: {sp.error}</AdminNotice> : null}

      <AdminCard title="Economy — Coins" description="المصدر: coin_ledger + coin_wallets عبر DATABASE_URL." tone="emerald">
        {economy.error ? (
          <AdminNotice tone="rose">{economy.error} — <strong>غير قابل للتحقق من هنا</strong></AdminNotice>
        ) : e ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <AdminStatCard label="إجمالي منح Coins" value={e.totalEarns} hint="source_type=earn" />
            <AdminStatCard label="منح 24h" value={e.earns24h} />
            <AdminStatCard label="المحافظ" value={e.wallets} hint="coin_wallets" />
            <AdminStatCard label="المشتريات 24h" value={e.purchases24h} hint="purchase/store_purchase" />
            <AdminStatCard label="إجمالي مُصدر" value={`${e.totalCoinsIssued} 🪙`} />
            <AdminStatCard label="إجمالي مُنفَق" value={`${e.totalCoinsSpent} 🪙`} />
            <AdminStatCard label="daily_login 24h" value={e.dailyLogin24h} />
            <AdminStatCard label="مذاكرة (day_done 24h)" value={e.dayDone24h} hint={`streak ${e.streak24h}`} />
            <AdminStatCard label="عجلة الحظ (24h / إجمالي)" value={`${e.wheel24h} / ${e.wheelTotal}`} hint={`${e.wheelCoins} 🪙`} />
          </div>
        ) : (
          <AdminNotice tone="rose">لا توجد بيانات — غير قابل للتحقق من هنا.</AdminNotice>
        )}
      </AdminCard>

      <AdminCard
        title="المكافآت الأسبوعية — سجل الفائزين والأكثر نشاطًا"
        description="معيار النشاط من بيانات موجودة فقط: ai_credit_ledger + coin_ledger. العمليات تُسجَّل بـ rewards.manage ومورد reward."
        tone="amber"
      >
        <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2"><Gift size={16} /> سجل الفائزين (rewards_issued)</h3>
        {winners.length === 0 ? (
          <AdminNotice>لا توجد مكافآت مسجّلة بعد (أو الجدول مش منطبق/محمي بـRLS) — غير قابل للتحقق من هنا.</AdminNotice>
        ) : (
          <AdminTableWrap>
            <thead>
              <tr className="bg-slate-950/60 text-amber-300">
                <th className="text-right px-3 py-2">المتلقي</th>
                <th className="text-right px-3 py-2">نوع المكافأة</th>
                <th className="text-right px-3 py-2">القيمة</th>
                <th className="text-right px-3 py-2">المدة</th>
                <th className="text-right px-3 py-2">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {winners.map((w) => (
                <tr key={w.id} className="border-t border-slate-800">
                  <td className="px-3 py-2 text-slate-300">{w.recipient_display_name || w.recipient_email || `${w.recipient_user_id.slice(0, 8)}…`}</td>
                  <td className="px-3 py-2 text-amber-300 font-mono">{w.reward_type}</td>
                  <td className="px-3 py-2">{w.reward_value}</td>
                  <td className="px-3 py-2">{w.duration_days ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-400">{new Date(w.created_at).toLocaleDateString("ar-EG")}</td>
                </tr>
              ))}
            </tbody>
          </AdminTableWrap>
        )}

        <h3 className="text-sm font-bold text-emerald-300 pt-2 flex items-center gap-2"><ShoppingBag size={16} /> الأكثر نشاطًا (أعلى 10)</h3>
        {mostActive.length === 0 ? (
          <AdminNotice>لا توجد بيانات نشاط متاحة — غير قابل للتحقق من هنا.</AdminNotice>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {mostActive.slice(0, 6).map((a) => (
              <div key={a.user_id} className="bg-slate-950/40 rounded-xl p-3 border border-slate-800 text-[11px] space-y-1">
                <p className="font-bold text-slate-200">{a.display_name || a.email || `${a.user_id.slice(0, 8)}…`}</p>
                <p className="text-emerald-300">AI Credits (24h): <span className="font-mono text-white">{a.ai_credits_24h}</span></p>
                <p className="text-amber-300">Coins Earns (24h): <span className="font-mono text-white">{a.coin_earns_24h}</span></p>
                <p className="text-slate-500">Score: {a.total_activity_score}</p>
              </div>
            ))}
          </div>
        )}
      </AdminCard>

      {isOwner ? (
        <AdminCard
          title="إصدار مكافأة جديدة (Owner)"
          description="يُسجَّل في rewards_issued + audit_log (rewards.manage). لـ trial_week/pro_week يُعاد استخدام subscription_activations مع تمييز واضح في الـAudit."
          tone="amber"
        >
          <form
            action={async (formData: FormData) => {
              "use server";
              const { issueReward } = await import("@/app/admin/actions/rewards-issue");
              const rewardTypeRaw = ((formData.get("rewardType") as string) || "limit_boost") as
                | "limit_boost"
                | "trial_week"
                | "pro_week"
                | "upload_credits";
              const durationRaw = (formData.get("durationDays") as string) || "";
              const result = await issueReward(
                {
                  recipientUserId: (formData.get("recipientUserId") as string) || "",
                  rewardType: rewardTypeRaw,
                  rewardValue: parseInt((formData.get("rewardValue") as string) || "0", 10) || 0,
                  durationDays: durationRaw ? parseInt(durationRaw, 10) : undefined,
                  note: (formData.get("note") as string) || "",
                },
                user.id,
                user.email ?? null
              );
              if (result.ok) redirect("/admin/rewards?success=" + encodeURIComponent(result.message || "تم إصدار المكافأة"));
              redirect("/admin/rewards?error=" + encodeURIComponent(result.message || "فشل إصدار المكافأة"));
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <input name="recipientUserId" type="text" placeholder="User UUID" className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs font-mono" required />
              <select name="rewardType" className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs">
                <option value="limit_boost">زيادة Limit مؤقت (+50)</option>
                <option value="trial_week">تجربة مجانية أسبوع</option>
                <option value="pro_week">Pro أسبوع</option>
                <option value="upload_credits">Credits رفع/تفريغ (+10)</option>
              </select>
              <input name="rewardValue" type="number" placeholder="القيمة" min="1" defaultValue={50} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs" />
              <input name="durationDays" type="number" placeholder="المدة (أيام)" min="1" defaultValue={7} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs" />
            </div>
            <input name="note" type="text" placeholder="ملاحظة (اختياري)" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs" />
            <button type="submit" className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg px-5 py-2 text-sm">
              إصدار المكافأة
            </button>
          </form>
        </AdminCard>
      ) : (
        <AdminNotice tone="rose" title="غير مصرّح">
          إصدار المكافآت متاح لـ <strong>Owner</strong> فقط. الفورم مش بيظهر لك، ولو ناديت الـaction بره الواجهة هيرجّع رفض ويسجّل BLOCKED في الـaudit.
        </AdminNotice>
      )}
    </div>
  );
}
