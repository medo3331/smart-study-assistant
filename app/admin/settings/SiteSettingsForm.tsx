"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ALLOWED_CURRENCIES, renderTemplate } from "@/lib/settings/validation";
import { saveSiteSettings } from "@/app/admin/actions/site-settings-manage";

/** قيم المعاينة — ثابتة للعرض فقط، لا تُرسل للقاعدة. */
const PREVIEW_VARS: Record<string, string> = {
  name: "أحمد",
  mag_code: "MAG-ABCDE",
  plan_name: "Pro",
  price: "199",
};

export default function SiteSettingsForm({
  initial,
}: {
  initial: {
    whatsappNumber: string;
    whatsappTemplate: string;
    defaultCurrency: string;
    subscriptionDurations: string;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const [whatsappNumber, setWhatsappNumber] = useState(initial.whatsappNumber);
  const [whatsappTemplate, setWhatsappTemplate] = useState(initial.whatsappTemplate);
  const [defaultCurrency, setDefaultCurrency] = useState(initial.defaultCurrency);
  const [subscriptionDurations, setSubscriptionDurations] = useState(initial.subscriptionDurations);

  const preview = renderTemplate(whatsappTemplate, PREVIEW_VARS);

  const mark = () => {
    setDirty(true);
    setMessage(null);
  };

  const submit = () => {
    if (!confirm("حفظ إعدادات المنصة؟")) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("whatsapp_number", whatsappNumber);
      fd.set("whatsapp_template", whatsappTemplate);
      fd.set("default_currency", defaultCurrency);
      fd.set("subscription_durations", subscriptionDurations);
      const res = await saveSiteSettings(fd);
      setMessage(res.message);
      if (res.ok) {
        setDirty(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4">
      {message && (
        <div className="rounded-xl bg-slate-800 p-3 text-sm text-amber-200">{message}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block text-sm text-slate-300">
          رقم واتساب للتفعيل
          <input
            value={whatsappNumber}
            onChange={(e) => { setWhatsappNumber(e.target.value); mark(); }}
            placeholder="+201234567890"
            pattern="^\+20[0-9]{10}$"
            dir="ltr"
            className="mt-1 w-full rounded bg-slate-800 p-2 font-mono"
          />
          <span className="mt-1 block text-[11px] text-slate-500">
            الصيغة: +20 ثم 10 أرقام (مثال: +201234567890)
          </span>
        </label>

        <label className="block text-sm text-slate-300">
          العملة الافتراضية
          <select
            value={defaultCurrency}
            onChange={(e) => { setDefaultCurrency(e.target.value); mark(); }}
            className="mt-1 w-full rounded bg-slate-800 p-2"
          >
            {ALLOWED_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>{currency}</option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-slate-500">
            العملات المسموحة حاليًا: {ALLOWED_CURRENCIES.join(", ")}
          </span>
        </label>
      </div>

      <label className="block text-sm text-slate-300">
        مدد الاشتراك (بالأيام، مفصولة بفاصلة)
        <input
          value={subscriptionDurations}
          onChange={(e) => { setSubscriptionDurations(e.target.value); mark(); }}
          placeholder="30,90,365"
          dir="ltr"
          className="mt-1 w-full rounded bg-slate-800 p-2 font-mono"
        />
        <span className="mt-1 block text-[11px] text-slate-500">
          أعداد صحيحة أكبر من صفر — تُرتَّب وتُزال المكرّرة تلقائيًا.
        </span>
      </label>

      <label className="block text-sm text-slate-300">
        قالب رسالة الاشتراك
        <textarea
          value={whatsappTemplate}
          onChange={(e) => { setWhatsappTemplate(e.target.value); mark(); }}
          rows={3}
          maxLength={500}
          className="mt-1 w-full rounded bg-slate-800 p-2"
        />
        <span className="mt-1 block text-[11px] text-slate-500">
          المتغيّرات المسموحة: {"{name}"} · {"{mag_code}"} · {"{plan_name}"} · {"{price}"}
        </span>
      </label>

      <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3">
        <p className="mb-1 text-[11px] font-bold text-sky-300">معاينة حيّة (بقيم تجريبية)</p>
        <p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{preview || "—"}</p>
      </div>

      <div className="flex items-center justify-end gap-3">
        {dirty && (
          <span className="rounded-full bg-amber-400/20 px-2.5 py-1 text-[11px] font-bold text-amber-300">
            تغييرات غير محفوظة
          </span>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-xl bg-marker px-5 py-2 text-sm font-bold text-[var(--on-marker)] disabled:opacity-60"
        >
          {pending ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
        </button>
      </div>
    </div>
  );
}
