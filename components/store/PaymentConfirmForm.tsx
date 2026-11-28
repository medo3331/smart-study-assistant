"use client";

import { useState } from "react";
import { confirmPayment } from "@/lib/store/purchase-client";

const METHODS = [
  { value: "vodafone_cash", label: "فودافون كاش" },
  { value: "instapay", label: "إنستا باي" },
  { value: "visa", label: "فيزا" },
  { value: "mastercard", label: "ماستركارد" },
  { value: "other", label: "أخرى" },
] as const;

/**
 * نموذج تأكيد الدفع اليدوي: منهق + رقم العملية/المرجع + ملاحظة اختيارية.
 * عند النجاح يستدعي onConfirmed (الحالة تتحول payment_submitted والأدمن يُشعَر).
 */
export default function PaymentConfirmForm({
  requestId,
  onConfirmed,
  onCancel,
}: {
  requestId: string;
  onConfirmed: () => void;
  onCancel?: () => void;
}) {
  const [method, setMethod] = useState<string>("vodafone_cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    const result = await confirmPayment(requestId, { method, reference: reference.trim(), note: note.trim() || undefined });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onConfirmed();
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm text-[#9AA0C0] mb-1">وسيلة الدفع</label>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="w-full rounded-xl border border-[#2A3050] bg-[#0B0F1E] p-3 text-[#E7E9F5]"
        >
          {METHODS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm text-[#9AA0C0] mb-1">
          رقم العملية / المرجع <span className="text-rose-400">*</span>
        </label>
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="مثال: آخر 4 أرقام أو رقم العملية من تطبيق الدفع"
          maxLength={120}
          dir="ltr"
          className="w-full rounded-xl border border-[#2A3050] bg-[#0B0F1E] p-3 text-[#E7E9F5] placeholder:text-[#5A6180]"
        />
      </div>
      <div>
        <label className="block text-sm text-[#9AA0C0] mb-1">ملاحظة (اختياري)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          className="w-full rounded-xl border border-[#2A3050] bg-[#0B0F1E] p-3 text-[#E7E9F5] placeholder:text-[#5A6180]"
        />
      </div>
      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={submitting || (method !== "other" && reference.trim() === "")}
          className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3 font-bold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {submitting ? "جارٍ الإرسال…" : "تأكيد الدفع"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-xl border border-[#2A3050] px-5 text-[#9AA0C0] hover:text-white disabled:opacity-50"
          >
            لاحقًا
          </button>
        )}
      </div>
    </div>
  );
}
