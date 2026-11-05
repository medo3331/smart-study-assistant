import { requireAdminPermission } from "@/lib/admin/auth-check";
import { createServiceClient, isServiceKeyConfigured } from "@/lib/supabase/admin";
import PlanAdminCard from "@/app/admin/components/PlanAdminCard";
import PlansCrudPanel from "@/app/admin/components/PlansCrudPanel";
import { readBillingSettings } from "@/app/plans/actions";
import { AdminCard, AdminNotice, AdminPageHeader, AdminTableWrap } from "@/components/admin/ui";

const PLAN_COLUMNS =
  "plan_key, name, display_name_ar, price, original_price, discount_percentage, credits_monthly, profile_limit, messages_per_2h, messages_daily, messages_monthly, uploads_daily, max_file_size_mb, file_types, video_audio_exclusive, trial_days, is_active, is_popular, features";

/**
 * ═══ قراءة الخطط بـ service role — بعد ما الصلاحية اتأكدت ═══
 *
 * `subscription_plans` عليها RLS (relrowsecurity=true)، والعميل اللي
 * بيرجّعه `requireAdminPermission` عميل anon + الكوكيز، فكانت القراءة
 * بترجع 0 صفوف **من غير خطأ** → جدول فاضي بصمت.
 *
 * الحل: حرّاس الصفحة الأول (redirect لو ممنوع)، وبعدها القراءة بعميل
 * service role اللي بيتخطى RLS. مفيش تسريب صلاحيات هنا لأن ده سيرفر
 * component والحراسة حصلت قبله.
 *
 * ⚠️ لو المفتاح مش مضبوط في البيئة، `createServiceClient()` بيرمي —
 * فبنفحص الأول ونرجّع رسالة واضحة بدل ما الصفحة تقع.
 */
async function readPlans(): Promise<{ plans: any[]; error: string | null }> {
  if (!isServiceKeyConfigured()) {
    return {
      plans: [],
      error:
        "مفتاح service role غير مضبوط على السيرفر (SUPABASE_SECRET_KEY أو SUPABASE_SERVICE_ROLE_KEY) — القراءة محجوبة بـ RLS.",
    };
  }

  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("subscription_plans")
      .select(PLAN_COLUMNS)
      .order("plan_key", { ascending: true });

    if (error) return { plans: [], error: error.message };
    return { plans: (data ?? []) as any[], error: null };
  } catch (e) {
    return { plans: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export default async function AdminPlansPage() {
  // 1) حراسة الصلاحية (auth gate) — الأول وبشكل مستقل عن قراءة الداتا.
  await requireAdminPermission("plans.manage");

  // 2) القراءة بعميل service role (بيتخطى RLS — الصلاحية اتأكدت فوق).
  const [billing, { plans, error: plansError }] = await Promise.all([
    readBillingSettings(),
    readPlans(),
  ]);

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
      ) : plans.length === 0 ? (
        <AdminNotice tone="amber" title="مفيش خطط في القاعدة">
          القراءة نجحت بعميل service role لكن رجّعت 0 صفوف — راجع seed/migrations
          الخاصة بـ <code>subscription_plans</code>.
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
