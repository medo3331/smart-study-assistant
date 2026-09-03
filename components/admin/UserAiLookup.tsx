"use client";
import { useState } from "react";

export default function UserAiLookup() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function lookup() {
    if (!input.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const isEmail = input.includes("@");
      const body = isEmail ? { email: input.trim() } : { userId: input.trim() };
      const res = await fetch("/api/admin/user-ai-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.code || "فشل");
      setResult(json);
    } catch (e: any) { setError(e.message || "خطأ"); } finally { setLoading(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input value={input} onChange={e=>setInput(e.target.value)} placeholder="User ID أو email@example.com" className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-400 font-mono" />
        <button onClick={lookup} disabled={loading || !input.trim()} className="bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl text-sm">بحث</button>
      </div>
      {error && <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">{error}</p>}
      {result && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3 text-sm">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="bg-slate-700 px-2 py-1 rounded font-mono">{result.user.id.slice(0,8)}...</span>
            {result.user.email && <span className="bg-slate-700 px-2 py-1 rounded">{result.user.email}</span>}
            {result.user.isAnonymous && <span className="bg-amber-500/20 text-amber-400 px-2 py-1 rounded">Guest (anon)</span>}
            {!result.user.isAnonymous && <span className="bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded">User</span>}
            <span className="bg-slate-700 px-2 py-1 rounded">رصيد: {result.credits.balance}</span>
            {result.credits.hasPremium && <span className="bg-amber-500/20 text-amber-400 px-2 py-1 rounded">Premium</span>}
            {result.credits.hasAdvanced && <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded">advanced-study</span>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-slate-900 rounded-xl p-3 border border-slate-700">
              <p className="text-xs text-slate-400">Phase A — Text 30/2h</p>
              <p className="text-lg font-bold">{result.rateLimits.phaseA.text.used} / {result.rateLimits.phaseA.text.limit} <span className="text-xs font-normal text-slate-400">متبقي {result.rateLimits.phaseA.text.remaining}</span></p>
            </div>
            <div className="bg-slate-900 rounded-xl p-3 border border-slate-700">
              <p className="text-xs text-slate-400">Phase A — Vision 6/5h</p>
              <p className="text-lg font-bold">{result.rateLimits.phaseA.vision.used} / {result.rateLimits.phaseA.vision.limit} <span className="text-xs font-normal text-slate-400">متبقي {result.rateLimits.phaseA.vision.remaining}</span></p>
            </div>
            <div className="bg-slate-900 rounded-xl p-3 border border-slate-700">
              <p className="text-xs text-slate-400">Phase C — Guest 5/24h</p>
              <p className="text-lg font-bold">{result.rateLimits.phaseC ? `${result.rateLimits.phaseC.guest.used} / ${result.rateLimits.phaseC.guest.limit}` : "— (user عادي)"}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-slate-900 rounded-xl p-3 border border-slate-700">
              <p className="text-xs text-slate-400">Super 5/24h</p>
              <p className="font-bold">{result.rateLimits.phaseB.super.used} / {result.rateLimits.phaseB.super.limit} <span className="text-xs text-slate-400">متبقي {result.rateLimits.phaseB.super.remaining}</span></p>
            </div>
            <div className="bg-slate-900 rounded-xl p-3 border border-slate-700">
              <p className="text-xs text-slate-400">Ultra 3/24h</p>
              <p className="font-bold">{result.rateLimits.phaseB.ultra.used} / {result.rateLimits.phaseB.ultra.limit} <span className="text-xs text-slate-400">متبقي {result.rateLimits.phaseB.ultra.remaining}</span></p>
            </div>
          </div>
          {result.entitlements && result.entitlements.length>0 && <p className="text-xs text-slate-400">Entitlements: {result.credits.entitlements.map((e:any)=>`${e.kind}:${e.value}`).join(", ")}</p>}
          <div>
            <p className="text-xs text-slate-400 mb-1">آخر 5 عمليات:</p>
            <div className="space-y-1">
              {(result.recent||[]).slice(0,5).map((r:any,i:number)=><div key={i} className="text-xs font-mono bg-slate-900 p-2 rounded border border-slate-700 flex justify-between"><span>{new Date(r.created_at).toLocaleString("ar-EG")} — {r.metadata?.model || r.metadata?.kind || "text"}</span><span className={r.delta<0?"text-rose-400":"text-emerald-400"}>{r.delta}</span></div>)}
              {result.recent.length===0 && <p className="text-xs text-slate-500">لا يوجد سجل</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
