"use client";
import { useEffect, useState } from "react";

type ServiceUsage = { id: string; label: string; limit: number; used: number; remaining: number };
type QuotaData = { tier: string; credits: number; services: ServiceUsage[] };

export function PlanQuotaCard() {
  const [data, setData] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me/plan-quota")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="rounded-2xl border p-4 text-sm opacity-70">جاري تحميل معلومات الباقة…</div>;
  if (!data) return null;

  const tierLabel = data.tier === "ultra" ? "Ultra" : data.tier === "pro" ? "Pro" : "Free";

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">الباقة والحدود</h3>
        <span className="text-xs rounded-full border px-2 py-1">{tierLabel}</span>
      </div>
      <div className="text-sm">الرصيد (credits): <b>{data.credits}</b></div>
      <div className="space-y-2">
        {data.services.map((s) => (
          <div key={s.id} className="text-xs">
            <div className="flex justify-between">
              <span>{s.label}</span>
              <span>{s.used}/{s.limit === 1000 ? "∞" : s.limit}</span>
            </div>
            <div className="h-1.5 rounded bg-gray-200 overflow-hidden">
              <div
                className="h-full bg-blue-500"
                style={{ width: `${s.limit ? Math.min(100, (s.used / (s.limit === 1000 ? s.used + 1 : s.limit)) * 100) : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}