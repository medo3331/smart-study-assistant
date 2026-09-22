import { ScrollText } from "lucide-react";
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

function summarizeDetails(details: unknown): string {
  if (!details) return "—";
  try {
    const obj = typeof details === "string" ? JSON.parse(details) : details;
    if (obj && typeof obj === "object") {
      const rec = obj as Record<string, unknown>;
      const parts = [rec.reason, rec.plan_key, rec.status, rec.enabled_target, rec.reward_type]
        .filter((v) => v !== undefined && v !== null && v !== "")
        .map((v) => String(v));
      if (parts.length) return parts.join(" · ");
      return JSON.stringify(rec).slice(0, 80);
    }
    return String(obj).slice(0, 80);
  } catch {
    return String(details).slice(0, 80);
  }
}

/**
 * 📜 سجل العمليات — كان موجود كصفحة، والمرحلة 1 ضافت له:
 *   ١. فرض صلاحية السيرفر (audit.read) — كان محميًا بالدخول بس.
 *   ٢. قراءة بـservice_role لو المفتاح متاح (تتجاوز RLS) مع fallback لجلسة الأدمن.
 *   ٣. عرض حقل التفاصيل فعلًا (النسخة القديمة كانت بتعرضه من غير ما تطلبه في الـselect).
 *
 * ⚠️ الفلترة الحقيقية (نوع/تاريخ/مسؤول) وتفاصيل before/after = المرحلة 4.
 */
export default async function AuditLogPage() {
  const { supabase } = await requireAdminPermission("audit.read");

  const selectCols = "id, actor_email, action, resource_type, resource_id, details, timestamp, result";
  let rows: AuditRow[] = [];
  let readError: string | null = null;
  let source = "session (RLS)";

  try {
    const service = createServiceClient();
    source = "service_role";
    const { data, error } = await service.from("audit_log").select(selectCols).order("timestamp", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    rows = (data ?? []) as AuditRow[];
  } catch (serviceError) {
    try {
      const { data, error } = await supabase.from("audit_log").select(selectCols).order("timestamp", { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      rows = (data ?? []) as AuditRow[];
    } catch (e) {
      source = "unavailable";
      readError =
        ((serviceError as { message?: string })?.message || "service_role unavailable") +
        " | " +
        ((e as { message?: string })?.message || "RLS read failed");
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="سجل العمليات — Audit Log"
        subtitle="كل العمليات الحساسة: المُنفِّذ، الإجراء، المورد، التفاصيل، النتيجة."
        badge="حساس"
        permissionKey="audit.read"
      />

      <AdminCard title={`آخر 100 عملية (المصدر: ${source})`} tone="amber">
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
                  <td className="p-3 text-[10px] text-slate-400">{summarizeDetails(log.details)}</td>
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

        <AdminNotice tone="default" title="مؤجل للمرحلة 4">
          <ul className="list-disc pr-5 space-y-1">
            <li>فلترة حسب النوع/التاريخ/المسؤول عبر query params فعلية.</li>
            <li>Pagination وعدد أصفف أكبر من 100.</li>
            <li>before/after كامل لكل عملية — محتاج نخزّن الفرق في <code>details</code> من الـactions نفسها.</li>
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
