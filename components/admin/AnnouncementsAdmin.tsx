// ===========================================================================
// MAGICLY — SPRINT 1 — Batch 1A
// Enhanced Announcements Admin UI
// Adds: audience targeting, scheduling, preview, delivery analytics
// ===========================================================================

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AdminCard,
  AdminNotice,
  AdminTableWrap,
  AdminSkeleton
} from "@/components/admin/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: "all" | "targeted" | "plan" | "faculty" | "stage" | "grade";
  status: "draft" | "published" | "archived" | "paused";
  publish_at: string | null;
  expires_at: string | null;
  target_user_ids: string[] | null;
  target_plan_ids: string[] | null;
  target_faculty: string | null;
  target_stage: string | null;
  target_grade: string | null;
  delivery_status: "pending" | "sending" | "sent" | "failed" | "paused" | "archived";
  published_at: string | null;
  created_at: string;
  updated_at: string;
  _readCount?: number;
  _deliverCount?: number;
  _clickedCount?: number;
  _lastRead?: string | null;
};

type AudienceTarget =
  | { type: "all" }
  | { type: "users"; userIds: string[] }
  | { type: "plans"; planIds: string[] }
  | { type: "faculty"; faculty: string }
  | { type: "stage"; stage: string }
  | { type: "grade"; grade: string };

const AUDIENCES = ["all", "targeted", "plan", "faculty", "stage", "grade"] as const;

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isValidDateString(s: string): boolean {
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

function validateForm(
  form: {
    title: string;
    body: string;
    audience: (typeof AUDIENCES)[number];
    publish_at: string;
    expires_at: string;
    status: string;
  }
): string | null {
  if (!form.title.trim()) return "العنوان مطلوب.";
  if (!form.body.trim()) return "المحتوى مطلوب.";
  if (!form.body.trim().slice(0, 500)) return "المحتوى يجب أن يتكون من 500 حرف على الأقل.";
  const p = form.publish_at ? new Date(form.publish_at) : null;
  const e = form.expires_at ? new Date(form.expires_at) : null;
  if (p && Number.isNaN(p.getTime())) return "تاريخ البدء غير صالح.";
  if (e && Number.isNaN(e.getTime())) return "تاريخ الانتهاء غير صالح.";
  if (p && e && p >= e) return "تاريخ البدء يجب أن يكون قبل تاريخ الانتهاء.";
  if (form.status === "published" && e && e <= new Date()) return "لا يمكن نشر إعلان لصاحبه منتهي الصلاحية.";
  return null;
}

// ---------------------------------------------------------------------------
// UI Components
// ---------------------------------------------------------------------------

function AudienceSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      aria-label="الجمهور المستهدف"
    >
      {AUDIENCES.map((a) => (
        <option key={a} value={a}>
          {a === "all" && "كل الطلاب المسجلين"}
          {a === "targeted" && "مستخدمون محددون"}
          {a === "plan" && "حسب الباقة (Free, Pro, Ultra)"}
          {a === "faculty" && "حسب الكلية"}
          {a === "stage" && "حسب المرحلة الدراسية"}
          {a === "grade" && "حسب الصف أو المرحلة"}
        </option>
      ))}
    </select>
  );
}

function ScheduledInputs({
  publishAt,
  setPublishAt,
  expiresAt,
  setExpiresAt,
  disabled
}: {
  publishAt: string;
  setPublishAt: (v: string) => void;
  expiresAt: string;
  setExpiresAt: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label className="text-xs text-slate-300 block">
        موعد البدء (اختياري)
        <input
          type="datetime-local"
          value={publishAt}
          disabled={disabled}
          onChange={(e) => setPublishAt(e.target.value)}
          className="mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs disabled:opacity-50"
        />
      </label>
      <label className="text-xs text-slate-300 block">
        موعد الانتهاء (اختياري)
        <input
          type="datetime-local"
          value={expiresAt}
          disabled={disabled}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs disabled:opacity-50"
        />
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AnnouncementsAdmin() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<(typeof AUDIENCES)[number]>("all");
  const [audienceTarget, setAudienceTarget] = useState<string>("");
  const [status, setStatus] = useState<"draft" | "published" | "archived" | "paused">("draft");
  const [scheduleAt, setScheduleAt] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [expandAnalytics, setExpandAnalytics] = useState<string | null>(null);

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

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setBody("");
    setAudience("all");
    setAudienceTarget("");
    setStatus("draft");
    setScheduleAt("");
    setStartAt("");
    setEndAt("");
    setSuccess(null);
    setError(null);
  }

  function startEdit(item: Announcement) {
    setEditingId(item.id);
    setTitle(item.title);
    setBody(item.body);
    setAudience(item.audience as (typeof AUDIENCES)[number]);
    setAudienceTarget(item.audience === "targeted" ? (item.target_user_ids?.join(", ") ?? "") : "");
    setStatus(item.status);
    setScheduleAt(item.publish_at ? toLocalInput(item.publish_at) : "");
    setStartAt(item.publish_at ? toLocalInput(item.publish_at) : "");
    setEndAt(item.expires_at ? toLocalInput(item.expires_at) : "");
    setSuccess(null);
    setError(null);
  }

  // Show/hide analytics panel
  function toggleAnalytics(id: string) {
    setExpandAnalytics(expandAnalytics === id ? null : id);
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validateForm({
      title,
      body,
      audience,
      publish_at: scheduleAt,
      expires_at: endAt,
      status
    });
    if (validationError) {
      setError(validationError);
      setSuccess(null);
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        body: body.trim(),
        audience,
        status,
        start_at: isValidDateString(scheduleAt) ? new Date(scheduleAt).toISOString() : null,
        end_at: isValidDateString(endAt) ? new Date(endAt).toISOString() : null
      };

      // Audience targeting fields (only for targeted audiences)
      if (audience === "targeted") {
        payload.target_user_ids = audienceTarget
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (audience === "plan") {
        payload.target_plan_ids = [audienceTarget];
      } else if (audience === "faculty") {
        payload.target_faculty = audienceTarget;
      } else if (audience === "stage") {
        payload.target_stage = audienceTarget;
      } else if (audience === "grade") {
        payload.target_grade = audienceTarget;
      }

      const apiUrl = editingId ? `/api/announcements/${editingId}` : "/api/announcements";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(apiUrl, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Request failed.");
      setSuccess(editingId ? "تم تحديث الإعلان." : "تم إنشاء الإعلان.");
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function archiveItem(id: string) {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/announcements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Archive failed.");
      setSuccess("تم أرشفة الإعلان.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed.");
    }
  }

  async function unarchiveItem(id: string) {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/announcements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "published" })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Unarchive failed.");
      setSuccess("تم إعادة إعلان الإشعار.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unarchive failed.");
    }
  }

  async function deleteItem(id: string) {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/announcements/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Delete failed.");
      setSuccess("تم حذف الإعلان.");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  async function triggerPreview(item: Announcement) {
    try {
      const res = await fetch(`/api/announcements/${item.id}/preview`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Preview failed.");
      // Show preview in a modal or alert (in production, use client-side preview)
      setSuccess("معاينة الإعلان: " + JSON.stringify(data.preview).slice(0, 300));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed.");
    }
  }

  return (
    <div className="space-y-6">
      {error ? <AdminNotice tone="rose">{error}</AdminNotice> : null}
      {success ? <AdminNotice tone="emerald">{success}</AdminNotice> : null}

      <AdminCard
        title={editingId ? "تعديل إعلان" : "إنشاء إعلان"}
        description="الخادم هو المرجع. الجمهور المستهدف يمكن تحديده من قبل الإدارة."
        tone="amber"
      >
        <form onSubmit={submitForm} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-slate-300 block">
              العنوان
              <input
                value={title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
                placeholder="عنوان الإعلان"
                required
              />
            </label>
            <label className="text-xs text-slate-300 block">
              Audience (جمهور)
              <AudienceSelector value={audience} onChange={(v) => setAudience(v as (typeof AUDIENCES)[number])} />
            </label>
          </div>

          {audience === "targeted" && (
            <input
              value={audienceTarget}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAudienceTarget(e.target.value)}
              placeholder="أدخل MAG ID أو الاسم أو البريد الإلكتروني، مفصولاً بفواصل"
              aria-label="مستخدمون محددون"
              className="mt-1"
            />
          )}
          {audience === "plan" && (
            <input
              value={audienceTarget}
              onChange={(e) => setAudienceTarget(e.target.value)}
              placeholder="مثال: Free, Pro, Ultra"
              aria-label="أسماء الباقات"
              className="mt-1"
            />
          )}
          {audience === "faculty" && (
            <input
              value={audienceTarget}
              onChange={(e) => setAudienceTarget(e.target.value)}
              placeholder="اسم الكلية"
              aria-label="اسم الكلية"
              className="mt-1"
            />
          )}
          {audience === "stage" && (
            <input
              value={audienceTarget}
              onChange={(e) => setAudienceTarget(e.target.value)}
              placeholder="المستوى الدراسي (مثال: الجامعة)"
              aria-label="المرحلة الدراسية"
              className="mt-1"
            />
          )}
          {audience === "grade" && (
            <input
              value={audienceTarget}
              onChange={(e) => setAudienceTarget(e.target.value)}
              placeholder="المستوى الدراسي (مثال: الصف الأول)"
              aria-label="مستوى الصف أو المرحلة"
              className="mt-1"
            />
          )}

          <label className="text-xs text-slate-300 block">
            المحتوى
            <textarea
              value={body}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
              placeholder="محتوى الإعلان (الحد الأدنى 500 حرف)"
              required
              minLength={500}
              rows={6}
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs text-slate-300 block">
              الحالة
              <select
                value={status}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatus(e.target.value as "draft" | "published" | "archived" | "paused")}
                className="mt-1"
              >
                <option value="draft">مسودة</option>
                <option value="published">منشور</option>
                <option value="paused">متوقف مؤقتاً</option>
                <option value="archived">أرشيف</option>
              </select>
            </label>
            <ScheduledInputs
              publishAt={scheduleAt}
              setPublishAt={setScheduleAt}
              expiresAt={endAt}
              setExpiresAt={setEndAt}
              disabled={submitting}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded px-2 py-1 text-[11px]"
            >
              {submitting ? "جارٍ الحفظ..." : editingId ? "حفظ التعديل" : "إنشاء"}
            </button>
            {editingId ? (
              <button type="button" onClick={resetForm} className="bg-slate-700 hover:bg-slate-600 text-slate-100 rounded px-2 py-1 text-[11px]">
                إلغاء
              </button>
            ) : null}
            {editingId && (
              <button type="button" onClick={() => triggerPreview(items.find((i) => i.id === editingId)!)} className="bg-slate-700 hover:bg-slate-600 text-slate-100 rounded px-2 py-1 text-[11px]">
                معاينة
              </button>
            )}
          </div>
        </form>
      </AdminCard>

      <AdminCard
        title="قائمة الإعلانات"
        description="القراءة من API. تتبع المشاهدة من الخادم."
        tone="default"
      >
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
                <th className="p-3 font-semibold text-right">Read</th>
                <th className="p-3 font-semibold text-right">Delivered</th>
                <th className="p-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                  <td className="p-3 font-semibold text-slate-200">{item.title}</td>
                  <td className="p-3 text-slate-400 capitalize">
                    <span className="bg-slate-800/60 rounded px-2 py-1 text-[11px] text-slate-300">
                      {item.audience}
                    </span>
                  </td>
                  <td className="p-3 text-slate-400">
                    <span className={`rounded px-2 py-1 text-[11px] text-slate-300 item.status === "published" ? "emerald" : item.status === "archived" ? "gray" : "amber"}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="p-3 text-slate-500 text-[11px]">{item._readCount ?? 0}</td>
                  <td className="p-3 text-slate-500 text-[11px]">{item._deliverCount ?? 0}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => startEdit(item)}
                        className="bg-slate-700 hover:bg-slate-600 text-slate-100 rounded px-2 py-1 text-[11px]"
                      >
                        تعديل
                      </button>
                      <button
                        onClick={() => toggleAnalytics(item.id)}
                        className="bg-indigo-700 hover:bg-indigo-600 text-indigo-100 rounded px-2 py-1 text-[11px]"
                      >
                        analytics
                      </button>
                      {item.status !== "archived" && item.status !== "paused" ? (
                        <button
                          onClick={() => archiveItem(item.id)}
                          className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded px-2 py-1 text-[11px]"
                        >
                          أرشفة
                        </button>
                      ) : null}
                      {item.status === "paused" ? (
                        <button
                          onClick={() => unarchiveItem(item.id)}
                          className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 rounded px-2 py-1 text-[11px]"
                        >
                          تشغيل
                        </button>
                      ) : null}
                      <button
                        onClick={() => setDeleteTarget(item.id)}
                        className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 rounded px-2 py-1 text-[11px]"
                      >
                        حذف
                      </button>
                    </div>
                    {deleteTarget === item.id ? (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[11px] text-rose-300">تأكيد الحذف؟</span>
                        <button
                          onClick={() => deleteItem(item.id)}
                          className="bg-rose-600 hover:bg-rose-700 text-white rounded px-2 py-1 text-[11px]"
                        >
                          نعم، حذف
                        </button>
                        <button
                          onClick={() => setDeleteTarget(null)}
                          className="bg-slate-700 hover:bg-slate-600 text-slate-100 rounded px-2 py-1 text-[11px]"
                        >
                          إلغاء
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </AdminTableWrap>
        )}
      </AdminCard>

      {/* Delivery Analytics Panel */}
      {expandAnalytics && (
        <AdminCard
          title="إحصائيات التسليم"
          description="إحصائيات التسليم والمشاهدة للدليل"
          tone="default"
        >
          <div className="space-y-3">
            {items.find((i) => i.id === expandAnalytics) ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-slate-400">إجمالي المشاهدات:</span>
                    <span className="ml-2 font-semibold">
                      {items.find((i) => i.id === expandAnalytics)!._readCount ?? 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">إجمالي التسليمات:</span>
                    <span className="ml-2 font-semibold">
                      {items.find((i) => i.id === expandAnalytics)!._deliverCount ?? 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">النقرات:</span>
                    <span className="ml-2 font-semibold">
                      {items.find((i) => i.id === expandAnalytics)!._clickedCount ?? 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">آخر مشاهدة:</span>
                    <span className="ml-2 font-semibold">
                      {items.find((i) => i.id === expandAnalytics)!._lastRead ?? "—"}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setExpandAnalytics(null)}
                  className="text-xs text-slate-400 hover:text-slate-200 underline"
                >
                  إخفاء الإحصائيات
                </button>
              </>
            ) : null}
          </div>
        </AdminCard>
      )}
    </div>
  );
}
