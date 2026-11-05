import { requireAdminPermission } from "@/lib/admin/auth-check";
import { isPgConfigured, pgQuery } from "@/lib/admin/pg";
import { AdminCard, AdminNotice, AdminPageHeader, AdminStatCard, AdminTableWrap } from "@/components/admin/ui";

type Agg = { provider: string | null; model: string | null; status: string; c: string; avglat: string | null };

export default async function AdminAiTelemetryPage() {
  await requireAdminPermission("users.read");
  const pgReady = isPgConfigured();
  let rows: Agg[] = [];
  let total = 0;
  let failed = 0;
  if (pgReady) {
    try {
      rows = await pgQuery<Agg>(`
        SELECT provider, model, status, count(*)::text c, avg(latency_ms)::text avglat
        FROM public.ai_usage_events
        GROUP BY provider, model, status
        ORDER BY count(*) DESC
        LIMIT 100
      `);
      const t = await pgQuery<{ c: string }>(`SELECT count(*)::text c FROM public.ai_usage_events`);
      const f = await pgQuery<{ c: string }>(`SELECT count(*)::text c FROM public.ai_usage_events WHERE status <> 'completed'`);
      total = parseInt(t[0]?.c || "0", 10);
      failed = parseInt(f[0]?.c || "0", 10);
    } catch {}
  }
  return (
    <div className="space-y-6">
      <AdminPageHeader title="AI Telemetry" subtitle="استخدام مزودي AI والأخطاء (من ai_usage_events)" badge="ai" permissionKey="users.read" />
      {!pgReady ? <AdminNotice tone="amber">DATABASE_URL غير متاح.</AdminNotice> : null}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <AdminStatCard label="إجمالي المحاولات" value={pgReady ? total : "N/A"} hint="ai_usage_events" tone="blue" />
        <AdminStatCard label="الفاشلة" value={pgReady ? failed : "N/A"} hint="status != completed" tone="rose" />
        <AdminStatCard label="نسبة النجاح" value={pgReady && total ? `${Math.round(((total - failed) / total) * 100)}%` : "N/A"} hint="تقدير" tone="emerald" />
      </div>
      <AdminCard title="تفصيل حسب مزود/موديل/حالة" tone="default">
        <AdminTableWrap>
          <table className="w-full text-sm">
            <thead><tr><th>Provider</th><th>Model</th><th>Status</th><th>Count</th><th>Avg latency ms</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.provider || "-"}</td>
                  <td>{r.model || "-"}</td>
                  <td>{r.status}</td>
                  <td>{r.c}</td>
                  <td>{r.avglat ? Math.round(Number(r.avglat)) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableWrap>
      </AdminCard>
      <AdminNotice tone="default">
        تكلفة Tokens (cost) unavailable — لا توجد بيانات أسعار/تكلفة في الـschema. راجع ai_usage_events (prompt_tokens/completion_tokens) لحساب لاحق.
      </AdminNotice>
    </div>
  );
}
