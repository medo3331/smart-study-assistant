"use client";
import { useEffect, useRef, useState } from "react";
import { sendAdminMessage } from "@/app/admin/actions/messaging";
import { searchUsers, type UserSearchResult } from "@/app/admin/actions/users-search";

type Mode = "all" | "user";

export default function MessagingComposer() {
  const [mode, setMode] = useState<Mode>("all");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [target, setTarget] = useState<UserSearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mode !== "user") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!query.trim()) { setResults([]); setSearching(false); return; }
      setSearching(true);
      try {
        const users = await searchUsers(query.trim(), "all", "all", "all");
        setResults(users.slice(0, 8));
      } finally { setSearching(false); }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, mode]);

  async function submit() {
    if (busy) return;
    if (!subject.trim() || !body.trim()) { setResult({ ok: false, text: "الموضوع والنص مطلوبان." }); return; }
    if (mode === "user" && !target) { setResult({ ok: false, text: "اختر المستخدم المستهدف أولًا." }); return; }
    setBusy(true); setResult(null);
    try {
      const r = await sendAdminMessage({ subject, body, targetUserId: mode === "user" ? target!.id : null, sendEmail });
      if (r.ok) {
        setResult({ ok: true, text: `تم الإرسال إلى ${r.recipients ?? 0} مستخدم داخل المنصة${sendEmail ? " + محاولة إرسال بريد" : ""}.` });
        setSubject(""); setBody(""); setTarget(null); setQuery("");
      } else {
        setResult({ ok: false, text: r.error || "فشل الإرسال." });
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex gap-2">
        <button onClick={() => { setMode("all"); setTarget(null); }} className={`rounded px-4 py-2 text-sm font-bold ${mode === "all" ? "bg-amber-500 text-slate-900" : "bg-slate-700 text-slate-100"}`}>👥 كل المستخدمين</button>
        <button onClick={() => setMode("user")} className={`rounded px-4 py-2 text-sm font-bold ${mode === "user" ? "bg-amber-500 text-slate-900" : "bg-slate-700 text-slate-100"}`}>👤 مستخدم محدد</button>
      </div>

      {mode === "user" && (
        <div className="space-y-2">
          {target ? (
            <div className="flex items-center justify-between rounded border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-100">
              <span>{target.display_name || target.email} {target.email ? <span dir="ltr" className="text-xs text-slate-300">({target.email})</span> : null}</span>
              <button onClick={() => setTarget(null)} className="text-rose-300">تغيير ×</button>
            </div>
          ) : (
            <>
              <input className="w-full rounded border border-slate-600 bg-slate-800 p-2 text-slate-100" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔎 ابحث بالاسم أو البريد أو الكود…" />
              {searching && <p className="text-xs text-slate-400">جارٍ البحث…</p>}
              {results.length > 0 && (
                <div className="max-h-48 overflow-auto rounded border border-slate-700">
                  {results.map((u) => (
                    <button key={u.id} onClick={() => { setTarget(u); setResults([]); setQuery(""); }} className="block w-full border-t border-slate-800 p-2 text-right text-sm text-slate-100 first:border-t-0 hover:bg-slate-800">
                      {u.display_name || "—"} <span dir="ltr" className="text-xs text-slate-400">{u.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <input className="w-full rounded border border-slate-600 bg-slate-800 p-2 text-slate-100" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="الموضوع" maxLength={200} />
      <textarea className="min-h-[160px] w-full rounded border border-slate-600 bg-slate-800 p-3 leading-relaxed text-slate-100" value={body} onChange={(e) => setBody(e.target.value)} placeholder="نص الرسالة…" maxLength={10000} />

      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> إرسال بريد إلكتروني أيضًا (Resend)
      </label>

      <button onClick={submit} disabled={busy} className="rounded bg-amber-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
        {busy ? "جارٍ الإرسال…" : "إرسال"}
      </button>

      {result && (
        <p className={`rounded border p-3 text-sm ${result.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-rose-500/40 bg-rose-500/10 text-rose-200"}`}>
          {result.text}
        </p>
      )}
    </div>
  );
}
