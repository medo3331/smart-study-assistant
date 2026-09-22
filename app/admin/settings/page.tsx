import { Server, UserCog, UserPlus } from "lucide-react";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import { providerConfigStatus } from "@/lib/ai/health";
import { AdminCard, AdminNotice, AdminPageHeader, AdminSkeleton, AdminStatCard, AdminTableWrap } from "@/components/admin/ui";

/**
 * ⚙️ الإعدادات — الصفحة الجديدة (المرحلة 1).
 *
 * فيها الحاجات الحقيقية اللي كانت مدفونة في الصفحة الموحّدة:
 *   - إدارة الأدمنز (site_admins) عبر /api/admin/manage-roles (Owner فقط).
 *   - حالة النظام (فحص تهيئة المزوّدين الحقيقي من lib/ai/health.ts).
 * وباقي الإعدادات هيكل أساسي فقط لحد المرحلة 4.
 *
 * الصلاحية المطلوبة: admins.manage = Owner فقط (نفس خريطة auth-roles).
 */
export default async function AdminSettingsPage() {
  const { supabase, user, isOwner } = await requireAdminPermission("admins.manage");

  const { data: adminsList } = await supabase.from("site_admins").select("user_id, role, added_at").order("added_at", { ascending: true });
  const admins = (adminsList ?? []) as Array<{ user_id: string; role: string | null; added_at: string | null }>;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="الإعدادات"
        subtitle="إدارة الأدمنز، حالة النظام، والإعدادات العامة."
        badge="admins.manage = Owner"
        permissionKey="admins.manage"
      />

      <AdminCard title="حالة النظام (فحص تهيئة حقيقي)" description="المصدر: providerConfigStatus() في lib/ai/health.ts — بيفحص وجود مفاتيح المزوّدين في بيئة السيرفر. مفيش نص ثابت بيقول 'نشط'." tone="default">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(["groq", "nvidia", "openrouter", "gemini"] as const).map((p) => {
            const st = providerConfigStatus(p);
            return (
              <AdminStatCard
                key={p}
                label={`مزوّد ${p}`}
                value={st === "AVAILABLE" ? "AVAILABLE" : "NOT_CONFIGURED"}
                tone={st === "AVAILABLE" ? "emerald" : "rose"}
                hint={st === "AVAILABLE" ? "المفتاح موجود" : "من غير مفتاح → مستثنى من الراوتر"}
              />
            );
          })}
        </div>
        <AdminNotice tone="default">
          <Server size={12} className="inline" /> لا يتم عرض أي API keys / secrets / tokens — الأدمن مش معناه كشف الأسرار.
        </AdminNotice>
      </AdminCard>

      <AdminCard title="فريق الأدمنز (site_admins)" description="المصدر الحقيقي للصلاحيات: جدول site_admins. المنح والسحب Owner فقط وبيتم على السيرفر." tone="amber">
        <AdminNotice tone="default">
          <UserCog size={12} className="inline" /> إضافة Admin: أدخل البريد → <code>/api/admin/manage-roles</code> (role=owner فقط) → إدراج في
          <code> site_admins</code> → Audit <code>admins.manage</code>.
          <br />
          ملاحظة مهمة: جدول <code>site_admins</code> الـDDL بيقبل <code>role in (&apos;admin&apos;,&apos;owner&apos;)</code> بس — يعني قيمة <code>support</code>
          {" "}كمستوى دور مش موجودة في المخطط؛ التقييد الفعلي للدعم بيتم عبر مصفوفة <code>permissions</code> المقروءة في
          <code> getAdminPermissions()</code>.
        </AdminNotice>

        <form action="/api/admin/manage-roles" method="POST" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input type="hidden" name="action" value="grant" />
          <input
            type="email"
            name="email"
            placeholder="email@example.com"
            className="sm:col-span-2 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm"
            required
          />
          <button type="submit" className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
            <UserPlus size={16} /> منح صلاحية Admin
          </button>
        </form>

        {admins.length === 0 ? (
          <AdminNotice tone="amber">
            مفيش صفوف مقروءة من <code>site_admins</code> — يا إما مفيش أدمنز مضافين غيرك، أو الجلسة مش واصلة للجدول.
            <span className="block">الأدمن الحالي: <span className="font-mono" dir="ltr">{user.email ?? user.id}</span> ({isOwner ? "Owner" : "غير Owner"})</span>
          </AdminNotice>
        ) : (
          <AdminTableWrap>
            <thead>
              <tr className="bg-slate-950/60 text-amber-300">
                <th className="text-right px-3 py-2">المعرّف</th>
                <th className="text-right px-3 py-2">الدور</th>
                <th className="text-right px-3 py-2">تاريخ الإضافة</th>
                <th className="text-right px-3 py-2">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.user_id} className="border-t border-slate-700">
                  <td className="px-3 py-2 font-mono text-[10px] text-slate-300" dir="ltr">{a.user_id}</td>
                  <td className="px-3 py-2 text-[11px] text-amber-300 font-bold uppercase">{a.role || "admin"}</td>
                  <td className="px-3 py-2 text-[11px] text-slate-400">{a.added_at ? new Date(a.added_at).toLocaleDateString("ar-EG") : "—"}</td>
                  <td className="px-3 py-2">
                    {a.role !== "owner" ? (
                      <form action="/api/admin/manage-roles" method="POST">
                        <input type="hidden" name="action" value="revoke" />
                        <input type="hidden" name="userId" value={a.user_id} />
                        <button type="submit" className="text-[10px] bg-rose-600 text-white rounded px-2 py-1 hover:bg-rose-500">
                          سحب
                        </button>
                      </form>
                    ) : (
                      <span className="text-[10px] text-slate-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </AdminTableWrap>
        )}
      </AdminCard>

      <AdminSkeleton
        title="إعدادات المنصة"
        deferredTo="المرحلة 4"
        items={[
          { label: "تفعيل/تعطيل الفترة المجانية والدفع", detail: "app_settings (billing_free_period_enabled / billing_payments_enabled) — القراءة متاحة في /admin/plans. الحفظ من اللوحة محتاج أولًا إصلاح صلاحية updateBillingSettings (حاليًا بتقبل أي مستخدم عنده entitlement premium بدل فحص الدور)." },
          { label: "إعدادات الإشعارات", detail: "محتاج جدول/مفاتيح إعدادات جديدة — مش موجودة حاليًا، فمفيش حاجة تتعرض كأنها شغالة." },
          { label: "حدود عامة للمنصة", detail: "حدود الرفع/الرسائل بتيجي من lib/ai/rate-limit.ts + خريطة داخلية في app/api/upload/route.ts — التوحيد مع subscription_plans مؤجل للمرحلة 4." },
          { label: "سجل الإعدادات", detail: "أي تغيير إعدادات لازم يسجّل في audit_log بنوع العملية والمُنفِّذ (زي باقي العمليات الحساسة)." },
        ]}
      />
    </div>
  );
}
