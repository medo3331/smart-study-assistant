"use client";
import { useEffect, useMemo, useState } from "react";

type R = { id: string; email: string; name: string };
type C = { id: string; status: string; recipient_count: number; accepted_count: number; failed_count: number };

export default function AnnouncementEmailCampaignsAdmin() {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [announcementId, setAnnouncementId] = useState("");
  const [query, setQuery] = useState("");
  const [audience, setAudience] = useState("all");
  const [candidates, setCandidates] = useState<R[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [externalText, setExternalText] = useState("");
  const [externals, setExternals] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [sender, setSender] = useState("");
  const [campaign, setCampaign] = useState<C | null>(null);
  const [campaigns, setCampaigns] = useState<C[]>([]);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/announcements?all=1").then((r) => r.json()).then((d) => { if (d.success) setAnnouncements(d.announcements || []); else setMsg(d.error || "Failed to load announcements"); }).catch(() => setMsg("Failed to load announcements"));
    loadCampaigns();
  }, []);

  async function loadCampaigns() {
    const d = await (await fetch("/api/announcement-email-campaigns")).json();
    if (d.success) setCampaigns(d.campaigns || []);
  }

  async function loadRecipients() {
    setBusy(true);
    try {
      const p = new URLSearchParams({ q: query, audience });
      const d = await (await fetch(`/api/announcement-email-campaigns/recipients?${p}`)).json();
      if (d.success) setCandidates(d.recipients || []);
      else setMsg(d.error || "Failed");
    } finally { setBusy(false); }
  }

  useEffect(() => { loadRecipients(); }, [query, audience]);

  function toggle(id: string) { setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function selectAll() { setSelected((prev) => { const n = new Set(prev); candidates.forEach((c) => n.add(c.id)); return n; }); }
  function clearAll() { setSelected(new Set()); }

  function addExternal() {
    const parts = externalText.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const valid = parts.filter((p) => re.test(p) && !externals.includes(p));
    setExternals((prev) => [...prev, ...valid]);
    setExternalText("");
  }

  const selectedRecipients = useMemo(() => candidates.filter((c) => selected.has(c.id)), [candidates, selected]);
  const allEmails = useMemo(() => {
    const s = new Set<string>();
    selectedRecipients.forEach((r) => s.add(r.email));
    externals.forEach((e) => s.add(e));
    return Array.from(s);
  }, [selectedRecipients, externals]);

  async function createCampaign() {
    if (!announcementId || allEmails.length === 0) { setMsg("اختر إعلانًا ومستلمين."); return; }
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/announcement-email-campaigns", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ announcement_id: announcementId, internal_user_ids: selectedRecipients.map((r) => r.id), external_emails: externals, subject: subject || undefined, sender: sender || undefined }),
      });
      const d = await res.json();
      if (!d.success) { setMsg(d.error || "Failed"); return; }
      setCampaign(d.campaign); setPreview(true); loadCampaigns();
    } finally { setBusy(false); }
  }

  async function confirmSend(retryFailed = false) {
    if (!campaign) return;
    if (!window.confirm("تأكيد الإرسال؟ لا يمكن التراجع بسهولة.")) return;
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`/api/announcement-email-campaigns/${campaign.id}/send`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, retry_failed: retryFailed }),
      });
      const d = await res.json();
      if (!d.success) { setMsg(d.error || "Send failed"); return; }
      setMsg(`أُرسل: ${d.accepted}، فشل: ${d.failed}`);
      setPreview(false); loadCampaigns();
    } finally { setBusy(false); }
  }

  const selectedAnnouncement = announcements.find((a) => a.id === announcementId);
  return (
    <div className="space-y-6" dir="rtl">
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-4">
        <h2 className="text-lg font-bold text-amber-300">إرسال إعلان بالبريد</h2>
        <p className="text-sm text-slate-300">نشر الإعلان لا يرسل بريدًا. لن يُرسل أي بريد إلا بعد اختيار المستلمين والضغط على تأكيد الإرسال.</p>

        <div className="space-y-2">
          <label className="text-sm text-slate-200">الإعلان</label>
          <select className="w-full rounded border border-slate-600 bg-slate-800 p-2 text-slate-100" value={announcementId} onChange={(e) => setAnnouncementId(e.target.value)}>
            <option value="">-- اختر --</option>
            {announcements.map((a) => (<option key={a.id} value={a.id}>{a.title} ({a.status})</option>))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-slate-200">عنوان (اختياري)</label>
          <input className="w-full rounded border border-slate-600 bg-slate-800 p-2 text-slate-100" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-slate-200">المرسل (اختياري)</label>
          <input className="w-full rounded border border-slate-600 bg-slate-800 p-2 text-slate-100" value={sender} onChange={(e) => setSender(e.target.value)} placeholder="email@domain.com" />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm text-slate-200">اختصار فئة</label>
            <select className="w-full rounded border border-slate-600 bg-slate-800 p-2 text-slate-100" value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="all">الكل</option>
              <option value="student">الطلاب</option>
              <option value="graduate">الخريجون</option>
              <option value="freelancer">المستقلون</option>
            </select>
          </div>
          <div className="md:col-span-2 space-y-2">
            <label className="text-sm text-slate-200">بحث</label>
            <input className="w-full rounded border border-slate-600 bg-slate-800 p-2 text-slate-100" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث..." />
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={selectAll} className="rounded bg-slate-700 px-3 py-1 text-sm text-slate-100">تحديد كل النتائج</button>
          <button onClick={clearAll} className="rounded bg-slate-700 px-3 py-1 text-sm text-slate-100">إلغاء</button>
        </div>

        <div className="max-h-64 overflow-auto rounded border border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-slate-200"><tr><th className="p-2">اختيار</th><th className="p-2">الاسم</th><th className="p-2">البريد</th></tr></thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id} className="border-t border-slate-800">
                  <td className="p-2"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></td>
                  <td className="p-2 text-slate-100">{c.name}</td>
                  <td className="p-2 text-slate-300">{c.email}</td>
                </tr>
              ))}
              {candidates.length === 0 && (<tr><td colSpan={3} className="p-3 text-center text-slate-400">لا توجد نتائج</td></tr>)}
            </tbody>
          </table>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-slate-200">عناوين خارجية (يدوي)</label>
          <div className="flex gap-2">
            <input className="flex-1 rounded border border-slate-600 bg-slate-800 p-2 text-slate-100" value={externalText} onChange={(e) => setExternalText(e.target.value)} />
            <button onClick={addExternal} className="rounded bg-slate-700 px-3 py-1 text-sm text-slate-100">إضافة</button>
          </div>
          {externals.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {externals.map((e) => (<span key={e} className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-100">{e} <button className="mr-2 text-rose-300" onClick={() => setExternals((prev) => prev.filter((x) => x !== e))}>×</button></span>))}
            </div>
          )}
        </div>

        <div className="text-sm text-slate-200">عدد المستلمين النهائي: <span className="font-bold text-amber-300">{allEmails.length}</span></div>

        <button onClick={createCampaign} disabled={busy || allEmails.length === 0 || !announcementId} className="rounded bg-amber-500 px-4 py-2 font-bold text-slate-900 disabled:opacity-50">
          مراجعة وإنشاء حملة
        </button>
        {msg && <p className="text-sm text-rose-300">{msg}</p>}
      </div>

      {preview && campaign && (
        <div className="rounded-xl border border-amber-500 bg-slate-900/80 p-4 space-y-3">
          <h3 className="text-lg font-bold text-amber-300">معاينة وتأكيد</h3>
          <p className="text-sm text-slate-200">الإعلان: {selectedAnnouncement?.title}</p>
          <p className="text-sm text-slate-200">العنوان: {subject || `Magicly — ${selectedAnnouncement?.title}`}</p>
          <p className="text-sm text-slate-200">عدد الرسائل: {allEmails.length}</p>
          <div className="max-h-40 overflow-auto rounded border border-slate-700 p-2 text-xs text-slate-300">{allEmails.join(", ")}</div>
          <p className="text-sm text-rose-300">تحذير: الإرسال الفعلي لا يمكن التراجع عنه بسهولة.</p>
          <div className="flex gap-2">
            <button onClick={() => confirmSend(false)} disabled={busy} className="rounded bg-rose-600 px-4 py-2 font-bold text-white disabled:opacity-50">تأكيد الإرسال</button>
            <button onClick={() => setPreview(false)} className="rounded bg-slate-700 px-4 py-2 text-slate-100">إلغاء</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
        <h3 className="text-lg font-bold text-amber-300">سجل الحملات</h3>
        <div className="space-y-2">
          {campaigns.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded border border-slate-700 p-3">
              <div className="text-sm text-slate-200">{c.id.slice(0, 8)} — {c.status} — مستلمون: {c.recipient_count}, مقبول: {c.accepted_count}, فشل: {c.failed_count}</div>
              {c.failed_count > 0 && (
                <button onClick={() => { setCampaign(c); confirmSend(true); }} className="rounded bg-slate-700 px-3 py-1 text-xs text-slate-100">إعادة محاولة الفاشلة فقط</button>
              )}
            </div>
          ))}
          {campaigns.length === 0 && <p className="text-sm text-slate-400">لا توجد حملات</p>}
        </div>
      </div>
    </div>
  );
}

