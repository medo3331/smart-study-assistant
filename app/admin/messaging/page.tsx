import Link from "next/link";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import { createServiceClient } from "@/lib/supabase/admin";
import { AdminPageHeader, AdminCard, AdminNotice } from "@/components/admin/ui";
import MessagingComposer from "@/components/admin/MessagingComposer";

const PAGE_SIZE = 50;

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-emerald-500/15 text-emerald-300",
  failed: "bg-rose-500/15 text-rose-300",
  not_configured: "bg-amber-500/15 text-amber-300",
  pending: "bg-slate-500/15 text-slate-300",
};
const STATUS_LABELS: Record<string, string> = {
  sent: "أُرسل",
  failed: "فشل",
  not_configured: "إعدادات ناقصة",
  pending: "قيد الانتظار",
};

type DeliveryRow = {
  id: string;
  announcement_id: string | null;
  user_id: string | null;
  status: string;
  provider_message_id: string | null;
  error: string | null;
  attempts: number | null;
  created_at: string;
};

export default async function AdminMessagingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireAdminPermission("announcements.manage");
  const sp = await searchParams;
  const status = (sp.status ?? "").trim();
  const pageNum = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const offset = (pageNum - 1) * PAGE_SIZE;

  const service = createServiceClient();
  let rows: DeliveryRow[] = [];
  let total: number | null = null;
  let readError: string | null = null;

  let query = service
    .from("email_deliveries")
    .select("id, announcement_id, user_id, status, provider_message_id, error, attempts, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (["sent", "failed", "not_configured", "pending"].includes(status)) query = query.eq("status", status);
  const { data, count, error } = await query;

  if (error) {
    readError = error.message;
  } else {
    rows = (data ?? []) as DeliveryRow[];
    total = count;
  }

  // أسماء وبريد المستلمين + موضوع الإعلان لصفحة العرض الحالية فقط
  const userIds = [...new Set(rows.map((r) => r.user_id).filter((id): id is string => Boolean(id)))];
  const profilesById = new Map<string, { display_name: string | null; email: string | null; public_user_code: string | null }>();
  for (let start = 0; start < userIds.length; start += 500) {
    const { data: profiles } = await service
      .from("profiles")
      .select("id, display_name, email, public_user_code")
      .in("id", userIds.slice(start, start + 500));
    for (const p of profiles ?? []) profilesById.set(p.id, p);
  }
  const announcementIds = [...new Set(rows.map((r) => r.announcement_id).filter((id): id is string => Boolean(id)))];
  const subjectById = new Map<string, string>();
  for (const id of announcementIds) {
    const { data: ann } = await service.from("admin_announcements").select("id, subject").eq("id", id).maybeSingle();
    if (ann) subjectById.set(ann.id, (ann as { subject: string }).subject);
  }

  const totalPages = total !== null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : null;
  const statusTab = (value: string, label: string) => {
    const active = status === value;
    const qs = value ? `?status=${encodeURIComponent(value)}` : "";
    return (
      <Link
        key={value || "all"}
        href={`/admin/messaging${qs}`}
        className={`rounded-full px-3 py-1.5 text-sm font-bold ${active ? "bg-amber-500 text-slate-900" : "bg-slate-700 text-slate-100"}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title="الرسائل والإعلانات" subtitle="رسالة لكل المستخدمين أو لمستخدم محدد — داخل المنصة وبالبريد" badge="announcements.manage" permissionKey="announcements.manage" />
      <AdminCard title="إرسال رسالة" tone="amber">
        <MessagingComposer />
      </AdminCard>
      <AdminNotice tone="default">
        الرسالة تصل دائمًا لصندوق المستخدم داخل المنصة. البريد الإلكتروني يحتاج RESEND_API_KEY وبريد مُرسل صالح (RESEND_FROM_EMAIL أو app_settings.email_sender_address). وللحملات البريدية الكبيرة استخدم <Link href="/admin/announcement-emails" className="text-amber-300 underline">إرسال إعلان بالبريد</Link>.
      </AdminNotice>

      <AdminCard title={`سجل البريد المُرسل (email_deliveries)${total !== null ? ` — ${total} سجل` : ""}`} tone="default">
        <div className="flex flex-wrap items-center gap-2">
          {statusTab("", "الكل")}
          {statusTab("sent", "أُرسل")}
          {statusTab("failed", "فشل")}
          {statusTab("not_configured", "إعدادات ناقصة")}
          {statusTab("pending", "قيد الانتظار")}
        </div>

        {readError && <p className="mt-3 rounded border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">تعذر قراءة السجل: {readError}</p>}

        {!readError && (
          <>
            <div className="mt-3 overflow-x-auto rounded border border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-slate-200">
                  <tr>
                    <th className="p-2 text-right">التاريخ</th>
                    <th className="p-2 text-right">الرسالة</th>
                    <th className="p-2 text-right">المستلم</th>
                    <th className="p-2 text-right">الحالة</th>
                    <th className="p-2 text-right">المحاولات</th>
                    <th className="p-2 text-right">سبب الفشل</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const profile = r.user_id ? profilesById.get(r.user_id) : undefined;
                    const name = profile?.display_name || profile?.public_user_code || (r.user_id ? r.user_id.slice(0, 8) : "—");
                    return (
                      <tr key={r.id} className="border-t border-slate-800">
                        <td className="p-2 text-slate-300 whitespace-nowrap">{new Date(r.created_at).toLocaleString("ar-EG")}</td>
                        <td className="p-2 text-slate-200">{r.announcement_id ? (subjectById.get(r.announcement_id) ?? r.announcement_id.slice(0, 8)) : "—"}</td>
                        <td className="p-2 text-slate-100">
                          {name}
                          {profile?.email ? <span dir="ltr" className="block text-xs text-slate-400">{profile.email}</span> : null}
                        </td>
                        <td className="p-2">
                          <span className={`rounded px-2 py-1 text-xs font-bold ${STATUS_STYLES[r.status] || "bg-slate-500/15 text-slate-300"}`}>
                            {STATUS_LABELS[r.status] || r.status}
                          </span>
                        </td>
                        <td className="p-2 text-slate-300">{r.attempts ?? 0}</td>
                        <td className="p-2 text-xs text-rose-300" dir="auto">{r.error || "—"}</td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr><td colSpan={6} className="p-4 text-center text-slate-400">لا توجد سجلات بريد {status ? "بهذه الحالة" : ""}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages !== null && totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between text-sm text-slate-300">
                <span>صفحة {pageNum} من {totalPages}</span>
                <div className="flex gap-2">
                  {pageNum > 1 && (
                    <Link href={`/admin/messaging?${new URLSearchParams({ ...(status ? { status } : {}), page: String(pageNum - 1) })}`} className="rounded bg-slate-700 px-3 py-1 text-white">السابق</Link>
                  )}
                  {pageNum < totalPages && (
                    <Link href={`/admin/messaging?${new URLSearchParams({ ...(status ? { status } : {}), page: String(pageNum + 1) })}`} className="rounded bg-slate-700 px-3 py-1 text-white">التالي</Link>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </AdminCard>
    </div>
  );
}
