import { redirect } from "next/navigation";
import { CalendarClock, Search } from "lucide-react";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import { getSubscriptionStatus, extendSubscription } from "@/app/admin/actions/subscription-manage";
import { AdminCard, AdminNotice, AdminPageHeader, AdminStatCard } from "@/components/admin/ui";

/**
 * تمييز انتهاء الصلاحية (المرحلة 4.5): منتهٍ = rose غامق، أقرب من 7 أيام = amber،
 * وإلا emerald — نفس منطق app/admin/users/[id]/page.tsx.
 */
function expiryInfo(iso: string | null, fallback: string): { label: string; cls: string } {
  if (!iso) return { label: fallback, cls: "text-slate-400" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { label: iso, cls: "text-slate-400" };
  const label = d.toISOString().slice(0, 10);
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return { label: `${label} — منتهٍ`, cls: "text-rose-400 font-bold" };
  if (diff <= 7 * 86400_000) return { label: `${label} — يقارب الانتهاء (${Math.ceil(diff / 86400_000)} يوم)`, cls: "text-amber-300 font-bold" };
  return { label: `${label} — ساري (${Math.ceil(diff / 86400_000)} يوم متبقٍ)`, cls: "text-emerald-300" };
}

/**
 * 💳 تفعيل الاشتراكات — اتنقلت من الصفحة الموحّدة (المرحلة 1).
 *
 * RBAC: الصفحة محتاجة subscriptions.manage (owner/admin). التفعيل نفسه بيمر
 * على subscriptionActivationFormAction → activateSubscription اللي بتتحقق
 * من الدور تاني (Owner) وتسجّل audit_log (PASS/FAIL/BLOCKED).
 *
 * عرض الحالة التفصيلي بيستخدم getSubscriptionStatus الموجودة أصلًا
 * (subscription-manage.ts) — مكانتش مستعملة في أي واجهة قبل كده.
 */
export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string; sub_lookup?: string }>;
}) {
  const sp = await searchParams;
  const { user, isOwner } = await requireAdminPermission("subscriptions.manage");

  const canActivate = isOwner;
  const lookupRaw = (sp.sub_lookup ?? "").trim();
  const status = lookupRaw ? await getSubscriptionStatus(lookupRaw) : null;
  const lookupFailed = Boolean(lookupRaw) && !status;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="تفعيل الاشتراكات"
        subtitle="تفعيل يدوي عبر User Code (MAG-XXX-XXXX) أو UUID — مع تسجيل إلزامي في audit_log."
        badge="subscriptions.manage"
        permissionKey="subscriptions.manage"
      />

      {sp.success ? <AdminNotice tone="emerald">تم: {sp.success}</AdminNotice> : null}
      {sp.error ? <AdminNotice tone="rose">خطأ: {sp.error}</AdminNotice> : null}
      {!canActivate ? (
        <AdminNotice tone="amber" title="تنبيه صلاحية">
          التفعيل الفعلي محجوز لـ <strong>Owner</strong> فقط — <code>activateSubscription</code> هيرفض ويسجّل محاولة BLOCKED في الـaudit.
        </AdminNotice>
      ) : null}

      <AdminCard
        title="بحث عن اشتراك مستخدم"
        description="البحث بيشتغل على UUID أو كود المستخدم، وبيقرأ الحالة من profiles + entitlements + subscription_activations + subscription_quotas."
        tone="amber"
      >
        <form method="GET" className="flex flex-wrap gap-2 items-center">
          <input
            name="sub_lookup"
            type="text"
            defaultValue={sp.sub_lookup ?? ""}
            placeholder="MAG-XXX-XXXX أو UUID"
            className="bg-slate-800 border border-amber-600 rounded-lg px-3 py-2 text-xs text-slate-100 w-full sm:w-72 font-mono"
          />
          <button type="submit" className="text-xs bg-amber-500 text-amber-950 rounded-lg px-4 py-2 hover:bg-amber-400 font-bold flex items-center gap-1">
            <Search size={14} /> بحث
          </button>
        </form>

        {lookupFailed ? (
          <AdminNotice tone="rose">
            مفيش نتيجة لـ <code dir="ltr">{lookupRaw}</code>. الاحتمالات: المستخدم غير موجود، أو جداول
            <code> user_codes</code>/<code>subscription_*</code> مش منطبقة على Supabase بعد، أو <code>SUPABASE_SERVICE_ROLE_KEY</code>
            {" "}غير موجود في البيئة → الحالة <strong>غير قابلة للتحقق من هنا</strong>.
          </AdminNotice>
        ) : null}

        {status ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <AdminStatCard label="المستخدم" value={status.user_display_name || status.user_email || status.user_id.slice(0, 8)} hint={status.user_email ?? undefined} />
              <AdminStatCard label="الخطة الحالية" value={status.current_plan_name || status.current_plan_key || "—"} tone="amber" />
              <AdminStatCard
                label="انتهاء الاشتراك (entitlement)"
                value={status.entitlement_expires_at ? new Date(status.entitlement_expires_at).toLocaleDateString("ar-EG") : "—"}
                hint="entitlements.expires_at"
                tone="emerald"
              />
              <AdminStatCard
                label="كود المستخدم"
                value={status.public_user_code || status.user_code || "—"}
                hint="public_user_code (يحتاج تنفيذ db/epic6-user-code.sql)"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <AdminStatCard label="رسائل 24h" value={status.messages_24h} hint="subscription_quotas.messages_24h" />
              <AdminStatCard label="رفعات اليوم" value={status.uploads_today} hint="subscription_quotas.uploads_today" />
              <AdminStatCard label="مدة التفعيل الأخير" value={status.activation_duration_days ?? "—"} hint="subscription_activations.duration_days" />
              <AdminStatCard
                label="تاريخ آخر تفعيل"
                value={status.activation_created_at ? new Date(status.activation_created_at).toLocaleDateString("ar-EG") : "—"}
              />
            </div>

            <AdminNotice tone="default">
              آخر تفعيل بواسطة: <code dir="ltr">{status.activation_activated_by ?? "—"}</code> · ملاحظة: {status.activation_note || "—"}
            </AdminNotice>

            {/* Phase 4.5: إبراز حقيقي لتواريخ الانتهاء (activation + entitlements) — منتهٍ = rose، ≤7 أيام = amber */}
            {(() => {
              const actIso =
                status.activation_created_at && status.activation_duration_days
                  ? new Date(new Date(status.activation_created_at).getTime() + status.activation_duration_days * 86400_000).toISOString()
                  : null;
              const actInfo = expiryInfo(actIso, "N/A — مفيش تفعيل مسجّل");
              const entInfo = expiryInfo(
                status.entitlement_expires_at,
                status.entitlement_value ? "دائم (expires_at NULL — بدون انتهاء)" : "N/A — مفيش امتياز خطة نشط"
              );
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-3">
                    <p className="text-slate-500 mb-1">انتهاء الاشتراك (activation + duration)</p>
                    <p className={actInfo.cls}>{actInfo.label}</p>
                  </div>
                  <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-3">
                    <p className="text-slate-500 mb-1">
                      انتهاء الامتياز (entitlements{status.entitlement_value ? `: ${status.entitlement_value}` : ""})
                    </p>
                    <p className={entInfo.cls}>{entInfo.label}</p>
                  </div>
                </div>
              );
            })()}

            {/* Phase 4.5: زر التمديد الفعلي — يكتب subscription_activations + entitlements.expires_at + audit */}
            {canActivate ? (
              <form
                action={async (formData: FormData) => {
                  "use server";
                  const lookup = String(formData.get("lookup") || sp.sub_lookup || "");
                  const days = Number(formData.get("duration_days") || 0);
                  const extNote = String(formData.get("ext_note") || "");
                  const result = await extendSubscription(lookup, days, extNote, user.id, user.email ?? null);
                  const back = "/admin/subscriptions?sub_lookup=" + encodeURIComponent(lookup);
                  if (result.ok) redirect(back + "&success=" + encodeURIComponent(result.message));
                  redirect(back + "&error=" + encodeURIComponent(result.message));
                }}
                className="flex flex-wrap items-end gap-2 border-t border-slate-700 pt-3"
              >
                <input type="hidden" name="lookup" value={sp.sub_lookup ?? ""} />
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-slate-400">أيام التمديد (1–365)</span>
                  <input
                    name="duration_days"
                    type="number"
                    defaultValue={30}
                    min={1}
                    max={365}
                    required
                    className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 w-32"
                  />
                </label>
                <label className="flex flex-col gap-1 grow">
                  <span className="text-[11px] text-slate-400">ملاحظة (سبب التمديد)</span>
                  <input
                    name="ext_note"
                    type="text"
                    placeholder="تجديد دفعة / إصلاح اشتراك…"
                    className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100"
                  />
                </label>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-lg text-sm"
                >
                  <CalendarClock size={14} /> تمديد + تسجيل Audit
                </button>
              </form>
            ) : (
              <AdminNotice tone="amber">
                التمديد محجوز لـ <strong>Owner</strong> فقط (نفس حماية <code>activateSubscription</code>) — أي محاولة
                من غير Owner بتسجّل <code>audit_log</code> بنتيجة <strong>BLOCKED</strong>.
              </AdminNotice>
            )}
          </div>
        ) : null}
      </AdminCard>

      <AdminCard
        title="تفعيل اشتراك يدويًا"
        description="DB prerequisites: user_codes + subscription_plans + subscription_activations + audit_log."
        tone="emerald"
      >
        <p className="text-[11px] text-slate-400">
          المنفّذ الحالي: <span className="font-mono text-slate-300" dir="ltr">{user.email ?? user.id}</span>
        </p>
        <form
          action={async (formData: FormData) => {
            "use server";
            const result = await (await import("@/app/admin/actions/subscription-form-action")).subscriptionActivationFormAction(formData);
            if (result.ok) {
              redirect("/admin/subscriptions?success=" + encodeURIComponent(result.message || "تم التفعيل"));
            }
            redirect("/admin/subscriptions?error=" + encodeURIComponent(result.message || "فشل التفعيل"));
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">User Code</span>
              <input name="user_code" type="text" placeholder="MAG-XXX-XXXX" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm font-mono" required />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">الخطة</span>
              <select name="plan_key" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm">
                <option value="free">Free — مجانًا</option>
                <option value="pro">Pro — احترافي</option>
                <option value="ultra">Ultra — ألتميت</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">المدة (أيام)</span>
              <input name="duration_days" type="number" defaultValue={30} min={1} max={365} className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">ملاحظة</span>
              <input name="note" type="text" placeholder="فودافون كاش / فوري / إنستاباي" className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
            </label>
          </div>
          <input type="hidden" name="actor_note" value="ui:/admin/subscriptions" />
          <button type="submit" className="bg-emerald-500 text-slate-950 font-bold rounded-lg px-6 py-2.5 text-sm hover:bg-emerald-400">
            تفعيل + تسجيل Audit
          </button>
        </form>

        <AdminNotice tone="default" title="مرجع الـDB الحالي">
          <code>subscription_activations</code>: id, user_code, user_id, plan_key, duration_days, activated_by, note, created_at, revoked_at, revoked_by
          <br />
          <code>audit_log.action = &apos;subscriptions.manage&apos;</code> (حساس — إلزامي) · <code>user_codes</code>: code, user_id, is_active, activated_by, activation_note.
        </AdminNotice>
      </AdminCard>
    </div>
  );
}
