import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import { hasPermission } from "@/lib/auth-roles";
import { ADMIN_HOME_PERMISSION, ADMIN_NAV, getAllowedNavItems } from "@/lib/admin/nav";
import { getPlatformOverview } from "@/lib/admin/overview";
import { isPgConfigured } from "@/lib/admin/pg";
import { AdminCard, AdminNotice, AdminPageHeader, AdminStatCard, AdminTableWrap } from "@/components/admin/ui";

/**
 * 🏠 الصفحة الرئيسية للوحة الأدمن (المرحلة 1 — تفكيك الصفحة الموحّدة).
 *
 * محتواها مقصود إنه: (١) إحصائيات عامة، (٢) التنقل السريع.
 * كل الأقسام التفصيلية انتقلت لصفحات مستقلة تحت /admin/*:
 * users, subscriptions, plans, models, rewards, audit-log, files, settings.
 *
 * ⚠️ أي رقم مش جاي من استعلام حقيقي بيظهر "N/A — يحتاج ..." ومش رقم وهمي.
 */
export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const { user, role, isOwner, permissions, supabase } = await requireAdminPermission(ADMIN_HOME_PERMISSION);

  const [{ count: lessonsCount }, overview] = await Promise.all([
    supabase.from("study_days").select("*", { count: "exact", head: true }),
    getPlatformOverview(),
  ]);

  const allowedItems = await getAllowedNavItems({
    isOwner,
    permissions,
    check: (key) => hasPermission(supabase, user.id, user.email ?? null, key),
  });

  const pgReady = isPgConfigured();
  const ov = overview.data;

  return (
    <div className="space-y-6 sm:space-y-8">
      <AdminPageHeader
        title="مركز الإدارة الشامل"
        subtitle={`المتحكم الحالي: ${isOwner ? "المالك الرئيسي (Owner)" : role === "admin" ? "أدمن (Admin)" : role}`}
        badge="لوحة الأدمن"
        permissionKey={ADMIN_HOME_PERMISSION}
      />

      {sp.success ? <AdminNotice tone="emerald">تم: {sp.success}</AdminNotice> : null}
      {sp.error ? <AdminNotice tone="rose">خطأ: {sp.error}</AdminNotice> : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <AdminStatCard
          label="إجمالي المستخدمين"
          value={pgReady ? (ov?.totalUsers ?? 0) : "N/A"}
          hint={pgReady ? "المصدر: public.profiles عبر DATABASE_URL" : "N/A — يحتاج DATABASE_URL"}
          tone="blue"
        />
        <AdminStatCard
          label="الدروس المتاحة"
          value={lessonsCount ?? 0}
          hint="المصدر: study_days (عدّاد Supabase بجلسة المستخدم — قد يكون مقيّدًا بـRLS)"
          tone="purple"
        />
        <AdminStatCard
          label="مشتركي Premium"
          value={pgReady ? (ov?.premium ?? 0) : "N/A"}
          hint={pgReady ? "entitlements(kind='plan', value='premium') غير منتهية" : "N/A — يحتاج DATABASE_URL"}
          tone="amber"
        />
        <AdminStatCard
          label="منهم تجربة مجانية"
          value={pgReady ? (ov?.trials ?? 0) : "N/A"}
          hint={pgReady ? "metadata->>'source' = premium_trial_0_5" : "N/A — يحتاج DATABASE_URL"}
          tone="emerald"
        />
      </div>

      <AdminCard
        title="التنقل السريع"
        description="روابط حقيقية لصفحات الأدمن الفعلية. أي عنصر مش ظاهر هنا ممنوع عليك بالرابط المباشر كمان (فحص على السيرفر)."
        tone="amber"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {allowedItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex flex-col gap-1 p-4 rounded-xl border border-slate-700 bg-slate-800/60 hover:bg-slate-800 hover:border-amber-500/40 transition"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-100">{item.label}</span>
                <ArrowLeft size={14} className="text-slate-500 group-hover:text-amber-400 transition" />
              </span>
              <span className="text-[11px] text-slate-400 leading-relaxed">{item.description}</span>
              <span className="text-[10px] text-slate-500 font-mono" dir="ltr">
                {item.permission}
                {item.skeletonOnly ? " · skeleton" : ""}
              </span>
            </Link>
          ))}
        </div>
        {allowedItems.length < ADMIN_NAV.length ? (
          <AdminNotice tone="default">
            فيه {ADMIN_NAV.length - allowedItems.length} صفحة مش ظاهرة هنا لأن صلاحيات دورك ما تسمحش بها — وهي كمان بترفض الوصول المباشر من السيرفر.
          </AdminNotice>
        ) : null}
      </AdminCard>

      <AdminCard
        title="نظرة عامة على المنصة — إحصائيات حقيقية (المرحلة 4.3)"
        description="كل رقم من استعلام DB فعلي. مشتركو الخطط من subscription_activations (غير ملغاة)؛ الملفات من files.created_at؛ رسائل اليوم من ai_credit_ledger (reason='ai_reserve') ثم ai_operations كبديل. رقم غير متاح → N/A بسبب المذكور."
        tone="purple"
      >
        {overview.error ? (
          <AdminNotice tone="rose">
            {overview.error} — تأكد من <code>DATABASE_URL</code> أو من تطبيق <code>db/economy-phase-d.sql</code>.
          </AdminNotice>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <AdminStatCard label="مشترك Premium" value={ov?.premium ?? 0} tone="purple" />
              <AdminStatCard label="منهم تجربة مجانية" value={ov?.trials ?? 0} tone="emerald" />
              <AdminStatCard
                label="نسبة الاشتراك"
                value={ov && ov.totalUsers ? `${((ov.premium / ov.totalUsers) * 100).toFixed(1)}%` : "N/A"}
                hint={ov?.totalUsers ? undefined : "N/A — يحتاج إجمالي المستخدمين"}
              />
            </div>

            <h3 className="text-sm font-bold text-slate-300 pt-2">مشتركو الخطط (Pro/Ultra) — من subscription_activations</h3>
            {(ov?.activationsByPlan.length ?? 0) === 0 ? (
              <AdminNotice>لا توجد اشتراكات مفعّلة غير ملغاة في <code>subscription_activations</code> بعد — الرقم 0 حقيقي مش N/A.</AdminNotice>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {ov!.activationsByPlan.map((a) => (
                  <AdminStatCard
                    key={a.plan_key}
                    label={`مشتركو ${a.plan_key}`}
                    value={a.users}
                    hint="المصدر: subscription_activations (revoked_at IS NULL)"
                    tone="amber"
                  />
                ))}
                <AdminStatCard
                  label="أكثر خطة استخدامًا"
                  value={ov?.topPlan ? `${ov.topPlan.plan_key} (${ov.topPlan.users})` : "N/A"}
                  hint={ov?.topPlan ? "أعلى distinct user_id بين الخطط النشطة" : "N/A — لا اشتراكات نشطة"}
                  tone="blue"
                />
              </div>
            )}

            <h3 className="text-sm font-bold text-slate-300 pt-2">النشاط اليومي والأسبوعي</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <AdminStatCard
                label="ملفات اليوم"
                value={ov?.filesToday ?? "N/A"}
                hint={ov?.filesToday !== null && ov?.filesToday !== undefined ? "المصدر: files.created_at (آخر 24 ساعة)" : "N/A — يحتاج DATABASE_URL"}
                tone="blue"
              />
              <AdminStatCard
                label="ملفات آخر 7 أيام"
                value={ov?.filesWeek ?? "N/A"}
                hint={ov?.filesWeek !== null && ov?.filesWeek !== undefined ? "المصدر: files.created_at (آخر 7 أيام)" : "N/A — يحتاج DATABASE_URL"}
                tone="purple"
              />
              <AdminStatCard
                label="رسائل اليوم"
                value={ov?.messagesToday ?? "N/A"}
                hint={
                  ov?.messagesTodaySource === "ai_credit_ledger"
                    ? "المصدر: ai_credit_ledger (reason='ai_reserve', آخر 24 ساعة)"
                    : ov?.messagesTodaySource === "ai_operations"
                      ? "المصدر البديل: ai_operations (آخر 24 ساعة)"
                      : "N/A — يحتاج DATABASE_URL"
                }
                tone="emerald"
              />
            </div>

            <h3 className="text-sm font-bold text-slate-300 pt-2">أحدث المستخدمين تسجيلًا</h3>
            {(ov?.recent.length ?? 0) === 0 ? (
              <AdminNotice>لا توجد تسجيلات بعد، أو غير قابلة للقراءة من هنا.</AdminNotice>
            ) : (
              <AdminTableWrap>
                <thead>
                  <tr className="bg-slate-950/60 text-slate-400 text-[11px]">
                    <th className="p-3 font-semibold text-right">الاسم</th>
                    <th className="p-3 font-semibold text-right">البريد الإلكتروني</th>
                    <th className="p-3 font-semibold text-right">التسجيل</th>
                    <th className="p-3 font-semibold text-right">الباقة</th>
                  </tr>
                </thead>
                <tbody>
                  {ov!.recent.map((u) => (
                    <tr key={u.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                      <td className="p-3 font-semibold text-slate-200">{u.display_name?.trim() || `مستخدم #${u.id.slice(0, 6)}`}</td>
                      <td className="p-3 text-slate-400" dir="ltr">{u.email || "—"}</td>
                      <td className="p-3 text-slate-500 text-[11px]">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString("ar-EG") : "غير متاح"}
                      </td>
                      <td className="p-3">
                        <span
                          className={
                            "px-2 py-1 rounded-lg text-[11px] font-bold " +
                            (u.is_premium
                              ? u.on_trial
                                ? "bg-emerald-500/10 text-emerald-300"
                                : "bg-purple-500/10 text-purple-300"
                              : "bg-slate-800 text-slate-400")
                          }
                        >
                          {u.is_premium ? (u.on_trial ? "Premium (تجربة)" : "Premium") : "مجاني"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </AdminTableWrap>
            )}
          </>
        )}
      </AdminCard>

      <AdminNotice tone="default" title="ملاحظات على الصفحة الرئيسية">
        <ul className="list-disc pr-5 space-y-1">
          <li>كل الأرقام هنا من استعلامات فعلية (Supabase أو Postgres عبر <code>DATABASE_URL</code>) — ولو المصدر مش متاح بتظهر <strong>N/A</strong> صراحة.</li>
          <li>الأقسام التفصيلية (المستخدمين/الاشتراكات/الخطط/النماذج/المكافآت/السجل/الملفات/الإعدادات) بقت صفحات مستقلة من قائمة التنقل.</li>
          <li><ShieldCheck size={12} className="inline" /> فرض الصلاحيات server-side لكل صفحة — إخفاء الرابط مش الحماية الوحيدة.</li>
        </ul>
      </AdminNotice>
    </div>
  );
}
