import { requireAdminPermission } from "@/lib/admin/auth-check";
import {
  AdminCard,
  AdminNotice,
  AdminPageHeader,
  AdminStatCard,
  AdminTableWrap,
} from "@/components/admin/ui";
import { getExpiringSoon, getGrantsOverview, listGrants, type Grant, type GrantsOverview } from "@/lib/admin/grants";
import GrantForm from "./GrantForm";
import GrantsTable from "./GrantsTable";

/**
 * /admin/grants — منح الكريدت (Phase B2.4)
 *
 * ⚠️ البوابة `credits.manage` = Owner فقط. كل القراءات بـ service_role
 * (الجدول RLS مفروض بلا سياسات كتابة)، والكتابة عبر `grant_credits` فقط.
 */
export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default async function AdminGrantsPage() {
  await requireAdminPermission("credits.manage");

  let overview: GrantsOverview | null = null;
  let grants: Grant[] = [];
  let expiring: Grant[] = [];
  let errorMessage: string | null = null;

  try {
    overview = await getGrantsOverview();
    grants = await listGrants({ limit: 500 });
    expiring = await getExpiringSoon(7, 20);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="منح الكريدت"
        subtitle="رصيد الكريدت كالتزامات لها تاريخ انتهاء: عرض، منح يدوي، وما ينتهي قريبًا."
        badge="credits.manage = Owner"
        permissionKey="credits.manage"
      />

      {errorMessage ? (
        <AdminNotice tone="rose">
          تعذّر قراءة <code>credit_grants</code>: {errorMessage}
        </AdminNotice>
      ) : null}

      {overview && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <AdminStatCard label="إجمالي الممنوح" value={overview.total_granted} hint="sum(amount)" tone="blue" />
          <AdminStatCard label="مستهلك" value={overview.total_consumed} hint="sum(consumed)" tone="amber" />
          <AdminStatCard label="المتبقي (التزام قائم)" value={overview.total_remaining} hint="sum(remaining)" tone="emerald" />
          <AdminStatCard label="منح نشطة" value={overview.active_grants} hint={`من ${overview.total_grants} إجمالًا`} tone="default" />
          <AdminStatCard
            label="تنتهي خلال 7 أيام"
            value={overview.expiring_soon}
            hint={`منتهية: ${overview.expired_grants} · مستنفدة: ${overview.exhausted_grants}`}
            tone={overview.expiring_soon > 0 ? "rose" : "default"}
          />
        </div>
      )}

      <AdminCard
        title="تنتهي خلال 7 أيام"
        description="المنح النشطة التي يقترب انتهاؤها — الأولوية للتواصل مع هؤلاء المستخدمين."
        tone={expiring.length > 0 ? "amber" : "default"}
      >
        {expiring.length === 0 ? (
          <AdminNotice tone="default">لا توجد منح تنتهي خلال 7 أيام.</AdminNotice>
        ) : (
          <AdminTableWrap>
            <thead>
              <tr className="bg-slate-950/60 text-amber-300">
                <th className="px-3 py-2 text-right">المستخدم</th>
                <th className="px-3 py-2 text-right">المتبقي</th>
                <th className="px-3 py-2 text-right">ينتهي</th>
                <th className="px-3 py-2 text-right">المصدر</th>
              </tr>
            </thead>
            <tbody>
              {expiring.map((grant) => (
                <tr key={grant.id} className="border-t border-slate-700">
                  <td className="px-3 py-2">
                    {grant.user_name || grant.user_email || (
                      <span className="font-mono text-[10px]" dir="ltr">{grant.user_id.slice(0, 8)}…</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono" dir="ltr">{grant.remaining}</td>
                  <td className="px-3 py-2">{formatDate(grant.expires_at)}</td>
                  <td className="px-3 py-2 font-mono" dir="ltr">{grant.source}</td>
                </tr>
              ))}
            </tbody>
          </AdminTableWrap>
        )}
      </AdminCard>

      <AdminCard
        title="منح كريدت يدوي"
        description="يُنشئ منحة جديدة بانتهاء صلاحية ويُسجّل +amount في ai_credit_ledger. كل محاولة تُسجَّل في admin_audit_log."
        tone="emerald"
      >
        <GrantForm />
      </AdminCard>

      <AdminCard
        title="كل المنح"
        description="آخر 500 منحة. الفلاتر والترقيم محليان في المتصفح."
        tone="default"
      >
        <GrantsTable grants={grants} />
      </AdminCard>
    </div>
  );
}
