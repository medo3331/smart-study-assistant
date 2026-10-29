"use client";
import { useEffect, useState } from "react";

export default function AdminAiOverviewPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    fetch("/api/admin/ai-overview").then((r) => r.json()).then(setData).catch(() => setData(null));
  }, []);
  if (!data) return <div className="p-6">جاري التحميل…</div>;
  const o = data.overview ?? {};
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">AI Overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 p-3"><p className="text-xs">Total</p><p className="text-xl font-bold">{o.totalRequests}</p></div>
        <div className="rounded-xl border border-white/10 p-3"><p className="text-xs">24h</p><p className="text-xl font-bold">{o.last24h}</p></div>
        <div className="rounded-xl border border-white/10 p-3"><p className="text-xs">3h</p><p className="text-xl font-bold">{o.last3h}</p></div>
        <div className="rounded-xl border border-white/10 p-3"><p className="text-xs">Entitlements</p><p className="text-xl font-bold">{o.entitlements}</p></div>
      </div>
      <pre className="text-xs bg-black/30 p-3 rounded-xl overflow-auto">{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}