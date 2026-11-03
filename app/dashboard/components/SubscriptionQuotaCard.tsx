"use client";

import { useEffect, useState } from "react";

interface UsageData {
  ok: boolean;
  planKey: string;
  daily: { used: number; limit: number; resetAt: string | null };
  monthly: { used: number; limit: number; resetAt: string | null };
}

export default function SubscriptionQuotaCard() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/usage", { credentials: "include" });
        if (!res.ok) throw new Error("usage fetch failed");
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="p-4 text-sm text-gray-500">Loading quota…</div>;
  if (!data) return null;

  const dailyPct = data.daily.limit > 0 ? Math.min(100, (data.daily.used / data.daily.limit) * 100) : 0;
  const monthlyPct = data.monthly.limit > 0 ? Math.min(100, (data.monthly.used / data.monthly.limit) * 100) : 0;

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Message Quota</h3>
        <span className="text-xs text-gray-500">Plan: {data.planKey}</span>
      </div>

      <div>
        <div className="flex justify-between text-sm mb-1">
          <span>Daily</span>
          <span>{data.daily.used} / {data.daily.limit === -1 ? "∞" : data.daily.limit}</span>
        </div>
        <div className="h-2 w-full rounded bg-gray-200 overflow-hidden">
          <div className="h-full bg-blue-500" style={{ width: `${dailyPct}%` }} />
        </div>
        {data.daily.resetAt && (
          <p className="text-xs text-gray-400 mt-1">Resets: {new Date(data.daily.resetAt).toLocaleString()}</p>
        )}
      </div>

      <div>
        <div className="flex justify-between text-sm mb-1">
          <span>Monthly</span>
          <span>{data.monthly.used} / {data.monthly.limit === -1 ? "∞" : data.monthly.limit}</span>
        </div>
        <div className="h-2 w-full rounded bg-gray-200 overflow-hidden">
          <div className="h-full bg-emerald-500" style={{ width: `${monthlyPct}%` }} />
        </div>
        {data.monthly.resetAt && (
          <p className="text-xs text-gray-400 mt-1">Resets: {new Date(data.monthly.resetAt).toLocaleString()}</p>
        )}
      </div>
    </div>
  );
}
