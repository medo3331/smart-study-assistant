"use client";
import { useState } from "react";
import { recordPayment, updatePayment, deletePayment } from "@/app/admin/actions/payments";

type Payment = {
  id: string;
  user_id: string;
  payer_name: string | null;
  amount: string;
  currency: string;
  method: string | null;
  note: string | null;
  paid_at: string | null;
};

export default function PaymentsManager({ adminUserId, initial }: { adminUserId: string; initial: Payment[] }) {
  const [rows, setRows] = useState<Payment[]>(initial);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [form, setForm] = useState({ userId: "", payerName: "", amount: "", currency: "USD", method: "", note: "", paidAt: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    // simple: reload page
    window.location.reload();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const res = await recordPayment(
      { userId: form.userId, payerName: form.payerName, amount: Number(form.amount), currency: form.currency, method: form.method, note: form.note, paidAt: form.paidAt },
      adminUserId
    );
    setMsg(res.message);
    setLoading(false);
    if (res.ok) refresh();
  }

  async function saveEdit() {
    if (!editing) return;
    setLoading(true);
    const res = await updatePayment({
      id: editing.id,
      payerName: editing.payer_name ?? "",
      amount: Number(editing.amount),
      currency: editing.currency,
      method: editing.method ?? "",
      note: editing.note ?? "",
      paidAt: editing.paid_at ?? "",
    });
    setMsg(res.message);
    setLoading(false);
    if (res.ok) refresh();
  }

  async function remove(id: string) {
    if (!confirm("حذف الدفعة؟")) return;
    setLoading(true);
    const res = await deletePayment(id);
    setMsg(res.message);
    setLoading(false);
    if (res.ok) refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-3 border rounded p-4">
        <h2 className="font-bold">تسجيل دفعة يدوية</h2>
        <input className="border p-2 w-full" placeholder="User ID (UUID)" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} required />
        <input className="border p-2 w-full" placeholder="اسم الدافع" value={form.payerName} onChange={(e) => setForm({ ...form, payerName: e.target.value })} />
        <input className="border p-2 w-full" placeholder="المبلغ" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        <input className="border p-2 w-full" placeholder="العملة" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
        <input className="border p-2 w-full" placeholder="الطريقة" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} />
        <input className="border p-2 w-full" type="datetime-local" value={form.paidAt} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} />
        <textarea className="border p-2 w-full" placeholder="ملاحظة" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <button className="bg-blue-600 text-white px-4 py-2 rounded" disabled={loading}>تسجيل</button>
        {msg && <p className="text-sm">{msg}</p>}
      </form>

      <table className="w-full text-sm border">
        <thead>
          <tr>
            <th>الدافع</th><th>المستخدم</th><th>المبلغ</th><th>العملة</th><th>الطريقة</th><th>التاريخ</th><th>ملاحظة</th><th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td>{editing?.id === r.id ? <input className="border p-1" value={editing.payer_name ?? ""} onChange={(e) => setEditing({ ...editing, payer_name: e.target.value })} /> : (r.payer_name || "—")}</td>
              <td className="text-xs">{r.user_id}</td>
              <td>{editing?.id === r.id ? <input className="border p-1 w-20" type="number" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} /> : r.amount}</td>
              <td>{editing?.id === r.id ? <input className="border p-1 w-16" value={editing.currency} onChange={(e) => setEditing({ ...editing, currency: e.target.value })} /> : r.currency}</td>
              <td>{editing?.id === r.id ? <input className="border p-1" value={editing.method ?? ""} onChange={(e) => setEditing({ ...editing, method: e.target.value })} /> : (r.method || "—")}</td>
              <td>{editing?.id === r.id ? <input className="border p-1" type="datetime-local" value={editing.paid_at ? editing.paid_at.slice(0,16) : ""} onChange={(e) => setEditing({ ...editing, paid_at: new Date(e.target.value).toISOString() })} /> : (r.paid_at ? new Date(r.paid_at).toLocaleString() : "—")}</td>
              <td>{editing?.id === r.id ? <input className="border p-1" value={editing.note ?? ""} onChange={(e) => setEditing({ ...editing, note: e.target.value })} /> : (r.note || "—")}</td>
              <td className="space-x-2">
                {editing?.id === r.id ? (
                  <>
                    <button className="text-green-400" onClick={saveEdit} disabled={loading}>حفظ</button>
                    <button className="text-gray-400" onClick={() => setEditing(null)}>إلغاء</button>
                  </>
                ) : (
                  <>
                    <button className="text-blue-400" onClick={() => setEditing(r)}>تعديل</button>
                    <button className="text-red-400" onClick={() => remove(r.id)}>حذف</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
