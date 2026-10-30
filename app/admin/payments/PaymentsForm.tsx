"use client";
import { useState } from "react";
import { recordPayment } from "@/app/admin/actions/payments";

export default function PaymentsForm({ adminUserId }: { adminUserId: string }) {
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [method, setMethod] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const res = await recordPayment(
      { userId, amount: Number(amount), currency, method, note },
      adminUserId
    );
    setMsg(res.message);
    setLoading(false);
    if (res.ok) {
      setUserId(""); setAmount(""); setMethod(""); setNote("");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 border rounded p-4">
      <h2 className="font-bold">تسجيل دفعة يدوية</h2>
      <input className="border p-2 w-full" placeholder="User ID (UUID)" value={userId} onChange={(e) => setUserId(e.target.value)} required />
      <input className="border p-2 w-full" placeholder="المبلغ" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      <input className="border p-2 w-full" placeholder="العملة" value={currency} onChange={(e) => setCurrency(e.target.value)} />
      <input className="border p-2 w-full" placeholder="الطريقة (WhatsApp, Bank, ...)" value={method} onChange={(e) => setMethod(e.target.value)} />
      <textarea className="border p-2 w-full" placeholder="ملاحظة" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="bg-blue-600 text-white px-4 py-2 rounded" disabled={loading}>
        {loading ? "جارٍ..." : "تسجيل"}
      </button>
      {msg && <p className="text-sm">{msg}</p>}
    </form>
  );
}
