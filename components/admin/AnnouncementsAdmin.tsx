"use client";
import { useCallback, useEffect, useState } from "react";
import { AdminCard, AdminNotice, AdminTableWrap } from "@/components/admin/ui";

type Announcement = { id: string; title: string; body: string; audience: string; status: "draft"|"published"|"archived"; publish_at: string | null; expires_at: string | null; created_at: string; updated_at: string; };
const AUDIENCES = ["all","student","graduate","freelancer"] as const;

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function validateForm(form: { title: string; body: string; publish_at: string; expires_at: string; status: string; }): string | null {
  if (!form.title.trim()) return "العنوان مطلوب.";
  if (!form.body.trim()) return "المحتوى مطلوب.";
  const p = form.publish_at ? new Date(form.publish_at) : null;
  const e = form.expires_at ? new Date(form.expires_at) : null;
  if (p && Number.isNaN(p.getTime())) return "publish_at غير صالح.";
  if (e && Number.isNaN(e.getTime())) return "expires_at غير صالح.";
  if (p && e && p >= e) return "publish_at must be before expires_at.";
  if (form.status === "published" && e && e <= new Date()) return "Published announcement cannot already be expired.";
  return null;
}

export default function AnnouncementsAdmin() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<(typeof AUDIENCES)[number]>("all");
  const [status, setStatus] = useState<"draft" | "published" | "archived">("draft");
  const [publishAt, setPublishAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/announcements", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load announcements.");
      setItems(data.announcements ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load announcements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setEditingId(null); setTitle(""); setBody(""); setAudience("all"); setStatus("draft"); setPublishAt(""); setExpiresAt("");
  }

  function startEdit(item: Announcement) {
    setEditingId(item.id); setTitle(item.title); setBody(item.body);
    setAudience((AUDIENCES as readonly string[]).includes(item.audience) ? (item.audience as (typeof AUDIENCES)[number]) : "all");
    setStatus(item.status); setPublishAt(toLocalInput(item.publish_at)); setExpiresAt(toLocalInput(item.expires_at));
    setSuccess(null); setError(null);
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validateForm({ title, body, publish_at: publishAt, expires_at: expiresAt, status });
    if (validationError) { setError(validationError); setSuccess(null); return; }
    setSubmitting(true); setError(null); setSuccess(null);
    try {
      const payload = { title: title.trim(), body: body.trim(), audience, status, publish_at: publishAt ? new Date(publishAt).toISOString() : null, expires_at: expiresAt ? new Date(expiresAt).toISOString() : null };
      const url = editingId ? `/api/announcements/${editingId}` : "/api/announcements";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Request failed.");
      setSuccess(editingId ? "تم تحديث الإعلان." : "تم إنشاء الإعلان.");
      resetForm(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed."); }
    finally { setSubmitting(false); }
  }

  async function archiveItem(id: string) {
    setError(null); setSuccess(null);
    try {
      const res = await fetch(`/api/announcements/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "archived" }) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Archive failed.");
      setSuccess("تم أرشفة الإعلان."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Archive failed."); }
  }

  async function deleteItem(id: string) {
    setError(null); setSuccess(null);
    try {
      const res = await fetch(`/api/announcements/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Delete failed.");
      setSuccess("تم حذف الإعلان."); setDeleteTarget(null); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Delete failed."); }
  }

  return (
    <div className="space-y-6">
      {error ? <AdminNotice tone="rose">{error}</AdminNotice> : null}
      {success ? <AdminNotice tone="emerald">{success}</AdminNotice> : null}

      <AdminCard title={editingId ? "تعديل إعلان" : "إنشاء إعلان"} description="الخادم هو المرجع (validation). Audience هي metadata فقط." tone="amber">
        <form onSubmit={submitForm} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-slate-300">
              العنوان
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs" required />
            </label>
            <label className="text-xs text-slate-300">
              Audience (metadata)
              <select value={audience} onChange={(e) => setAudience(e.target.value as (typeof AUDIENCES)[number])} className="mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs">
                {AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
          </div>
          <label className="text-xs text-slate-300 block">
            المحتوى
            <textarea value={body} onChange={(e) => setBody(e.target.value)} className="mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs min-h-[90px]" required />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs text-slate-300">
              الحالة
              <select value={status} onChange={(e) => setStatus(e.target.value as "draft" | "published" | "archived")} className="mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs">
                <option value="draft">draft</option>
                <option value="published">published</option>
                <option value="archived">archived</option>
              </select>
            </label>
            <label className="text-xs text-slate-300">
              Publish at (اختياري)
              <input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className="mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs" />
            </label>
            <label className="text-xs text-slate-300">
              Expires at (اختياري)
              <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs" />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold rounded-lg px-5 py-2 text-sm">
              {submitting ? "جارٍ الحفظ..." : editingId ? "حفظ التعديل" : "إنشاء"}
            </button>
            {editingId ? (
              <button type="button" onClick={resetForm} className="bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg px-4 py-2 text-sm">إلغاء</button>
            ) : null}
          </div>
        </form>
      </AdminCard>
      <AdminCard title="قائمة الإعلانات" description="القراءة من API." tone="default">
        {loading ? (
          <AdminNotice>جارٍ التحميل...</AdminNotice>
        ) : items.length === 0 ? (
          <AdminNotice>لا توجد إعلانات.</AdminNotice>
        ) : (
          <AdminTableWrap>
            <thead>
              <tr className="bg-slate-950/60 text-slate-400 text-[11px]">
                <th className="p-3 font-semibold text-right">العنوان</th>
                <th className="p-3 font-semibold text-right">Audience</th>
                <th className="p-3 font-semibold text-right">Status</th>
                <th className="p-3 font-semibold text-right">Publish</th>
                <th className="p-3 font-semibold text-right">Expires</th>
                <th className="p-3 font-semibold text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                  <td className="p-3 font-semibold text-slate-200">{item.title}</td>
                  <td className="p-3 text-slate-400">{item.audience}</td>
                  <td className="p-3 text-slate-400">{item.status}</td>
                  <td className="p-3 text-slate-500 text-[11px]">{item.publish_at ? new Date(item.publish_at).toLocaleString("ar-EG") : "—"}</td>
                  <td className="p-3 text-slate-500 text-[11px]">{item.expires_at ? new Date(item.expires_at).toLocaleString("ar-EG") : "—"}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => startEdit(item)} className="bg-slate-700 hover:bg-slate-600 text-slate-100 rounded px-2 py-1 text-[11px]">تعديل</button>
                      {item.status !== "archived" ? (
                        <button onClick={() => archiveItem(item.id)} className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded px-2 py-1 text-[11px]">أرشفة</button>
                      ) : null}
                      <button onClick={() => setDeleteTarget(item.id)} className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 rounded px-2 py-1 text-[11px]">حذف</button>
                    </div>
                    {deleteTarget === item.id ? (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[11px] text-rose-300">تأكيد الحذف؟</span>
                        <button onClick={() => deleteItem(item.id)} className="bg-rose-600 hover:bg-rose-700 text-white rounded px-2 py-1 text-[11px]">نعم، حذف</button>
                        <button onClick={() => setDeleteTarget(null)} className="bg-slate-700 hover:bg-slate-600 text-slate-100 rounded px-2 py-1 text-[11px]">إلغاء</button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </AdminTableWrap>
        )}
      </AdminCard>
    </div>
  );
}
