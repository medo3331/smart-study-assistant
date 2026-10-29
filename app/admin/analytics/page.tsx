import Link from "next/link";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import { getPlatformOverview } from "@/lib/admin/overview";
import { isPgConfigured, pgQuery } from "@/lib/admin/pg";
import { AdminCard, AdminNotice, AdminPageHeader, AdminStatCard, AdminTableWrap } from "@/components/admin/ui";

export default async function AdminAnalyticsPage() {
  await requireAdminPermission("users.read");
  const overview = await getPlatformOverview();
  const ov = overview.data;
  const pgReady = isPgConfigured();

  let activeSubs = 0;
  let revokedSubs = 0;
  let inboxCount = 0;
  let emailSent = 0;
  let aiTotal = 0;
  let ai24h = 0;
  if (pgReady) {
    try {
      const [a, r, i, e, t, h] = await Promise.all([
        pgQuery<{ c: string }>(`SELECT count(*)::text c FROM public.subscription_activations WHERE revoked_at IS NULL`),
        pgQuery<{ c: string }>(`SELECT count(*)::text c FROM public.subscription_activations WHERE revoked_at IS NOT NULL`),
        pgQuery<{ c: string }>(`SELECT count(*)::text c FROM public.user_inbox`),
        pgQuery<{ c: string }>(`SELECT count(*)::text c FROM public.email_deliveries WHERE status='sent'`),
        pgQuery<{ c: string }>(`SELECT count(*)::text c FROM public.ai_credit_ledger WHERE reason='ai_reserve'`),
        pgQuery<{ c: string }>(`SELECT count(*)::text c FROM public.ai_credit_ledger WHERE reason='ai_reserve' AND created_at >= now() - interval '24 hours'`),
      ]);
      activeSubs = parseInt(a[0]?.c || "0", 10);
      revokedSubs = parseInt(r[0]?.c || "0", 10);
      inboxCount = parseInt(i[0]?.c || "0", 10);
      emailSent = parseInt(e[0]?.c || "0", 10);
      aiTotal = parseInt(t[0]?.c || "0", 10);
      ai24h = parseInt(h[0]?.c || "0", 10);
    } catch {}
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title="التحليلات والمراقبة" subtitle="نظرة شاملة على المنصة (بيانات حقيقية)" badge="analytics" permissionKey="users.read" />
      {!pgReady ? <AdminNotice tone="amber">DATABASE_URL غير متاح — الأرقام من Postgres ستظهر N/A.</AdminNotice> : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <AdminStatCard label="إجمالي المستخدمين" value={pgReady ? (ov?.totalUsers ?? 0) : "N/A"} hint="profiles" tone="blue" />
        <AdminStatCard label="مشتركو Premium" value={pgReady ? (ov?.premium ?? 0) : "N/A"} hint="entitlements" tone="purple" />
        <AdminStatCard label="اشتراكات فعالة" value={pgReady ? activeSubs : "N/A"} hint="subscription_activations (غير ملغاة)" tone="emerald" />
        <AdminStatCard label="اشتراكات ملغاة" value={pgReady ? revokedSubs : "N/A"} hint="subscription_activations.revoked_at" tone="rose" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <AdminStatCard label="رسائل AI (24h)" value={ov?.messagesToday ?? "N/A"} hint="ai_credit_ledger" tone="emerald" />
        <AdminStatCard label="AI requests (total)" value={pgReady ? aiTotal : "N/A"} hint="ai_credit_ledger reason=ai_reserve" tone="blue" />
        <AdminStatCard label="AI requests (24h)" value={pgReady ? ai24h : "N/A"} hint="آخر 24 ساعة" tone="blue" />
        <AdminStatCard label="رسائل Inbox" value={pgReady ? inboxCount : "N/A"} hint="user_inbox" tone="amber" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <AdminStatCard label="إيميلات مرسلة" value={pgReady ? emailSent : "N/A"} hint="email_deliveries status=sent" tone="emerald" />
        <AdminStatCard label="ملفات (7d)" value={ov?.filesWeek ?? "N/A"} hint="files" tone="purple" />
      </div>
      <AdminCard title="روابط سريعة" tone="default">
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/admin/users" className="underline">المستخدمين</Link>
          <Link href="/admin/subscriptions" className="underline">الاشتراكات</Link>
          <Link href="/admin/messaging" className="underline">الرسائل</Link>
          <Link href="/inbox" className="underline">صندوق المستخدم</Link>
        </div>
      </AdminCard>
      <AdminNotice tone="default">
        تكلفة Tokens/مزودي AI (provider cost) unavailable — لا توجد بيانات تكلفة في الـschema. مراقبة الأعطال (API errors) unavailable — لا جدول errors في الـschema (يمكن إضافته لاحقًا).
      </AdminNotice>
    </div>
  );
}
