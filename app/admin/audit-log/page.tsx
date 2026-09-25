import Link from "next/link";
import { Filter, ScrollText, Search } from "lucide-react";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import { createServiceClient } from "@/lib/supabase/admin";
import { AdminCard, AdminNotice, AdminPageHeader, AdminTableWrap } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

interface AuditRow {
  id: string;
  actor_email: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: unknown;
  timestamp: string;
  result: string;
}

function formatDetails(details: unknown): string {
  if (!details) return "—";
  try {
    const obj = typeof details === "string" ? JSON.parse(details) : details;
    if (obj && typeof obj === "object") return JSON.stringify(obj, null, 2);
    return String(obj);
  } catch {
    return String(details);
  }
}

/**
 * 📜 سجل العمليات — كان موجود كصفحة، والمرحلة 1 ضافت له:
 *   ١. فرض صلاحية السيرفر (audit.read) — كان محميًا بالدخول بس.
 *   ٢. قراءة بـservice_role لو المفتاح متاح (تتجاوز RLS) مع fallback لجلسة الأدمن.
 *   ٣. عرض حقل التفاصيل فعلًا (النسخة القديمة كانت بتعرضه من غير ما تطلبه في الـselect).
 *
 * Phase 4.6: فلترة حقيقية على السيرفر عبر query params (الإجراء/النتيجة/
 * المسؤول/نوع المورد/التاريخ) + pagination (page) + تفاصيل كاملة (مش 80 حرف).
 * الفلاتر بتتبنى داخل استعلام PG نفسه — مفيش فلترة كلاينت على صفوف مجلوبة.
 * ملاحظة صادقة: before/after كامل يظهر فقط لو الـaction خزّنه في details
 * (مثلًا extend يسجّل previous_expiry/new_expiry و ban يسجّل ban_reason).
 */
const PAGE_SIZE = 100;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    action?: string;
    result?: string;
    actor?: string;
    rtype?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const { supabase } = await requireAdminPermission("audit.read");

  // ── قراءة الفلاتر من الـURL (كلها نصية مُقفلة في استعلام PG — server-side)
  const fAction = (sp.action ?? "").trim();
  const fResult = (sp.result ?? "").trim();
  const fActor = (sp.actor ?? "").trim();
  const fRtype = (sp.rtype ?? "").trim();
  const fFrom = (sp.from ?? "").trim();
  const fTo = (sp.to ?? "").trim();
  const pageNum = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const offset = (pageNum - 1) * PAGE_SIZE;
  const hasFilters = Boolean(fAction || fResult || fActor || fRtype || fFrom || fTo);

  const selectCols = "id, actor_email, action, resource_type, resource_id, details, timestamp, result";
  let rows: AuditRow[] = [];
  let totalCount: number | null = null;
  let readError: string | null = null;
  let source = "session (RLS)";

  try {
    const service = createServiceClient();
    source = "service_role";
    let q = service.from("audit_log").select(selectCols, { count: "exact" });
    if (fAction) q = q.eq("action", fAction);
    if (fResult) q = q.eq("result", fResult);
    if (fActor) q = q.ilike("actor_email", `%${fActor}%`);
    if (fRtype) q = q.eq("resource_type", fRtype);
    if (fFrom) q = q.gte("timestamp", fFrom);
    if (fTo) q = q.lte("timestamp", `${fTo}T23:59:59.999Z`);
    const { data, error, count } = await q
      .order("timestamp", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows = (data ?? []) as AuditRow[];
    totalCount = count;
  } catch (serviceError) {
    try {
      let q = supabase.from("audit_log").select(selectCols, { count: "exact" });
      if (fAction) q = q.eq("action", fAction);
      if (fResult) q = q.eq("result", fResult);
      if (fActor) q = q.ilike("actor_email", `%${fActor}%`);
      if (fRtype) q = q.eq("resource_type", fRtype);
      if (fFrom) q = q.gte("timestamp", fFrom);
      if (fTo) q = q.lte("timestamp", `${fTo}T23:59:59.999Z`);
      const { data, error, count } = await q
        .order("timestamp", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      rows = (data ?? []) as AuditRow[];
      totalCount = count;
    } catch (e) {
      source = "unavailable";
      readError =
        ((serviceError as { message?: string })?.message || "service_role unavailable") +
        " | " +
        ((e as { message?: string })?.message || "RLS read failed");
    }
  }

  /** رابط صفحات/فلاتر محفوظ (Pagination بيحافظ على الفلاتر الحالية) */
  const pageHref = (page: number): string => {
    const u = new URLSearchParams();
    if (fAction) u.set("action", fAction);
    if (fResult) u.set("result", fResult);
    if (fActor) u.set("actor", fActor);
    if (fRtype) u.set("rtype", fRtype);
    if (fFrom) u.set("from", fFrom);
    if (fTo) u.set("to", fTo);
    if (page > 1) u.set("page", String(page));
    const qs = u.toString();
    return qs ? `/admin/audit-log?${qs}` : "/admin/audit-log";
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="سجل العمليات — Audit Log"
        subtitle="كل العمليات الحساسة: المُنفِّذ، الإجراء، المورد، التفاصيل، النتيجة."
        badge="حساس"
        permissionKey="audit.read"
      />

      {/* Phase 4.6: فلترة حقيقية عبر query params — بتُبنى داخل استعلام PG (server-side) */}
      <AdminCard title="فلاتر (تُطبَّق على السيرفر)" tone="default">
        <form method="GET" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400">الإجراء (action)</span>
            <input
              name="action"
              type="text"
              defaultValue={fAction}
              placeholder="users.ban / subscriptions.manage…"
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono w-52"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400">النتيجة</span>
            <select
              name="result"
              defaultValue={fResult}
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100"
            >
              <option value="">الكل</option>
              <option value="PASS">PASS</option>
              <option value="FAIL">FAIL</option>
              <option value="BLOCKED">BLOCKED</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400">المسؤول (الإيميل يحوي…)</span>
            <input
              name="actor"
              type="text"
              defaultValue={fActor}
              placeholder="admin@…"
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono w-44"
              dir="ltr"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400">نوع المورد</span>
            <input
              name="rtype"
              type="text"
              defaultValue={fRtype}
              placeholder="subscription / user…"
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono w-36"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400">من تاريخ</span>
            <input name="from" type="date" defaultValue={fFrom} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100" dir="ltr" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400">إلى تاريخ</span>
            <input name="to" type="date" defaultValue={fTo} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-100" dir="ltr" />
          </label>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold px-4 py-2 rounded-lg text-xs"
          >
            <Search size={13} /> تطبيق
          </button>
          {hasFilters ? (
            <Link href="/admin/audit-log" className="text-xs text-slate-400 underline hover:text-amber-300 py-2">
              مسح الفلاتر
            </Link>
          ) : null}
        </form>
        <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1">
          <Filter size={11} /> الفلاتر في الـURL (قابلة للمشاركة) ومحسوبة داخل استعلام PG نفسه قبل الجلب.
        </p>
      </AdminCard>

      <AdminCard
        title={
          totalCount !== null
            ? `${totalCount} عملية مطابقة${hasFilters ? " (مفلترة)" : ""} — صفحة ${pageNum} (المصدر: ${source})`
            : `آخر ${PAGE_SIZE} عملية${hasFilters ? " (مفلترة)" : ""} — صفحة ${pageNum} (المصدر: ${source})`
        }
        tone="amber"
      >
        {readError ? (
          <AdminNotice tone="rose">
            تعذّر قراءة <code>audit_log</code>: {readError} — <strong>غير قابل للتحقق من هنا</strong>.
            تأكد من تنفيذ <code>db/epic2-admin-rbac-audit-schema.sql</code> على Supabase ومن وجود <code>SUPABASE_SERVICE_ROLE_KEY</code>.
          </AdminNotice>
        ) : rows.length === 0 ? (
          <AdminNotice tone="amber">
            الجدول موجود لكن مفيش صفوف — مفيش عملية حساسة مسجّلة لحد الآن (أو الجلسة قرأت صفر صفوف بسبب RLS).
          </AdminNotice>
        ) : (
          <AdminTableWrap>
            <thead>
              <tr className="bg-slate-950/60 text-amber-300">
                <th className="text-right px-3 py-2">المُنفِّذ</th>
                <th className="text-right px-3 py-2">الإجراء</th>
                <th className="text-right px-3 py-2">المورد</th>
                <th className="text-right px-3 py-2">التفاصيل</th>
                <th className="text-right px-3 py-2">التاريخ</th>
                <th className="text-right px-3 py-2">النتيجة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((log) => (
                <tr key={log.id} className="border-t border-slate-800 hover:bg-slate-800/30">
                  <td className="p-3 font-mono text-[10px] text-slate-400" dir="ltr">{log.actor_email || "—"}</td>
                  <td className="p-3 font-bold text-amber-300 font-mono text-[10px]">{log.action}</td>
                  <td className="p-3 text-slate-500 font-mono text-[10px]">
                    {log.resource_type || "—"}:{log.resource_id ? log.resource_id.slice(0, 8) : "—"}
                  </td>
                  <td className="p-3 text-[10px] text-slate-400">
                    <pre className="whitespace-pre-wrap max-w-md max-h-40 overflow-auto bg-slate-950/50 rounded p-1.5 font-mono text-[10px] leading-relaxed" dir="ltr">
                      {formatDetails(log.details)}
                    </pre>
                  </td>
                  <td className="p-3 text-[10px] text-slate-500">{new Date(log.timestamp).toLocaleString("ar-EG")}</td>
                  <td className="p-3">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        log.result === "PASS"
                          ? "bg-emerald-500/10 text-emerald-300"
                          : log.result === "BLOCKED"
                            ? "bg-rose-500/10 text-rose-300"
                            : "bg-amber-500/10 text-amber-300"
                      }`}
                    >
                      {log.result}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </AdminTableWrap>
        )}

        {/* Phase 4.6: pagination بيحافظ على الفلاتر (100 صف/صفحة) */}
        {totalCount !== null && totalCount > PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-700 text-xs">
            {pageNum > 1 ? (
              <Link href={pageHref(pageNum - 1)} className="text-amber-300 hover:text-amber-200 underline">
                ← الصفحة السابقة
              </Link>
            ) : (
              <span className="text-slate-600">أول صفحة</span>
            )}
            <span className="text-slate-400">
              صفحة {pageNum} من {Math.ceil(totalCount / PAGE_SIZE)} (إجمالي {totalCount})
            </span>
            {pageNum * PAGE_SIZE < totalCount ? (
              <Link href={pageHref(pageNum + 1)} className="text-amber-300 hover:text-amber-200 underline">
                الصفحة التالية →
              </Link>
            ) : (
              <span className="text-slate-600">آخر صفحة</span>
            )}
          </div>
        ) : null}

        <AdminNotice tone="default" title="نطاق التفاصيل (صادق)">
          <ul className="list-disc pr-5 space-y-1">
            <li>
              التفاصيل المعروضة الآن <strong>كاملة</strong> (JSON كامل مش 80 حرف) — بما فيها{" "}
              <code>previous_expiry/new_expiry</code> من التمديد و<code>ban_reason</code> من الحظر.
            </li>
            <li>
              before/after لكل عملية يظهر فقط لو الـaction خزّن الفرق في <code>details</code> — لا نخترع بيانات
              غير مسجّلة.
            </li>
          </ul>
        </AdminNotice>
      </AdminCard>

      <AdminNotice tone="default">
        <ScrollText size={12} className="inline" /> الكتابة في السجل بتحصل من السيرفر عبر <code>recordAuditLog()</code> بـservice_role —
        ومفيش أي insert من المتصفح (سياسة RLS تمنعها).
      </AdminNotice>
    </div>
  );
}
