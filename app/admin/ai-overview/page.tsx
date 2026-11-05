"use client";
import { useEffect, useState } from "react";
import { AdminPageHeader, AdminCard, AdminStatCard, AdminNotice, AdminTableWrap } from "@/components/admin/ui";

export default function AdminAiOverviewPage() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/admin/ai-overview")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        setData(j);
      })
      .catch((e) => setErr(e?.message || "تعذّر جلب البيانات"));
  }, []);

  if (err) return <div className="p-6"><AdminNotice tone="rose">{err}</AdminNotice></div>;
  if (!data) return <div className="p-6">جاري التحميل…</div>;


  const o = data.overview ?? {};
  const limits = data.limits ?? {};
  const models = data.models ?? [];
  const agents = data.agents ?? [];
  const system = data.system ?? {};

  return (

    <div className="space-y-6 p-6">
      <AdminPageHeader title="AI Overview" subtitle="نظرة عامة على استخدام الذكاء الاصطناعي والحدود والنماذج" badge="ai" permissionKey="admin" />
       {data.dbError ? <AdminNotice tone="amber">تحذير: {data.dbError}</AdminNotice> : null}


      <AdminCard title="إحصائيات الاستخدام" tone="blue">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <AdminStatCard label="إجمالي الطلبات" value={o.totalRequests ?? 0} tone="blue" />
          <AdminStatCard label="آخر 24 ساعة" value={o.last24h ?? 0} tone="emerald" />
          <AdminStatCard label="آخر 3 ساعات" value={o.last3h ?? 0} tone="amber" />
          <AdminStatCard label="Entitlements" value={o.entitlements ?? 0} tone="purple" />
          <AdminStatCard label="Nemotron Super (24h)" value={o.super24h ?? 0} tone="default" />
          <AdminStatCard label="Nemotron Ultra (24h)" value={o.ultra24h ?? 0} tone="default" />
          <AdminStatCard label="ضيوف (24h)" value={o.guest24h ?? "N/A"} tone="default" />
        </div>
      </AdminCard>

      <AdminCard title="الحدود (Limits)" tone="amber">
        <AdminTableWrap>
          <thead>
            <tr><th>القسم</th><th>الحد</th><th>النافذة (ساعات)</th></tr>
          </thead>
          <tbody>
            <tr><td>نص (Phase A)</td><td>{limits?.phaseA?.text?.limit ?? "—"}</td><td>{limits?.phaseA?.text?.windowHours ?? "—"}</td></tr>
            <tr><td>رؤية (Phase A)</td><td>{limits?.phaseA?.vision?.limit ?? "—"}</td><td>{limits?.phaseA?.vision?.windowHours ?? "—"}</td></tr>
            <tr><td>ضيف (Phase C)</td><td>{limits?.phaseC?.guest?.limit ?? "—"}</td><td>{limits?.phaseC?.guest?.windowHours ?? "—"}</td></tr>
          </tbody>
        </AdminTableWrap>
      </AdminCard>

      <AdminCard title={`النماذج (${models.length})`} tone="default">
        <AdminTableWrap>
          <thead>
            <tr><th>النموذج</th><th>المزوّد</th><th>مفعّل</th><th>Free Endpoint</th><th>Gated</th></tr>
          </thead>
          <tbody>
            {models.map((m: any) => (
              <tr key={m.id}>
                <td className="font-mono text-[10px]">{m.displayName || m.id}</td>
                <td>{m.provider}</td>
                <td>{m.enabled ? "✓" : "—"}</td>
                <td>{m.freeEndpoint ? "✓" : "—"}</td>
                <td>{m.gated ? (m.entitlement || "gated") : "—"}</td>
              </tr>
            ))}
            {models.length === 0 && <tr><td colSpan={5} className="text-center py-4">لا توجد نماذج.</td></tr>}
          </tbody>
        </AdminTableWrap>
      </AdminCard>

      <AdminCard title={`الوكلاء (Agents) (${agents.length})`} tone="purple">
        <AdminTableWrap>
          <thead>
            <tr><th>المعرّف</th><th>التسمية</th><th>الحالة</th><th>الأولوية</th></tr>
          </thead>
          <tbody>
            {agents.map((a: any) => (
              <tr key={a.id}>
                <td className="font-mono text-[10px]">{a.id}</td>
                <td>{a.label}</td>
                <td>{a.status}</td>
                <td>{a.priority}</td>
              </tr>
            ))}
            {agents.length === 0 && <tr><td colSpan={4} className="text-center py-4">لا توجد وكلاء.</td></tr>}
          </tbody>
        </AdminTableWrap>
      </AdminCard>

      <AdminCard title="معلومات النظام" tone="default">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>النماذج المسجّلة: <strong>{system.modelRegistrySize ?? 0}</strong></div>
          <div>المفعّلة: <strong>{system.enabledModels ?? 0}</strong></div>
          <div>Gated: <strong>{system.gatedCount ?? 0}</strong></div>
          <div>الوكلاء: <strong>{system.agentCount ?? 0}</strong></div>
        </div>
      </AdminCard>

      {Array.isArray(o.recentLogs) && o.recentLogs.length > 0 && (
        <AdminCard title={`آخر السجلات (${o.recentLogs.length})`} tone="default">
          <AdminTableWrap>
            <thead>
              <tr><th>المستخدم</th><th>Agent</th><th>Provider</th><th>التاريخ</th></tr>
            </thead>
            <tbody>
              {o.recentLogs.map((l: any) => (
                <tr key={l.id}>
                  <td className="font-mono text-[10px]">{l.user_id}</td>
                  <td>{l.agent}</td>
                  <td>{l.provider}</td>
                  <td>{l.created_at ? new Date(l.created_at).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </AdminTableWrap>
        </AdminCard>
      )}
    </div>
  );
}