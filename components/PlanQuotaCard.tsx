"use client";
import { useEffect, useState } from "react";

type ServiceUsage = { id: string; label: string; limit: number; used: number; remaining: number };
type QuotaData = { tier: string; credits: number; messages: { used: number; limit: number }; services: ServiceUsage[] };

const TIER_META: Record<string, { label: string; color: string; badge: string }> = {
  free: { label: "Free", color: "from-slate-500 to-slate-700", badge: "🌱" },
  pro: { label: "Pro", color: "from-violet-500 to-fuchsia-500", badge: "⚡" },
  ultra: { label: "Ultra", color: "from-amber-400 to-orange-500", badge: "🚀" },
};

export function PlanQuotaCard() {
  const [data, setData] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me/plan-quota")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur animate-pulse">
        <div className="h-5 w-40 bg-white/10 rounded mb-3" />
        <div className="h-3 w-full bg-white/10 rounded" />
      </div>
    );
  }
  if (!data) return null;

  const meta = TIER_META[data.tier] ?? TIER_META.free;

  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#13182E] to-[#0D1029] p-5 shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{meta.badge}</span>
          <div>
            <h3 className="font-bold text-lg">الباقة والحدود</h3>
            <p className="text-xs text-[#9AA0C0]">المعلومات محدثة لحظيًا</p>
          </div>
        </div>
        <span className={`text-xs font-bold px-3 py-1 rounded-full bg-gradient-to-r ${meta.color} text-white shadow`}>{meta.label}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
          <p className="text-[11px] text-[#9AA0C0]">الرصيد (credits)</p>
          <p className="text-2xl font-extrabold">{data.credits}</p>
        </div>
        <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
          <p className="text-[11px] text-[#9AA0C0]">رسائل AI (24h)</p>
          <p className="text-2xl font-extrabold">
            {data.messages.used}<span className="text-sm text-[#9AA0C0]">/{data.messages.limit || "∞"}</span>
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold text-[#9AA0C0]">الخدمات اليومية</p>
        {data.services.map((s) => {
          const pct = s.limit && s.limit !== 1000 ? Math.min(100, (s.used / s.limit) * 100) : (s.used > 0 ? 100 : 0);
          const unlimited = s.limit === 1000;
          return (
            <div key={s.id} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-[#E7E9F5]">{s.label}</span>
                <span className="text-[#9AA0C0]">{s.used}/{unlimited ? "∞" : s.limit}</span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${meta.color} transition-all`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}