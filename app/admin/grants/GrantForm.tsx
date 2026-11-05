"use client";

import { useState, useTransition } from "react";

import { grantCreditsAction, type GrantActionState } from "@/app/admin/actions/grants-manage";
import {
  DEFAULT_EXPIRY_DAYS,
  MANUAL_GRANT_SOURCES,
  MAX_EXPIRY_DAYS,
  MAX_MANUAL_GRANT,
  MIN_EXPIRY_DAYS,
  isUuid,
} from "@/lib/credits/grants";

/**
 * نموذج منح كريدت يدوي.
 *
 * التحقق هنا **تحسين تجربة** فقط؛ الحارس الحقيقي في `grantCreditsAction`
 * على السيرفر (أي طلب يمكن أن يصل بلا هذا النموذج).
 */
export default function GrantForm() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<GrantActionState | null>(null);

  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState<string>(MANUAL_GRANT_SOURCES[0]);
  const [expiresInDays, setExpiresInDays] = useState(String(DEFAULT_EXPIRY_DAYS));
  const [notes, setNotes] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  const submit = () => {
    setClientError(null);
    setResult(null);

    if (!isUuid(userId)) {
      setClientError("user_id: لازم UUID صحيح (انسخه من صفحة المستخدمين)");
      return;
    }
    const amountNumber = Number(amount);
    if (!Number.isInteger(amountNumber) || amountNumber <= 0 || amountNumber > MAX_MANUAL_GRANT) {
      setClientError(`amount: عدد صحيح بين 1 و${MAX_MANUAL_GRANT}`);
      return;
    }
    const days = Number(expiresInDays);
    if (!Number.isInteger(days) || days < MIN_EXPIRY_DAYS || days > MAX_EXPIRY_DAYS) {
      setClientError(`expires_in_days: عدد صحيح بين ${MIN_EXPIRY_DAYS} و${MAX_EXPIRY_DAYS}`);
      return;
    }
    if (!confirm(`منح ${amountNumber} كريدت لهذا المستخدم لمدة ${days} يومًا؟`)) return;

    const fd = new FormData();
    fd.set("user_id", userId.trim());
    fd.set("amount", String(amountNumber));
    fd.set("source", source);
    fd.set("expires_in_days", String(days));
    fd.set("notes", notes);

    startTransition(async () => {
      const res = await grantCreditsAction(fd);
      setResult(res);
      if (res.ok) {
        setAmount("");
        setNotes("");
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="block text-sm text-slate-300 sm:col-span-2">
          User ID
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            dir="ltr"
            className="mt-1 w-full rounded bg-slate-800 p-2 font-mono text-xs"
          />
        </label>

        <label className="block text-sm text-slate-300">
          المبلغ (كريدت)
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            min={1}
            max={MAX_MANUAL_GRANT}
            dir="ltr"
            className="mt-1 w-full rounded bg-slate-800 p-2"
          />
        </label>

        <label className="block text-sm text-slate-300">
          المصدر
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="mt-1 w-full rounded bg-slate-800 p-2"
          >
            {MANUAL_GRANT_SOURCES.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-slate-300">
          الانتهاء بعد (أيام)
          <input
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(e.target.value)}
            type="number"
            min={MIN_EXPIRY_DAYS}
            max={MAX_EXPIRY_DAYS}
            dir="ltr"
            className="mt-1 w-full rounded bg-slate-800 p-2"
          />
        </label>

        <label className="block text-sm text-slate-300 sm:col-span-2 lg:col-span-4">
          ملاحظات (اختياري)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={500}
            className="mt-1 w-full rounded bg-slate-800 p-2"
          />
        </label>
      </div>

      {clientError && (
        <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{clientError}</p>
      )}
      {result && (
        <p
          role="status"
          className={`rounded-xl p-3 text-sm ${result.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}
        >
          {result.message}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-xl bg-marker px-5 py-2 text-sm font-bold text-[var(--on-marker)] disabled:opacity-60"
        >
          {pending ? "جارٍ المنح…" : "منح الكريدت"}
        </button>
      </div>
    </div>
  );
}
