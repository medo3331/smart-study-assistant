import Link from "next/link";
import { UserSearch, Users } from "lucide-react";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import { hasPermission } from "@/lib/auth-roles";
import { searchUsersPaged } from "@/app/admin/actions/users-search";
import { banUser, unbanUser } from "@/app/admin/actions/users-ban";
import { listPurchaseRequests, type PurchaseRequestAdminView } from "@/lib/admin/purchase-requests";
import UserAiLookup from "@/components/admin/UserAiLookup";
import SubscriptionRequestsTable from "@/app/admin/subscription-requests/SubscriptionRequestsTable";
import { AdminCard, AdminNotice, AdminPageHeader, AdminTableWrap } from "@/components/admin/ui";

/**
 * 👥 إدارة المستخدمين — اتنقلت من الصفحة الموحّدة (المرحلة 1).
 *
 * RBAC حقيقي على السيرفر: الصفحة محتاجة users.read، والحظر/فك الحظر بيتحقق
 * منه تاني جوه banUser/unbanUser ويسجّل audit_log.
 *
 * Phase 4.4: فلاتر حقيقية عبر query params (الخطة/الحالة/الكود/التاريخ) تُطبَّق
 * على الداتابيز في searchUsers، + تصدير CSV حقيقي، + is_banned حقيقي من
 * profiles (الفجوة الموثقة أُغلقت — banUser بيكتب is_banned/banned_at/ban_reason).
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    plan?: string;
    status?: string;
    code?: string;
    after?: string;
    before?: string;
    page?: string;
    success?: string;
    error?: string;
  }>;
}) {
  const sp = await searchParams;
  const { user, supabase } = await requireAdminPermission("users.read");

  const [canBan, canUnban, canGrantCredits, canReviewSubscriptions] = await Promise.all([
    hasPermission(supabase, user.id, user.email ?? null, "users.ban"),
    hasPermission(supabase, user.id, user.email ?? null, "users.unban"),
    hasPermission(supabase, user.id, user.email ?? null, "credits.manage"),
    hasPermission(supabase, user.id, user.email ?? null, "subscriptions.manage"),
  ]);

  const plan = sp.plan ?? "all";
  const status = sp.status ?? "all";
  const code = sp.code ?? "all";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const PAGE_SIZE = 50;
  let userSearchResults: any[] = [];
  let totalUsers = 0;
  let searchError: string | null = null;
  try {
    const paged = await searchUsersPaged(
      (sp.q ?? "").trim(),
      plan,
      status,
      code,
      sp.after || null,
      sp.before || null,
      page,
      PAGE_SIZE
    );
    userSearchResults = paged.rows;
    totalUsers = paged.total;
  } catch (e: any) {
    searchError = e?.message || "تعذّر جلب المستخدمين";
  }

  // طلبات دفع الاشتراكات — تظهر في مركز المستخدمين لمن يملك subscriptions.manage
  let subscriptionRequests: PurchaseRequestAdminView[] = [];
  if (canReviewSubscriptions) {
    try {
      const all = await listPurchaseRequests(200, "plan");
      subscriptionRequests = all.filter((r) => r.kind === "plan");
    } catch {
      // الجداول غير مطبقة بعد — القسم يظهر فاضي بدل كسر الصفحة
    }
  }

  // بناء رابط صفحة مع الحفاظ على كل فلاتر البحث
  function pageHref(targetPage: number): string {
    const params = new URLSearchParams();
    if (sp.q) params.set("q", sp.q);
    if (plan !== "all") params.set("plan", plan);
    if (status !== "all") params.set("status", status);
    if (code !== "all") params.set("code", code);
    if (sp.after) params.set("after", sp.after);
    if (sp.before) params.set("before", sp.before);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return `/admin/users${qs ? `?${qs}` : ""}`;
  }
  const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));

  const exportHref =
    `/api/admin/users/export?q=${encodeURIComponent(sp.q ?? "")}` +
    `&plan=${encodeURIComponent(plan)}&status=${encodeURIComponent(status)}` +
    `&code=${encodeURIComponent(code)}&after=${encodeURIComponent(sp.after ?? "")}` +
    `&before=${encodeURIComponent(sp.before ?? "")}`;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="إدارة المستخدمين"
        subtitle="بحث بالاسم/الإيميل + حظر وفك حظر + مراقبة حالة الذكاء الاصطناعي لكل مستخدم."
        badge="users.read"
        permissionKey="users.ban / users.unban"
      />

      {sp.success ? <AdminNotice tone="emerald">تم: {sp.success}</AdminNotice> : null}
      {sp.error ? <AdminNotice tone="rose">خطأ: {sp.error}</AdminNotice> : null}
       {searchError ? <AdminNotice tone="rose">خطأ في جلب المستخدمين: {searchError}</AdminNotice> : null}


      <AdminNotice tone="emerald" title="الفجوة الموثقة أُغلقت (المرحلة 4.4)">
        حالة الحظر الآن حقيقية من الداتابيز: <code>banUser</code> يكتب <code>is_banned/banned_at/ban_reason</code> في
        <code>profiles</code>، و<code>searchUsers</code> يقرأها. فلتر "محظور" يعرض المحظورين فعلًا.
      </AdminNotice>

      <AdminCard
        title="بحث المستخدمين"
        description="بحث حقيقي على profiles (الاسم/الإيميل/الكود) + فلاتر فعلية على الداتابيز: الخطة، الحالة، وجود الكود، نطاق تاريخ التسجيل. النتائج فورية من الـURL (query params) — انسخ الرابط لمشاركة نفس البحث."
        tone="amber"
      >
        <form method="GET" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400">بحث</span>
            <input
              name="q"
              type="text"
              defaultValue={sp.q ?? ""}
              placeholder="اسم / إيميل / MAG-XXX-XXXX..."
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400">الخطة</span>
            <select name="plan" defaultValue={plan} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100">
              <option value="all">كل الخطط</option>
              <option value="free">مجاني</option>
              <option value="premium">Premium</option>
              <option value="trial">تجربة</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400">الحالة</span>
            <select name="status" defaultValue={status} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100">
              <option value="all">الكل</option>
              <option value="active">نشط</option>
              <option value="banned">محظور</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400">كود المستخدم</span>
            <select name="code" defaultValue={code} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100">
              <option value="all">الكل</option>
              <option value="with_code">عنده كود</option>
              <option value="without_code">بدون كود</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400">مسجّل من (تاريخ)</span>
            <input
              name="after"
              type="date"
              defaultValue={sp.after ?? ""}
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400">مسجّل حتى (تاريخ)</span>
            <input
              name="before"
              type="date"
              defaultValue={sp.before ?? ""}
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded-lg text-sm">
              بحث
            </button>
            <a
              href={exportHref}
              className="inline-flex items-center bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-lg text-sm"
              title="تصدير نفس نتائج البحث الحالية كـ CSV (بحد أقصى 500 صف)"
            >
              CSV
            </a>
          </div>
        </form>


        {userSearchResults.length === 0 ? (
          <AdminNotice>لا توجد نتائج لهذه الفلاتر. عدّل البحث أو الفلاتر لعرض النتائج من الداتابيز.</AdminNotice>
        ) : (
          <>
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
              <span>
                إجمالي المسجلين المطابقين: <strong className="text-amber-300">{totalUsers}</strong> مستخدم · صفحة {page} من {totalPages}
              </span>
              <span className="text-slate-500">كل المسجلين متاحون بالترقيم — لا حد 50 صلب.</span>
            </div>
            <AdminTableWrap>
            <thead>
              <tr className="bg-slate-950/60 text-amber-300">
                <th className="text-right px-3 py-2">الاسم</th>
                <th className="text-right px-3 py-2">الإيميل</th>
                <th className="text-right px-3 py-2">كود المستخدم</th>
                <th className="text-right px-3 py-2">الخطة</th>
                <th className="text-right px-3 py-2">الشخصية</th>
                <th className="text-right px-3 py-2">تاريخ التسجيل</th>
                <th className="text-right px-3 py-2">الحالة</th>
                <th className="text-right px-3 py-2">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {userSearchResults.map((u) => (
                <tr key={u.id} className="border-t border-slate-700">
                  <td className="px-3 py-2">{u.display_name || "—"}</td>
                  <td className="px-3 py-2" dir="ltr">{u.email || "—"}</td>
                  <td className="px-3 py-2 font-mono text-[10px]">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="text-amber-400 underline decoration-dotted underline-offset-4 hover:text-amber-300"
                      title="تفاصيل المستخدم + QR Code (المرحلة 3)"
                    >
                      {u.public_user_code || u.user_code || "—"}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-block bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                      {u.on_trial ? "Trial" : u.plan_key || "Free"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[10px] text-slate-400">{u.persona || "—"}</td>
                  <td className="px-3 py-2 text-[10px] whitespace-nowrap">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString("ar-EG") : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className={u.is_banned ? "text-rose-400 font-bold" : "text-emerald-400"}>{u.is_banned ? "محظور" : "نشط"}</span>
                  </td>
                  <td className="px-3 py-2">
                    <form
                      action={async () => {
                        "use server";
                        if (u.is_banned) {
                          await unbanUser(u.id, u.user_code);
                        } else {
                          await banUser(u.id, u.user_code, "حظر من إدارة المستخدمين");
                        }
                      }}
                    >
                      <button
                        type="submit"
                        disabled={u.is_banned ? !canUnban : !canBan}
                        className={
                          u.is_banned
                            ? "text-[10px] bg-emerald-600 text-white rounded px-2 py-1 hover:bg-emerald-500 disabled:opacity-40"
                            : "text-[10px] bg-rose-600 text-white rounded px-2 py-1 hover:bg-rose-500 disabled:opacity-40"
                        }
                      >
                        {u.is_banned ? "فك الحظر" : "حظر"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </AdminTableWrap>

            {/* ترقيم الصفحات — لكل المسجلين */}
            <div className="flex items-center justify-between mt-3 text-xs">
              <Link
                href={pageHref(Math.max(1, page - 1))}
                aria-disabled={page <= 1}
                className={`rounded bg-slate-800 px-3 py-1.5 ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-slate-700"}`}
              >
                → السابق
              </Link>
              <span className="text-slate-400">صفحة {page} من {totalPages}</span>
              <Link
                href={pageHref(Math.min(totalPages, page + 1))}
                aria-disabled={page >= totalPages}
                className={`rounded bg-slate-800 px-3 py-1.5 ${page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-slate-700"}`}
              >
                التالي ←
              </Link>
            </div>
          </>
        )}

        <AdminNotice tone="default">
          صلاحيات الحظر عندك: <code>users.ban</code> = {canBan ? "مسموح" : "ممنوع"} · <code>users.unban</code> = {canUnban ? "مسموح" : "ممنوع"}.
          الفحص بيتم في السيرفر جوه الـaction نفسه، مش بإخفاء الزر بس.
        </AdminNotice>
      </AdminCard>

      {canReviewSubscriptions ? (
        <AdminCard
          title="طلبات دفع الاشتراكات"
          description="بيانات المستخدم اللي عمل الطلب + إثبات الدفع + محادثة الدعم — عدّل الطلب (الباقة/المدة/المبلغ) ثم اقبل أو ارفض. القسم الكامل في /admin/subscription-requests."
          tone={subscriptionRequests.some((r) => r.status === "payment_submitted") ? "amber" : "purple"}
        >
          <SubscriptionRequestsTable requests={subscriptionRequests} />
        </AdminCard>
      ) : null}

      <AdminCard tone="purple">
        <h2 className="text-base font-bold text-purple-300 flex items-center gap-2">
          <UserSearch size={18} /> مراقبة الذكاء الاصطناعي لكل مستخدم
        </h2>
        <p className="text-[11px] text-slate-400">
          أدخل User ID أو إيميل لعرض الرصيد والـentitlements وحالة حدود الاستخدام — عبر <code>/api/admin/user-ai-status</code> (سيرفر-سايد).
        </p>
        <UserAiLookup />
      </AdminCard>

      {canGrantCredits ? <AdminCard title="شحن AI Credits يدويًا" description="إضافة رصيد لأي مستخدم عبر /api/admin/add-credits (صلاحية credits.manage، مسجّل في ai_credit_ledger بسبب reason=admin_grant)." tone="emerald">
        <form action="/api/admin/add-credits" method="POST" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            name="targetUserId"
            placeholder="User UUID"
            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm font-mono"
            required
          />
          <input
            type="number"
            name="amount"
            placeholder="عدد الـCredits"
            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm"
            min="1"
            required
          />
          <button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-sm">
            إرسال الرصيد
          </button>
        </form>
      </AdminCard> : null}

      <AdminCard title="روابط وتحليلات المستخدمين" tone="default">
        <ul className="text-xs text-slate-300 space-y-2">
          <li className="flex items-center gap-2">
            <Users size={14} className="text-amber-400" />
            <Link className="underline hover:text-amber-300" href="/admin/users/analytics">تحليلات المستخدمين (استخدام AI + الاشتراك)</Link>
          </li>
          <li className="flex items-center gap-2">
            <Users size={14} className="text-amber-400" />
            <Link className="underline hover:text-amber-300" href="/admin/subscriptions">تفعيل اشتراك لمستخدم عبر User Code</Link>
          </li>
          <li className="flex items-center gap-2">
            <Users size={14} className="text-amber-400" />
            <Link className="underline hover:text-amber-300" href="/admin/rewards">إصدار مكافأة لمستخدم (Owner)</Link>
          </li>
        </ul>
      </AdminCard>
    </div>
  );
}
