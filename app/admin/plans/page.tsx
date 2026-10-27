import { Layers } from "lucide-react";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import PlanAdminCard from "@/app/admin/components/PlanAdminCard";
import { readBillingSettings, updateBillingSettings } from "@/app/plans/actions";
import { updatePlanLimits } from "@/app/admin/actions/plan-manage";
import { redirect } from "next/navigation";
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
      .select("plan_key, name, display_name_ar, profile_limit, messages_per_2h, uploads_daily, max_file_size_mb, file_types, video_audio_exclusive, price_monthly, currency, trial_days, is_active")
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
        title="تفعيل/تعطيل الفواتير (حفظ)"
        description="يستخدم updateBillingSettings (Owner-only + audit)."
        tone="emerald"
      >
        <form
          action={async (formData: FormData) => {
            "use server";
            try {
              const result = await updateBillingSettings({
                freePeriodEnabled: formData.get("freePeriodEnabled") === "on",
                paymentsEnabled: formData.get("paymentsEnabled") === "on",
              });
              if (result.ok) {
                redirect("/admin/plans?success=" + encodeURIComponent("تم حفظ إعدادات الفواتير"));
              }
            } catch (e: any) {
              redirect("/admin/plans?error=" + encodeURIComponent(e?.message || "فشل الحفظ"));
            }
          }}
          className="space-y-3"
        >
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="freePeriodEnabled" defaultChecked={billing.freePeriodEnabled} />
            <span>الفترة المجانية مفعلة</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="paymentsEnabled" defaultChecked={billing.paymentsEnabled} />
            <span>الدفع/الاشتراك مفعل</span>
          </label>
          <button type="submit" className="bg-emerald-500 text-slate-950 font-bold rounded-lg px-6 py-2 text-sm hover:bg-emerald-400">
            حفظ
          </button>
        </form>
      </AdminCard>

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

      <AdminCard title="تعديل الخطط (حفظ + audit)" description="Owner-only. يحدّث subscription_plans." tone="emerald">
        <div className="space-y-6">
          {plans.map((p) => (
            <form
              key={String(p.plan_key)}
              action={async (formData: FormData) => {
                "use server";
                try {
                  await updatePlanLimits({
                    planKey: String(p.plan_key),
                    displayNameAr: String(formData.get("displayNameAr") || ""),
                    profileLimit: Number(formData.get("profileLimit")),
                    messagesPer2h: Number(formData.get("messagesPer2h")),
                    uploadsDaily: Number(formData.get("uploadsDaily")),
                    maxFileSizeMB: Number(formData.get("maxFileSizeMB")),
                    fileTypes: String(formData.get("fileTypes") || ""),
                    videoAudioExclusive: formData.get("videoAudioExclusive") === "on",
                    priceMonthly: Number(formData.get("priceMonthly")),
                    currency: String(formData.get("currency") || "USD"),
                    trialDays: Number(formData.get("trialDays")),
                    isActive: formData.get("isActive") === "on",
                  });
                  redirect("/admin/plans?success=" + encodeURIComponent("تم حفظ الخطة"));
                } catch (e: any) {
                  redirect("/admin/plans?error=" + encodeURIComponent(e?.message || "فشل الحفظ"));
                }
              }}
              className="rounded-xl border border-slate-800 p-4 space-y-3"
            >
              <h3 className="font-bold text-slate-100">{String(p.plan_key)}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm">الاسم (AR)
                  <input name="displayNameAr" defaultValue={String(p.display_name_ar || "")} className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1" />
                </label>
                <label className="text-sm">profile_limit
                  <input name="profileLimit" type="number" defaultValue={Number(p.profile_limit ?? 0)} className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1" />
                </label>
                <label className="text-sm">messages_per_2h
                  <input name="messagesPer2h" type="number" defaultValue={Number(p.messages_per_2h ?? 0)} className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1" />
                </label>
                <label className="text-sm">uploads_daily
                  <input name="uploadsDaily" type="number" defaultValue={Number(p.uploads_daily ?? 0)} className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1" />
                </label>
                <label className="text-sm">max_file_size_mb
                  <input name="maxFileSizeMB" type="number" defaultValue={Number(p.max_file_size_mb ?? 0)} className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1" />
                </label>
                <label className="text-sm">file_types (comma)
                  <input name="fileTypes" defaultValue={Array.isArray(p.file_types) ? p.file_types.join(",") : String(p.file_types || "")} className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1" />
                </label>
                <label className="text-sm">price_monthly
                  <input name="priceMonthly" type="number" step="0.01" defaultValue={Number(p.price_monthly ?? 0)} className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1" />
                </label>
                <label className="text-sm">currency
                  <input name="currency" defaultValue={String(p.currency ?? "USD")} className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1" />
                </label>
                <label className="text-sm">trial_days
                  <input name="trialDays" type="number" defaultValue={Number(p.trial_days ?? 0)} className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1" />
                </label>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="videoAudioExclusive" defaultChecked={Boolean(p.video_audio_exclusive)} />
                  <span>video/audio</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isActive" defaultChecked={Boolean(p.is_active)} />
                  <span>active</span>
                </label>
              </div>
              <button type="submit" className="bg-emerald-500 text-slate-950 font-bold rounded-lg px-6 py-2 text-sm hover:bg-emerald-400">
                حفظ {String(p.plan_key)}
              </button>
            </form>
          ))}
        </div>
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
              إعدادات الفواتير قابلة للحفظ الآن من هذا النموذج (Owner-only + audit). الحدود remain read-only.
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
