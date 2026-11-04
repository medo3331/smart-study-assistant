import { Layers } from "lucide-react";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import PlanAdminCard from "@/app/admin/components/PlanAdminCard";
import PlansCrudPanel from "@/app/admin/components/PlansCrudPanel";
import { readBillingSettings } from "@/app/plans/actions";
import { AdminCard, AdminNotice, AdminPageHeader, AdminTableWrap } from "@/components/admin/ui";

export default async function AdminPlansPage() {
  const { supabase } = await requireAdminPermission("plans.manage");

  const [billing, plansRes] = await Promise.all([
    readBillingSettings(),
    supabase
      .from("subscription_plans")
      .select("plan_key, name, display_name_ar, price, original_price, discount_percentage, credits_monthly, profile_limit, messages_per_2h, messages_daily, messages_monthly, uploads_daily, max_file_size_mb, file_types, video_audio_exclusive, trial_days, is_active, is_popular, features")
      .order("plan_key", { ascending: true }),
  ]);

  const plans = (plansRes.data ?? []) as any[];
  const plansError = plansRes.error?.message ?? null;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="الخطط والحصص"
        subtitle="إدارة كاملة للخطط (CRUD): أسعار، خصومات، مميزات."
        badge="plans.manage"
        permissionKey="plans.manage"
      />

      <PlanAdminCard />

      {plansError ? (
        <AdminNotice tone="rose">
          تعذّر قراءة <code>subscription_plans</code>: {plansError}
        </AdminNotice>
      ) : (
        <PlansCrudPanel plans={plans} />
      )}

      <AdminCard title="الحدود المطبَّقة فعليًا وقت الرفع (من الكود)" description="قيم مكتوبة في الكود." tone="default">
        <AdminTableWrap>
          <thead>
            <tr className="bg-slate-950/60 text-slate-300">
              <th className="text-right px-3 py-2">الخطة</th>
              <th className="text-right px-3 py-2">رفعات/يوم</th>
              <th className="text-right px-3 py-2">أقصى حجم</th>
              <th className="text-right px-3 py-2">الأنواع المسموحة</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-800"><td className="px-3 py-2 font-mono" dir="ltr">free</td><td className="px-3 py-2">5</td><td className="px-3 py-2">20 MB</td><td className="px-3 py-2">pdf, text, image</td></tr>
            <tr className="border-t border-slate-800"><td className="px-3 py-2 font-mono" dir="ltr">pro</td><td className="px-3 py-2">30</td><td className="px-3 py-2">150 MB</td><td className="px-3 py-2">pdf, text, image, video, audio</td></tr>
            <tr className="border-t border-slate-800"><td className="px-3 py-2 font-mono" dir="ltr">ultra</td><td className="px-3 py-2">60</td><td className="px-3 py-2">1024 MB</td><td className="px-3 py-2">pdf, text, image, video, audio</td></tr>
          </tbody>
        </AdminTableWrap>
      </AdminCard>

      <AdminNotice tone="default" title="ملخص إعدادات الفواتير المقروءة">
        فترة مجانية: <strong>{billing.freePeriodEnabled ? "مفعّلة" : "معطّلة"}</strong> · الدفع:{" "}
        <strong>{billing.paymentsEnabled ? "مفعّل" : "معطّل (آمن)"}</strong>
      </AdminNotice>
    </div>
  );
}
