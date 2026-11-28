"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  approvePurchaseRequest,
  fetchPurchaseTicketMessages,
  rejectPurchaseRequest,
  replyToPurchaseTicket,
  updatePurchaseRequestAdmin,
} from "@/app/admin/actions/purchase-requests";
import type { PurchaseRequestAdminView } from "@/lib/admin/purchase-requests";

const PAGE_SIZE = 20;

const STATUS: Record<PurchaseRequestAdminView["status"], { text: string; cls: string }> = {
  awaiting_payment: { text: "بانتظار الدفع", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  payment_submitted: { text: "دفع مؤكد — ينتظر المراجعة", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  approved: { text: "مقبول", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  rejected: { text: "مرفوض", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  cancelled: { text: "ملغى", cls: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
};

const METHOD_LABEL: Record<string, string> = {
  vodafone_cash: "فودافون كاش",
  instapay: "إنستا باي",
  visa: "فيزا",
  mastercard: "ماستركارد",
  other: "أخرى",
};

type TicketMessage = { id: string; author_role: string; body: string; created_at: string };

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
}

/**
 * جدول طلبات الاشتراكات: بيانات المستخدم كاملة + تعديل الطلب (باقة/مدة/مبلغ)
 * + محادثة الدعم المرتبطة + قبول/رفض.
 */
export default function SubscriptionRequestsTable({ requests }: { requests: PurchaseRequestAdminView[] }) {
  const [statusFilter, setStatusFilter] = useState<"all" | PurchaseRequestAdminView["status"]>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ planKey: string; durationDays: number; amount: number; note: string }>({
    planKey: "pro", durationDays: 30, amount: 0, note: "",
  });
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [reply, setReply] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q === "") return true;
      return (
        (r.user_email ?? "").toLowerCase().includes(q) ||
        (r.user_name ?? "").toLowerCase().includes(q) ||
        (r.user_code ?? "").toLowerCase().includes(q) ||
        r.user_id.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (r.payment_reference ?? "").toLowerCase().includes(q)
      );
    });
  }, [requests, statusFilter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function openReview(r: PurchaseRequestAdminView) {
    setOpenId(r.id);
    setEdit({
      planKey: r.plan_key ?? "pro",
      durationDays: r.plan_duration_days ?? 30,
      amount: Number(r.amount ?? 0),
      note: r.admin_note ?? "",
    });
    setMessages([]);
    setReply("");
    setFeedback(null);
    if (r.ticket_id) {
      startTransition(async () => {
        setMessages(await fetchPurchaseTicketMessages(r.id));
      });
    }
  }

  function run(action: "save" | "approve" | "reject" | "reply", id: string) {
    setFeedback(null);
    startTransition(async () => {
      const result =
        action === "save"
          ? await updatePurchaseRequestAdmin({ requestId: id, planKey: edit.planKey, durationDays: edit.durationDays, amount: edit.amount, adminNote: edit.note })
          : action === "approve"
            ? await approvePurchaseRequest(id, edit.note)
            : action === "reject"
              ? await rejectPurchaseRequest(id, edit.note)
              : await replyToPurchaseTicket(id, reply);
      setFeedback({ ok: result.ok, message: result.message });
      if (action === "reply" && result.ok) setReply("");
    });
  }

  const inputCls = "w-full rounded bg-slate-800 p-2 text-[11px]";

  return (
    <div className="space-y-3">
      {feedback && (
        <div
          role="status"
          className={`rounded-xl border px-3 py-2 text-sm ${
            feedback.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-sm text-slate-300">
          الحالة
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(0); }} className="mt-1 w-full rounded bg-slate-800 p-2">
            <option value="all">الكل</option>
            <option value="payment_submitted">دفع مؤكد — ينتظر المراجعة</option>
            <option value="awaiting_payment">بانتظار الدفع</option>
            <option value="approved">مقبول</option>
            <option value="rejected">مرفوض</option>
            <option value="cancelled">ملغى</option>
          </select>
        </label>
        <label className="block text-sm text-slate-300">
          بحث (بريد / اسم / كود / مرجع دفع)
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="mt-1 w-full rounded bg-slate-800 p-2" />
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-700">
        <table className="w-full text-[11px] sm:text-xs">
          <thead className="bg-slate-900/60 text-amber-300">
            <tr>
              <th className="px-3 py-2 text-right">المستخدم</th>
              <th className="px-3 py-2 text-right">الباقة المطلوبة</th>
              <th className="px-3 py-2 text-right">المبلغ</th>
              <th className="px-3 py-2 text-right">الدفع</th>
              <th className="px-3 py-2 text-right">المحادثة</th>
              <th className="px-3 py-2 text-right">الحالة</th>
              <th className="px-3 py-2 text-right">أُنشئ</th>
              <th className="px-3 py-2 text-right">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">لا توجد طلبات اشتراكات مطابقة</td></tr>
            ) : (
              rows.map((r) => {
                const isPendingReview = r.status === "payment_submitted" || r.status === "awaiting_payment";
                return (
                  <tr key={r.id} className={`border-t border-slate-700/70 align-top ${r.status === "payment_submitted" ? "bg-amber-500/5" : ""}`}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.user_name || "—"}</div>
                      <div className="text-[10px] text-slate-400" dir="ltr">{r.user_email || "—"}</div>
                      {r.user_code && <div className="font-mono text-[10px] text-amber-300/80">{r.user_code}</div>}
                      <div className="font-mono text-[10px] text-slate-500" dir="ltr">{r.user_id}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div>{r.plan_key === "pro" ? "احترافي" : r.plan_key === "ultra" ? "ألتميت" : r.plan_key}</div>
                      <div className="text-[10px] text-slate-400">{r.plan_duration_days} يوم</div>
                    </td>
                    <td className="px-3 py-2 font-mono whitespace-nowrap" dir="ltr">{r.amount != null ? `${Number(r.amount).toFixed(2)} ${r.currency}` : "—"}</td>
                    <td className="px-3 py-2">
                      {r.payment_method ? (
                        <>
                          <div>{METHOD_LABEL[r.payment_method] ?? r.payment_method}</div>
                          <div className="font-mono text-[10px] text-slate-400" dir="ltr">{r.payment_reference || "—"}</div>
                        </>
                      ) : "—"}
                      {r.user_note && <div className="mt-1 text-[10px] text-slate-400">ملاحظة: {r.user_note}</div>}
                    </td>
                    <td className="px-3 py-2">
                      {r.ticket_id ? (
                        <>
                          <div className="max-w-40 truncate text-slate-300">{r.ticket_title || "محادثة دعم"}</div>
                          <div className="text-[10px] text-slate-500">حالة التذكرة: {r.ticket_status || "—"}</div>
                        </>
                      ) : <span className="text-slate-500">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS[r.status].cls}`}>{STATUS[r.status].text}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.created_at)}</td>
                    <td className="px-3 py-2">
                      {isPendingReview ? (
                        <button
                          type="button"
                          onClick={() => (openId === r.id ? setOpenId(null) : openReview(r))}
                          className="rounded bg-amber-600 px-2 py-1 text-[11px] font-bold text-white"
                        >
                          {openId === r.id ? "إغلاق" : "مراجعة"}
                        </button>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* لوحة المراجعة: تعديل + محادثة + قرار */}
      {openId && (() => {
        const r = rows.find((x) => x.id === openId);
        if (!r) return null;
        const editable = r.status === "awaiting_payment" || r.status === "payment_submitted";
        return (
          <div className="rounded-2xl border border-amber-500/30 bg-slate-900/70 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-amber-300">
                مراجعة طلب — {r.user_name || r.user_email || r.user_id.slice(0, 8)}
              </h3>
              <Link href={`/inbox?category=support&ticket=${r.ticket_id}`} target="_blank" className="text-[11px] text-violet-300 underline">
                فتح المحادثة في صندوق الوارد ↗
              </Link>
            </div>

            {editable && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label className="block text-xs text-slate-300">
                  الباقة
                  <select value={edit.planKey} onChange={(e) => setEdit({ ...edit, planKey: e.target.value })} className={`mt-1 ${inputCls}`}>
                    <option value="pro">احترافي (pro)</option>
                    <option value="ultra">ألتميت (ultra)</option>
                  </select>
                </label>
                <label className="block text-xs text-slate-300">
                  المدة (يوم)
                  <input type="number" min={1} max={365} value={edit.durationDays} onChange={(e) => setEdit({ ...edit, durationDays: Number(e.target.value) })} className={`mt-1 ${inputCls}`} dir="ltr" />
                </label>
                <label className="block text-xs text-slate-300">
                  المبلغ ({r.currency})
                  <input type="number" min={0} step="0.01" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: Number(e.target.value) })} className={`mt-1 ${inputCls}`} dir="ltr" />
                </label>
                <label className="block text-xs text-slate-300">
                  ملاحظة إدارية
                  <input value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} maxLength={500} className={`mt-1 ${inputCls}`} />
                </label>
              </div>
            )}

            {editable && (
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={isPending} onClick={() => run("save", r.id)} className="rounded bg-slate-700 px-3 py-1.5 text-xs font-bold disabled:opacity-50">حفظ التعديلات</button>
                <button type="button" disabled={isPending || r.status !== "payment_submitted"} onClick={() => run("approve", r.id)} className="rounded bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50" title={r.status !== "payment_submitted" ? "لا يمكن القبول قبل تأكيد المستخدم للدفع" : ""}>
                  قبول الطلب وتفعيل الاشتراك
                </button>
                <button type="button" disabled={isPending || r.status !== "payment_submitted"} onClick={() => run("reject", r.id)} className="rounded bg-rose-600 px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                  رفض الطلب
                </button>
              </div>
            )}

            {/* محادثة الدعم المرتبطة */}
            {r.ticket_id && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300">محادثة الدعم</h4>
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-700 p-3">
                  {messages.length === 0 ? (
                    <div className="text-[11px] text-slate-500">{isPending ? "جارٍ التحميل…" : "لا رسائل."}</div>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className={`rounded-lg p-2 text-[11px] ${m.author_role === "admin" ? "bg-amber-500/10 text-amber-200" : "bg-slate-800 text-slate-200"}`}>
                        <div className="mb-1 flex justify-between text-[9px] text-slate-500">
                          <span>{m.author_role === "admin" ? "الإدارة" : "المستخدم"}</span>
                          <span>{formatDate(m.created_at)}</span>
                        </div>
                        <div className="whitespace-pre-line">{m.body}</div>
                      </div>
                    ))
                  )}
                </div>
                {editable && (
                  <div className="flex gap-2">
                    <input
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="رد على المستخدم في المحادثة…"
                      maxLength={5000}
                      className="flex-1 rounded bg-slate-800 p-2 text-[11px]"
                    />
                    <button type="button" disabled={isPending || !reply.trim()} onClick={() => run("reply", r.id)} className="rounded bg-violet-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">
                      إرسال
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{filtered.length} طلب · صفحة {safePage + 1} من {pageCount}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0} className="rounded bg-slate-800 px-3 py-1 disabled:opacity-40">السابق</button>
          <button type="button" onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))} disabled={safePage >= pageCount - 1} className="rounded bg-slate-800 px-3 py-1 disabled:opacity-40">التالي</button>
        </div>
      </div>
    </div>
  );
}
