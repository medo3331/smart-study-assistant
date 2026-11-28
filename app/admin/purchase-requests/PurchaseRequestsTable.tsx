"use client";

import { useMemo, useState, useTransition } from "react";
import { approvePurchaseRequest, rejectPurchaseRequest } from "@/app/admin/actions/purchase-requests";
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

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
}

export default function PurchaseRequestsTable({ requests }: { requests: PurchaseRequestAdminView[] }) {
  const [statusFilter, setStatusFilter] = useState<"all" | PurchaseRequestAdminView["status"]>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
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

  function runAction(id: string, action: "approve" | "reject") {
    setPendingId(id);
    setFeedback(null);
    startTransition(async () => {
      const result = action === "approve" ? await approvePurchaseRequest(id, note) : await rejectPurchaseRequest(id, note);
      setFeedback({ ok: result.ok, message: result.message });
      setPendingId(null);
      setNoteFor(null);
      setNote("");
    });
  }

  return (
    <div className="space-y-3">
      {feedback && (
        <div
          role="status"
          className={`rounded-xl border px-3 py-2 text-sm ${
            feedback.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-rose-500/30 bg-rose-500/10 text-rose-300"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-sm text-slate-300">
          الحالة
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(0); }}
            className="mt-1 w-full rounded bg-slate-800 p-2"
          >
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
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="mt-1 w-full rounded bg-slate-800 p-2"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-700">
        <table className="w-full text-[11px] sm:text-xs">
          <thead className="bg-slate-900/60 text-amber-300">
            <tr>
              <th className="px-3 py-2 text-right">المستخدم</th>
              <th className="px-3 py-2 text-right">النوع</th>
              <th className="px-3 py-2 text-right">الهدف</th>
              <th className="px-3 py-2 text-right">المبلغ</th>
              <th className="px-3 py-2 text-right">الدفع</th>
              <th className="px-3 py-2 text-right">الحالة</th>
              <th className="px-3 py-2 text-right">أُنشئ</th>
              <th className="px-3 py-2 text-right">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-400">لا توجد طلبات مطابقة</td>
              </tr>
            ) : (
              rows.map((r) => {
                const isPendingReview = r.status === "payment_submitted";
                const busy = isPending && pendingId === r.id;
                return (
                  <tr key={r.id} className={`border-t border-slate-700/70 ${isPendingReview ? "bg-amber-500/5" : ""}`}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.user_name || r.user_email || "—"}</div>
                      <div className="font-mono text-[10px] text-slate-500" dir="ltr">
                        {r.user_code ? `${r.user_code} · ` : ""}{r.user_id.slice(0, 8)}…
                      </div>
                    </td>
                    <td className="px-3 py-2">{r.kind === "plan" ? "اشتراك" : "كريدت"}</td>
                    <td className="px-3 py-2">
                      {r.kind === "plan"
                        ? `${r.plan_key === "pro" ? "احترافي" : r.plan_key === "ultra" ? "ألتميت" : r.plan_key} · ${r.plan_duration_days} يوم`
                        : `${r.credits} كريدت`}
                    </td>
                    <td className="px-3 py-2 font-mono" dir="ltr">{r.amount ?? 0} {r.currency}</td>
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
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS[r.status].cls}`}>
                        {STATUS[r.status].text}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.created_at)}</td>
                    <td className="px-3 py-2">
                      {isPendingReview ? (
                        noteFor === r.id ? (
                          <div className="flex flex-col gap-1 min-w-44">
                            <input
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              placeholder="ملاحظة (اختياري)"
                              className="rounded bg-slate-800 p-1.5 text-[11px]"
                              maxLength={500}
                            />
                            <div className="flex gap-1">
                              <button
                                type="button"
                                disabled={busy || isPending}
                                onClick={() => runAction(r.id, "approve")}
                                className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                              >
                                {busy ? "…" : "قبول"}
                              </button>
                              <button
                                type="button"
                                disabled={busy || isPending}
                                onClick={() => runAction(r.id, "reject")}
                                className="rounded bg-rose-600 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                              >
                                رفض
                              </button>
                              <button
                                type="button"
                                onClick={() => { setNoteFor(null); setNote(""); }}
                                className="rounded bg-slate-700 px-2 py-1 text-[11px]"
                              >
                                إلغاء
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setNoteFor(r.id); setNote(""); setFeedback(null); }}
                            className="rounded bg-amber-600 px-2 py-1 text-[11px] font-bold text-white"
                          >
                            مراجعة
                          </button>
                        )
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
