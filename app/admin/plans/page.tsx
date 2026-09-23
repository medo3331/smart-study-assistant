import { Layers } from "lucide-react";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import PlanAdminCard from "@/app/admin/components/PlanAdminCard";
import { readBillingSettings } from "@/app/plans/actions";
import { AdminCard, AdminNotice, AdminPageHeader, AdminTableWrap } from "@/components/admin/ui";

/**
 * 📦 الخطط والحصص — الصفحة الجديدة (المرحلة 1).
 *
 * مفيش تعديل حقيقي للحدود هنا بعد (مؤجل للمرحلة 4). اللي معروض كله بيانات
 * حقيقية من: app_settings (الفواتير) + subscription_plans (لو منطبق على
 * Supabase) + الحدود المطبَّقة فعليًا في كود الرفع (app/api/upload/route.ts).
 *
 * ⚠️ فجوة موثقة: حدود الرفع المطبَّقة حاليًا مكتوبة *جوه الكود* في
 * app/api/upload/route.ts — يعني مصدرين للحقيقة (الداتابيز + الكود).
 * التوحيد مؤجل للمرحلة 4.
 */
export default async function AdminPlansPage() {
  const { supabase } = await requireAdminPermission("plans.manage");

  const [billing, plansRes] = await Promise.all([
    readBillingSettings(),
    supabase
      .from("subscription_plans")
      .select("plan_key, name, display_name_ar, profile_limit, messages_per_2h, uploads_daily, max_file_size_mb, file_types, video_audio_exclusive, trial_days, is_active")
      .order("plan_key", { ascending: true }),
  ]);

  const plans = (plansRes.data ?? []) as unknown as Array<Record<string, unknown>>;
  const plansError = plansRes.error?.message ?? null;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="الخطط والحصص"
        subtitle="حدود كل باقة (Free/Pro/Ultra) وإعدادات الفواتير — قراءة حقيقية فقط في هذه المرحلة."
        badge="plans.manage"
        permissionKey="plans.manage"
      />

      <PlanAdminCard />

      <AdminCard
        title="الخطط المسجّلة في الداتابيز (subscription_plans)"
        description="المصدر: جدول subscription_plans الموجود في db/epic2-admin-rbac-audit-schema.sql."
        tone="amber"
      >
        {plansError ? (
          <AdminNotice tone="rose">
            تعذّر قراءة <code>subscription_plans</code>: {plansError} — <strong>غير قابل للتحقق من هنا</strong>
            {" "}(احتمال: الجدول مش منطبق على Supabase بعد، أو RLS مانع القراءة بمفاتيح الجلسة).
          </AdminNotice>
        ) : plans.length === 0 ? (
          <AdminNotice tone="rose">
            الجدول موجود لكن راجع صفر صفوف — <strong>غير قابل للتحقق من هنا</strong>: تأكد من تنفيذ
            {" "}<code>db/epic2-admin-rbac-audit-schema.sql</code> على Supabase.
          </AdminNotice>
        ) : (
          <AdminTableWrap>
            <thead>
              <tr className="bg-slate-950/60 text-amber-300">
                <th className="text-right px-3 py-2">الخطة</th>
                <th className="text-right px-3 py-2">الاسم</th>
                <th className="text-right px-3 py-2">بروفايلات</th>
                <th className="text-right px-3 py-2">رسائل/2h</th>
                <th className="text-right px-3 py-2">رفعات/يوم</th>
                <th className="text-right px-3 py-2">أقصى حجم (MB)</th>
                <th className="text-right px-3 py-2">فيديو/صوت</th>
                <th className="text-right px-3 py-2">مفعّلة</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={String(p.plan_key)} className="border-t border-slate-700">
                  <td className="px-3 py-2 font-mono text-amber-300" dir="ltr">{String(p.plan_key)}</td>
                  <td className="px-3 py-2">{String(p.display_name_ar || p.name || "—")}</td>
                  <td className="px-3 py-2">{String(p.profile_limit ?? "—")}</td>
                  <td className="px-3 py-2">{String(p.messages_per_2h ?? "—")}</td>
                  <td className="px-3 py-2">{String(p.uploads_daily ?? "—")}</td>
                  <td className="px-3 py-2">{String(p.max_file_size_mb ?? "—")}</td>
                  <td className="px-3 py-2">{p.video_audio_exclusive ? "مسموح" : "ممنوع"}</td>
                  <td className="px-3 py-2">{p.is_active ? "نعم" : "لا"}</td>
                </tr>
              ))}
            </tbody>
          </AdminTableWrap>
        )}
      </AdminCard>

      <AdminCard title="الحدود المطبَّقة فعليًا وقت الرفع (من الكود)" description="هذه هي القيم التي يفرضها السيرفر الآن في app/api/upload/route.ts — مكتوبة في الكود وليست مقروءة من subscription_plans." tone="default">
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
            <tr className="border-t border-slate-800">
              <td className="px-3 py-2 font-mono" dir="ltr">free</td>
              <td className="px-3 py-2">5</td>
              <td className="px-3 py-2">20 MB</td>
              <td className="px-3 py-2">pdf, text, image</td>
            </tr>
            <tr className="border-t border-slate-800">
              <td className="px-3 py-2 font-mono" dir="ltr">pro</td>
              <td className="px-3 py-2">30</td>
              <td className="px-3 py-2">150 MB</td>
              <td className="px-3 py-2">pdf, text, image, video, audio</td>
            </tr>
            <tr className="border-t border-slate-800">
              <td className="px-3 py-2 font-mono" dir="ltr">ultra</td>
              <td className="px-3 py-2">60</td>
              <td className="px-3 py-2">1024 MB</td>
              <td className="px-3 py-2">pdf, text, image, video, audio</td>
            </tr>
          </tbody>
        </AdminTableWrap>

        <AdminNotice tone="amber" title="مؤجل للمرحلة 4">
          <ul className="list-disc pr-5 space-y-1">
            <li>توحيد مصدر الحدود: الرفع لازم يقرأ من <code>subscription_plans</code> بدل الخريطة المكتوبة في الكود.</li>
            <li>تعديل الحدود من اللوحة (حفظ حقيقي + audit) لسه مش متاح.</li>
            <li>
              إعدادات الفواتير للقراءة فقط هنا. دالة الحفظ <code>updateBillingSettings</code> موجودة بالفعل، لكن صلاحيتها الحالية
              بتقبل أي مستخدم عنده entitlement <code>premium</code> كبديل عن فحص الدور — فجوة أمنية قائمة مسجلة في التقرير،
              ومش مربوطة بأي واجهة لحد ما تتصلّح.
            </li>
          </ul>
        </AdminNotice>
      </AdminCard>

      <AdminNotice tone="default" title="ملخص إعدادات الفواتير المقروءة">
        فترة مجانية: <strong>{billing.freePeriodEnabled ? "مفعّلة" : "معطّلة"}</strong> · الدفع:{" "}
        <strong>{billing.paymentsEnabled ? "مفعّل" : "معطّل (آمن)"}</strong> · المصدر:{" "}
        {billing.source === "db"
          ? "قاعدة البيانات (app_settings)"
          : billing.source === "default"
            ? "افتراضي آمن (لم تُحمّل الإعدادات)"
            : "fallback آمن عند خطأ القراءة"}
        <span className="mx-2">·</span>
        <Layers size={12} className="inline" /> لا يتم تغيير أي قيمة من المتصفح في هذه المرحلة.
      </AdminNotice>
    </div>
  );
}
