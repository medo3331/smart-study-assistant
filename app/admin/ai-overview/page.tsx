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
        if (!j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        setData(j);
      })
      .catch((e) => setErr(e?.message || "تعذّر جلب البيانات"));
  }, []);

  if (!data && err) return <div className="p-6"><AdminNotice tone="rose">{err}</AdminNotice></div>;
  if (!data) return <div className="p-6">جاري التحميل…</div>;


  const o = data.overview ?? {};
  const limits = data.limits ?? {};
  const models = data.models ?? [];
  const agents = data.agents ?? [];
  const system = data.system ?? {};
  const providers = data.providers ?? {};
  const tasks = data.tasks ?? [];
  const format = (value: unknown) => value == null ? "غير متاح" : String(value);

  return (

    <div className="space-y-6 p-6">
      <AdminPageHeader title="AI Overview" subtitle="نظرة عامة على استخدام الذكاء الاصطناعي والحدود والنماذج" badge="ai" permissionKey="admin" />
       {!data.usageAvailable ? <AdminNotice tone="amber">تعذر الوصول لقاعدة بيانات سجل الاستخدام. ستظهر بيانات السجل البرمجي والموديلات؛ أرقام الاستخدام أدناه غير متاحة وليست صفرًا.</AdminNotice> : null}
       {data.dbError ? <AdminNotice tone="amber">سبب تعذر الاستخدام: {data.dbError}</AdminNotice> : null}
       {err ? <AdminNotice tone="rose">{err}</AdminNotice> : null}


      <AdminCard title="إحصائيات الاستخدام" tone="blue">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <AdminStatCard label="إجمالي الطلبات" value={format(o.totalRequests)} tone="blue" />
          <AdminStatCard label="آخر 24 ساعة" value={format(o.last24h)} tone="emerald" />
          <AdminStatCard label="آخر 3 ساعات" value={format(o.last3h)} tone="amber" />
          <AdminStatCard label="Entitlements" value={format(o.entitlements)} tone="purple" />
          <AdminStatCard label="Nemotron Super (24h)" value={format(o.super24h)} tone="default" />
          <AdminStatCard label="Nemotron Ultra (24h)" value={format(o.ultra24h)} tone="default" />
          <AdminStatCard label="ضيوف (24h)" value={format(o.guest24h)} tone="default" />
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
            <tr><th>النموذج</th><th>المزوّد</th><th>التفعيل/الاختيار</th><th>حالة التهيئة</th><th>القدرات</th><th>المهام</th><th>Gated</th></tr>
          </thead>
          <tbody>
            {models.map((m: any) => (
              <tr key={m.id}>
                <td className="font-mono text-[10px]" title={m.id}>{m.displayName || m.id}</td>
                <td>{m.provider}</td>
                <td>{m.enabled ? (m.selectableByConfiguration ? "مفعّل · قابل للاختيار" : "مفعّل · مدفوع/مقيد") : "معطّل"}</td>
                <td>{m.providerConfigured ? `مهيأ · ${m.providerHealth}` : "مفتاح غير مهيأ"}</td>
                <td>{(m.capabilities || []).join("، ") || "—"}</td>
                <td>{(m.tasks || []).join("، ") || "—"}</td>
                <td>{m.gated ? (m.entitlement || "gated") : "—"}</td>
              </tr>
            ))}
            {models.length === 0 && <tr><td colSpan={7} className="text-center py-4">لا توجد نماذج.</td></tr>}
          </tbody>
        </AdminTableWrap>
      </AdminCard>

      <AdminCard title={`المزوّدون وحالة التشغيل (${Object.keys(providers).length})`} tone="blue">
        <AdminTableWrap>
          <thead><tr><th>المزوّد</th><th>الإعداد</th><th>الصحة المرصودة</th><th>نتائج حقيقية في هذه العملية</th><th>آخر نجاح</th></tr></thead>
          <tbody>{Object.entries(providers).map(([name, provider]: [string, any]) => <tr key={name}><td>{name}</td><td>{provider.configured ? "المفتاح موجود" : "غير مهيأ"}</td><td>{provider.healthStatus === "NOT_CHECKED" ? "لم يُفحص/لا توجد نتيجة مرصودة" : provider.healthStatus}</td><td>{provider.observedInThisProcess ? `${provider.successCount} نجاح · ${provider.failureCount} فشل` : "لا توجد بيانات مرصودة"}</td><td>{provider.lastSuccessAt ? new Date(provider.lastSuccessAt).toLocaleString() : "غير متاح"}</td></tr>)}</tbody>
        </AdminTableWrap>
        <p className="mt-2 text-xs text-slate-400">الحالة المرصودة داخل العملية قد تُصفّر عند إعادة تشغيل الخادم أو تختلف بين النسخ؛ وجود المفتاح لا يثبت أن اتصال المزوّد يعمل الآن.</p>
      </AdminCard>

      <AdminCard title={`توجيه المهام (${tasks.length})`} tone="amber">
        <AdminTableWrap><thead><tr><th>المهمة</th><th>ترتيب النماذج</th></tr></thead><tbody>{tasks.map((task: any) => <tr key={task.task}><td>{task.task}</td><td className="font-mono text-[10px]">{task.modelIds.join(" ← ")}</td></tr>)}</tbody></AdminTableWrap>
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