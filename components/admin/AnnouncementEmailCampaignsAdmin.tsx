"use client";
import { useEffect, useMemo, useRef, useState } from "react";

type R = { id: string; email: string; name: string };
type C = {
  id: string;
  status: string;
  recipient_count: number;
  accepted_count: number;
  failed_count: number;
  created_at?: string;
  subject_override?: string | null;
  sender_override?: string | null;
  last_error?: string | null;
};

const AUDIENCES = [
  { value: "all", label: "الكل" },
  { value: "student", label: "الطلاب" },
  { value: "graduate", label: "الخريجون" },
  { value: "freelancer", label: "المستقلون" },
];

// نسخة مبسطة من قالب البريد (lib/email/announcement-template.ts) للمعاينة الحية
function buildPreviewDoc(title: string, body: string): string {
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const bodyHtml = esc(body.trim()).replace(/\n/g, "<br/>");
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/></head>
<body style="margin:0;background:#0f172a;font-family:Tahoma,Arial,sans-serif;color:#e2e8f0;padding:12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#1e293b;border-radius:16px;overflow:hidden;">
<tr><td style="padding:24px 28px;background:#f59e0b;color:#0f172a;font-size:20px;font-weight:700;">Magicly</td></tr>
<tr><td style="padding:28px;"><h1 style="margin:0 0 12px 0;font-size:22px;color:#f8fafc;">${esc(title || "عنوان الرسالة")}</h1>
<div style="font-size:15px;line-height:1.8;color:#e2e8f0;">${bodyHtml || "<span style='color:#64748b'>اكتب نص الرسالة هنا وستظهر المعاينة مباشرة…</span>"}</div>
<div style="margin-top:28px;"><a href="#" style="display:inline-block;background:#f59e0b;color:#0f172a;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">فتح Magicly</a></div>
</td></tr>
<tr><td style="padding:18px 28px;font-size:11px;color:#64748b;border-top:1px solid #334155;">هذا بريد إداري من Magicly.</td></tr>
</table></td></tr></table></body></html>`;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  queued: "في قائمة الانتظار",
  sending: "جارٍ الإرسال",
  completed: "مكتملة",
  partial_failed: "مكتملة بفشل جزئي",
};

export default function AnnouncementEmailCampaignsAdmin() {
  const [announcements, setAnnouncements] = useState<{ id: string; title: string; status: string; body?: string }[]>([]);
  const [announcementId, setAnnouncementId] = useState("");
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [query, setQuery] = useState("");
  const [audience, setAudience] = useState("all");
  const [candidates, setCandidates] = useState<R[]>([]);
  const [recipientDirectory, setRecipientDirectory] = useState<Map<string, R>>(new Map());
  const [recipientTotal, setRecipientTotal] = useState(0);
  const [recipientPage, setRecipientPage] = useState(1);
  const [hasMoreRecipients, setHasMoreRecipients] = useState(false);
  const [allAudience, setAllAudience] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [externalText, setExternalText] = useState("");
  const [externals, setExternals] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [sender, setSender] = useState("");
  const [campaigns, setCampaigns] = useState<C[]>([]);
  const [sendProgress, setSendProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [lastError, setLastError] = useState<string | null>(null);
  const stopSendRef = useRef(false);

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
      const p = new URLSearchParams({ q: query, audience, page: String(recipientPage) });
      const d = await (await fetch(`/api/announcement-email-campaigns/recipients?${p}`)).json();
      if (d.success) {
        const pageRecipients = (d.recipients || []) as R[];
        setCandidates(pageRecipients);
        setRecipientDirectory((current) => new Map([...current, ...pageRecipients.map((recipient) => [recipient.id, recipient] as const)]));
        setRecipientTotal(d.total || 0);
        setHasMoreRecipients(Boolean(d.hasMore));
      }
      else setMsg(d.error || "Failed");
    } finally { setBusy(false); }
  }

  useEffect(() => { setRecipientPage(1); setAllAudience(false); setSelected(new Set()); setRecipientDirectory(new Map()); }, [query, audience]);
  useEffect(() => { loadRecipients(); }, [query, audience, recipientPage]);

  function toggle(id: string) { setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function selectAll() { setSelected((prev) => { const n = new Set(prev); candidates.forEach((c) => n.add(c.id)); return n; }); }
  function selectEntireAudience() { setAllAudience(true); setSelected(new Set()); }
  function clearAll() { setSelected(new Set()); setAllAudience(false); }

  function addExternal() {
    const parts = externalText.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const valid = parts.filter((p) => re.test(p) && !externals.includes(p));
    const invalid = parts.filter((p) => !re.test(p));
    if (invalid.length) setMsg(`عناوين غير صالحة تم تجاهلها: ${invalid.join("، ")}`);
    else setMsg("");
    setExternals((prev) => [...prev, ...valid]);
    setExternalText("");
  }

  const activeTitle = mode === "new" ? newTitle : (announcements.find((a) => a.id === announcementId)?.title ?? "");
  const activeBody = mode === "new" ? newBody : (announcements.find((a) => a.id === announcementId)?.body ?? "");
  const previewDoc = useMemo(() => buildPreviewDoc(activeTitle, activeBody), [activeTitle, activeBody]);
  const messageReady = mode === "new" ? newTitle.trim().length > 0 && newBody.trim().length > 0 : Boolean(announcementId);

  const selectedRecipients = useMemo(() => Array.from(selected).map((id) => recipientDirectory.get(id)).filter((recipient): recipient is R => Boolean(recipient)), [recipientDirectory, selected]);
  const allEmails = useMemo(() => {
    const s = new Set<string>();
    selectedRecipients.forEach((r) => s.add(r.email));
    externals.forEach((e) => s.add(e));
    return Array.from(s);
  }, [selectedRecipients, externals]);
  const plannedCount = allAudience ? recipientTotal : allEmails.length;
  const canCreate = messageReady && plannedCount > 0 && !busy;

  async function sendLoop(
    initial: C,
    opts: { retryFailed: boolean },
    onBatch: (campaign: C, progress: { done: number; total: number }) => void,
  ): Promise<void> {
    let current = initial;
    while (!stopSendRef.current) {
      const r = await fetch(`/api/announcement-email-campaigns/${current.id}/send`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, retry_failed: opts.retryFailed }),
      });
      const s = await r.json();
      if (!s.success) {
        if (s.error !== "No recipients to send.") setLastError(s.error || "Send failed");
        break;
      }
      if (s.failed > 0 && s.first_error) setLastError(s.first_error);
      const updated: C = { ...current, status: s.status, accepted_count: s.accepted_total ?? 0, failed_count: s.failed_total ?? 0 };
      current = updated;
      const total = updated.recipient_count;
      onBatch(updated, { done: Math.min((s.accepted_total ?? 0) + (s.failed_total ?? 0), total), total });
      if (s.status === "completed" || s.status === "partial_failed" || (s.remaining ?? 0) <= 0) break;
    }
  }

  async function createAndSend() {
    if (!canCreate) return;
    if (!window.confirm(`تأكيد الإرسال إلى ${plannedCount} مستلم؟ لا يمكن التراجع بسهولة.`)) return;
    setBusy(true); setMsg(""); setLastError(null); stopSendRef.current = false;
    try {
      const payload: Record<string, unknown> = {
        internal_user_ids: selectedRecipients.map((r) => r.id),
        include_all_internal: allAudience,
        audience, query,
        external_emails: externals,
        subject: subject || undefined,
        sender: sender || undefined,
      };
      if (mode === "new") { payload.title = newTitle.trim(); payload.body = newBody.trim(); }
      else { payload.announcement_id = announcementId; }

      const res = await fetch("/api/announcement-email-campaigns", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!d.success) { setMsg(d.error || "Failed"); return; }
      const created = d.campaign as C;
      setCampaigns((cur) => cur.map((item) => item.id === created.id ? created : item));

      // إرسال تلقائي متسلسل لكل الدفعات حتى الانتهاء (أو حتى الإيقاف)
      setSendProgress({ done: 0, total: created.recipient_count });
      await sendLoop(created, { retryFailed: false }, (updated, progress) => {
        setCampaigns((cur) => cur.map((item) => item.id === updated.id ? updated : item));
        setSendProgress(progress);
      });
      setSendProgress(null);
      setMsg(stopSendRef.current ? "أوقفت الإرسال — يمكنك استكماله لاحقًا من سجل الحملات." : "انتهى الإرسال ✅");
      loadCampaigns();
    } finally {
      setBusy(false);
    }
  }

  async function resumeCampaign(c: C) {
    if (busy) return;
    if (!window.confirm("استكمال إرسال الحملة؟")) return;
    stopSendRef.current = false; setBusy(true); setMsg(""); setLastError(null);
    try {
      setSendProgress({ done: (c.accepted_count || 0) + (c.failed_count || 0), total: c.recipient_count });
      await sendLoop(c, { retryFailed: false }, (updated, progress) => {
        setCampaigns((cur) => cur.map((item) => item.id === updated.id ? updated : item));
        setSendProgress(progress);
      });
      setSendProgress(null);
      loadCampaigns();
    } finally {
      setBusy(false);
    }
  }

  async function retryFailed(c: C) {
    if (busy) return;
    if (!window.confirm("إعادة محاولة الفاشلين فقط؟")) return;
    stopSendRef.current = false; setBusy(true); setMsg(""); setLastError(null);
    try {
      await sendLoop(c, { retryFailed: true }, (updated) => {
        setCampaigns((cur) => cur.map((item) => item.id === updated.id ? updated : item));
      });
      loadCampaigns();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* ===== 1) الرسالة ===== */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-4">
        <h2 className="text-lg font-bold text-amber-300">1 — الرسالة</h2>
        <div className="flex gap-2">
          <button onClick={() => setMode("new")} className={`rounded px-4 py-2 text-sm font-bold ${mode === "new" ? "bg-amber-500 text-slate-900" : "bg-slate-700 text-slate-100"}`}>✍️ رسالة جديدة</button>
          <button onClick={() => setMode("existing")} className={`rounded px-4 py-2 text-sm font-bold ${mode === "existing" ? "bg-amber-500 text-slate-900" : "bg-slate-700 text-slate-100"}`}>📢 إعلان محفوظ</button>
        </div>

        {mode === "new" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm text-slate-200">عنوان الرسالة</label>
                <input className="w-full rounded border border-slate-600 bg-slate-800 p-2 text-slate-100" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="مثال: خصم 20% على الباقة المتقدمة" maxLength={200} />
                <p className="text-xs text-slate-500">{newTitle.length}/200 — الموضوع الافتراضي للبريد: «Magicly — {newTitle || "…"}» (يمكن تغييره أدناه)</p>
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-200">نص الرسالة</label>
                <textarea className="min-h-[220px] w-full rounded border border-slate-600 bg-slate-800 p-3 leading-relaxed text-slate-100" value={newBody} onChange={(e) => setNewBody(e.target.value)} placeholder="اكتب رسالتك هنا… السطر الجديد يظهر كفاصل في البريد." maxLength={10000} />
                <p className="text-xs text-slate-500">{newBody.length}/10000</p>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-200">معاينة حية — شكل البريد</label>
              <iframe title="معاينة البريد" srcDoc={previewDoc} className="h-[320px] w-full rounded border border-slate-600 bg-slate-950" sandbox="" />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-sm text-slate-200">اختر إعلانًا محفوظًا (يُستخدم عنوانه ونصه كما هو)</label>
            <select className="w-full rounded border border-slate-600 bg-slate-800 p-2 text-slate-100" value={announcementId} onChange={(e) => setAnnouncementId(e.target.value)}>
              <option value="">-- اختر --</option>
              {announcements.map((a) => (<option key={a.id} value={a.id}>{a.title} ({STATUS_LABEL[a.status] || a.status})</option>))}
            </select>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm text-slate-200">موضوع البريد (اختياري)</label>
            <input className="w-full rounded border border-slate-600 bg-slate-800 p-2 text-slate-100" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder={activeTitle ? `Magicly — ${activeTitle}` : "افتراضي: Magicly — عنوان الإعلان"} />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-slate-200">بريد المُرسل (اختياري)</label>
            <input className="w-full rounded border border-slate-600 bg-slate-800 p-2 text-slate-100" value={sender} onChange={(e) => setSender(e.target.value)} placeholder="افتراضي: RESEND_FROM_EMAIL من الإعدادات" dir="ltr" />
          </div>
        </div>
      </div>

      {/* ===== 2) المستلمون ===== */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-4">
        <h2 className="text-lg font-bold text-amber-300">2 — المستلمون</h2>
        <p className="text-sm text-slate-300">اختر فئة كاملة، أو حدّد مستخدمين بعينهم من القائمة، أو أضف عناوين بريد خارجية.</p>

        <div className="flex flex-wrap gap-2">
          {AUDIENCES.map((a) => (
            <button key={a.value} onClick={() => setAudience(a.value)} className={`rounded-full px-4 py-1.5 text-sm font-bold ${audience === a.value ? "bg-amber-500 text-slate-900" : "bg-slate-700 text-slate-100"}`}>{a.label}</button>
          ))}
          <input className="ml-auto w-64 rounded border border-slate-600 bg-slate-800 p-2 text-sm text-slate-100" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔎 بحث بالاسم أو البريد…" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={selectAll} className="rounded bg-slate-700 px-3 py-1 text-sm text-slate-100">تحديد هذه الصفحة</button>
          <button onClick={selectEntireAudience} className="rounded bg-amber-600 px-3 py-1 text-sm font-bold text-slate-950">استهداف كامل الفئة ({recipientTotal})</button>
          <button onClick={clearAll} className="rounded bg-slate-700 px-3 py-1 text-sm text-slate-100">إلغاء التحديد</button>
          <span className="text-xs text-slate-400">الصفحة {recipientPage} · {candidates.length} من {recipientTotal}</span>
          <button disabled={recipientPage <= 1 || busy} onClick={() => setRecipientPage((p) => Math.max(1, p - 1))} className="rounded bg-slate-700 px-3 py-1 text-sm text-white disabled:opacity-40">السابق</button>
          <button disabled={!hasMoreRecipients || busy} onClick={() => setRecipientPage((p) => p + 1)} className="rounded bg-slate-700 px-3 py-1 text-sm text-white disabled:opacity-40">التالي</button>
        </div>
        {allAudience && <p className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-200">سيُستهدف كامل الفئة المسجلة والمؤكدة المطابقة، وليس الصفحة الحالية فقط.</p>}

        <div className="max-h-64 overflow-auto rounded border border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-slate-200"><tr><th className="p-2">اختيار</th><th className="p-2">الاسم</th><th className="p-2">البريد</th></tr></thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id} className={`border-t border-slate-800 ${selected.has(c.id) ? "bg-amber-500/10" : ""}`}>
                  <td className="p-2"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></td>
                  <td className="p-2 text-slate-100">{c.name}</td>
                  <td className="p-2 text-slate-300" dir="ltr">{c.email}</td>
                </tr>
              ))}
              {candidates.length === 0 && (<tr><td colSpan={3} className="p-3 text-center text-slate-400">لا توجد نتائج</td></tr>)}
            </tbody>
          </table>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-slate-200">عناوين خارجية (اختياري)</label>
          <div className="flex gap-2">
            <input className="flex-1 rounded border border-slate-600 bg-slate-800 p-2 text-slate-100" value={externalText} onChange={(e) => setExternalText(e.target.value)} placeholder="email@example.com, another@x.com" dir="ltr" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExternal(); } }} />
            <button onClick={addExternal} className="rounded bg-slate-700 px-4 py-1 text-sm text-slate-100">إضافة</button>
          </div>
          {externals.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {externals.map((e) => (<span key={e} className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-100" dir="ltr">{e} <button className="mr-2 text-rose-300" onClick={() => setExternals((prev) => prev.filter((x) => x !== e))}>×</button></span>))}
            </div>
          )}
        </div>

        <div className="text-sm text-slate-200">عدد المستلمين النهائي: <span className="font-bold text-amber-300">{plannedCount}</span>{allAudience ? " (يُعاد احتسابه على الخادم عند إنشاء الحملة)" : ""}</div>
      </div>

      {/* ===== 3) الإرسال ===== */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
        <h2 className="text-lg font-bold text-amber-300">3 — المراجعة والإرسال</h2>
        <ul className="space-y-1 text-sm text-slate-300">
          <li>الرسالة: <span className="text-slate-100">{mode === "new" ? (newTitle || "—") : (activeTitle || "—")}</span></li>
          <li>الموضوع: <span className="text-slate-100" dir="ltr">{subject || (activeTitle ? `Magicly — ${activeTitle}` : "—")}</span></li>
          <li>المستلمون: <span className="font-bold text-amber-300">{plannedCount}</span></li>
        </ul>
        {sendProgress && (
          <div className="space-y-2 rounded border border-blue-500/40 bg-blue-500/10 p-3">
            <div className="flex items-center justify-between text-sm text-blue-100">
              <span>جارٍ الإرسال… {sendProgress.done}/{sendProgress.total}</span>
              <button onClick={() => { stopSendRef.current = true; }} className="rounded bg-rose-600 px-3 py-1 text-xs font-bold text-white">⏹ إيقاف</button>
            </div>
            <div className="h-2 w-full overflow-hidden rounded bg-slate-700">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${sendProgress.total ? Math.round((sendProgress.done / sendProgress.total) * 100) : 0}%` }} />
            </div>
          </div>
        )}
        {msg && <p className="whitespace-pre-line text-sm text-amber-200">{msg}</p>}
        {lastError && (
          <div className="rounded border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            <strong>سبب فشل آخر إرسال:</strong> {lastError}
          </div>
        )}
        <button onClick={createAndSend} disabled={busy || !canCreate} className="rounded bg-amber-500 px-5 py-2.5 font-bold text-slate-900 disabled:opacity-50">
          🚀 إنشاء الحملة والإرسال الفوري
        </button>
      </div>

      {/* ===== سجل الحملات ===== */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
        <h3 className="text-lg font-bold text-amber-300">سجل الحملات</h3>
        <div className="space-y-2">
          {campaigns.map((c) => {
            const done = (c.accepted_count || 0) + (c.failed_count || 0);
            const pct = c.recipient_count ? Math.round((done / c.recipient_count) * 100) : 0;
            return (
              <div key={c.id} className="rounded border border-slate-700 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-slate-200">
                    <span className="font-mono text-xs text-slate-400">{c.id.slice(0, 8)}</span>
                    {" — "}
                    <span className={c.status === "completed" ? "text-emerald-300" : c.status === "partial_failed" ? "text-rose-300" : "text-amber-200"}>{STATUS_LABEL[c.status] || c.status}</span>
                    {c.subject_override ? <span className="text-slate-300"> · {c.subject_override}</span> : null}
                    <span className="text-slate-400"> · مستلمون: {c.recipient_count}, مقبول: {c.accepted_count}, فشل: {c.failed_count}</span>
                  </div>
                  <div className="flex gap-2">
                    {["queued", "draft"].includes(c.status) && <button onClick={() => resumeCampaign(c)} className="rounded bg-blue-700 px-3 py-1 text-xs text-white">استكمال الإرسال</button>}
                    {c.failed_count > 0 && c.status === "partial_failed" && <button onClick={() => retryFailed(c)} className="rounded bg-slate-700 px-3 py-1 text-xs text-slate-100">إعادة محاولة الفاشلين</button>}
                  </div>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded bg-slate-700">
                  <div className={`h-full ${c.failed_count > 0 ? "bg-rose-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                </div>
                {c.last_error && <p className="text-xs text-rose-300">سبب الفشل: {c.last_error}</p>}
              </div>
            );
          })}
          {campaigns.length === 0 && <p className="text-sm text-slate-400">لا توجد حملات</p>}
        </div>
      </div>
    </div>
  );
}
