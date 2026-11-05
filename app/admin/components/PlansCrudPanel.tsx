"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPlanFormAction, updatePlanFormAction, deletePlanFormAction, togglePlanActiveFormAction } from "@/app/admin/actions/plans-form-action";

type Plan = {
  plan_key: string;
  name: string;
  display_name_ar: string | null;
  price: number | string;
  original_price: number | string | null;
  discount_percentage: number | string | null;
  credits_monthly: number | null;
  profile_limit: number;
  messages_per_2h: number;
  messages_daily: number | null;
  messages_monthly: number | null;
  uploads_daily: number;
  max_file_size_mb: number;
  file_types: string[] | null;
  video_audio_exclusive: boolean;
  trial_days: number;
  is_active: boolean;
  is_popular: boolean;
  features: string[] | null;
};

export default function PlansCrudPanel({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);
  const [dirty, setDirty] = useState(false);

  const openCreate = () => { setEditing(null); setCreating(true); setDirty(false); };
  const openEdit = (p: Plan) => { setCreating(false); setEditing(p); setDirty(false); };
  const close = () => { setEditing(null); setCreating(false); setDirty(false); };

  const submit = (formData: FormData) => {
    if (!confirm("حفظ التعديلات على هذه الخطة؟")) return;
    startTransition(async () => {
      const res = creating
        ? await createPlanFormAction(formData)
        : await updatePlanFormAction(formData);
      setMessage(res.message);
      if (res.ok) { close(); router.refresh(); }
    });
  };

  const remove = (planKey: string) => {
    if (!confirm(`حذف الخطة ${planKey}؟`)) return;
    const fd = new FormData();
    fd.set("plan_key", planKey);
    startTransition(async () => {
      const res = await deletePlanFormAction(fd);
      setMessage(res.message);
      if (res.ok) router.refresh();
    });
  };

  const toggle = (planKey: string, active: boolean) => {
    const fd = new FormData();
    fd.set("plan_key", planKey);
    fd.set("active", String(active));
    startTransition(async () => {
      const res = await togglePlanActiveFormAction(fd);
      setMessage(res.message);
      if (res.ok) router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {message && <div className="rounded-xl bg-slate-800 p-3 text-sm text-amber-200">{message}</div>}
      <button onClick={openCreate} className="rounded-xl bg-marker px-4 py-2 text-sm font-bold text-[var(--on-marker)]">+ إضافة خطة جديدة</button>

      <div className="overflow-x-auto rounded-2xl border border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-amber-300">
            <tr>
              <th className="px-3 py-2 text-right">الخطة</th>
              <th className="px-3 py-2 text-right">الاسم</th>
              <th className="px-3 py-2 text-right">السعر</th>
              <th className="px-3 py-2 text-right">خصم%</th>
              <th className="px-3 py-2 text-right">كردت/شهر</th>
              <th className="px-3 py-2 text-right">مميزات</th>
              <th className="px-3 py-2 text-right">شائعة</th>
              <th className="px-3 py-2 text-right">مفعّلة</th>
              <th className="px-3 py-2 text-right">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.plan_key} className="border-t border-slate-700">
                <td className="px-3 py-2 font-mono text-amber-300" dir="ltr">{p.plan_key}</td>
                <td className="px-3 py-2">{p.display_name_ar || p.name}</td>
                <td className="px-3 py-2">{String(p.price)}</td>
                <td className="px-3 py-2">{String(p.discount_percentage ?? 0)}</td>
                <td className="px-3 py-2 font-mono" dir="ltr">{String(p.credits_monthly ?? 0)}</td>
                <td className="px-3 py-2 text-xs">{(p.features || []).join("، ")}</td>
                <td className="px-3 py-2">{p.is_popular ? "★" : "—"}</td>
                <td className="px-3 py-2">{p.is_active ? "نعم" : "لا"}</td>
                <td className="px-3 py-2 space-x-2 space-x-reverse">
                  <button onClick={() => openEdit(p)} className="rounded bg-slate-700 px-2 py-1 text-xs">تعديل</button>
                  <button onClick={() => toggle(p.plan_key, !p.is_active)} className="rounded bg-slate-700 px-2 py-1 text-xs">{p.is_active ? "تعطيل" : "تفعيل"}</button>
                  <button onClick={() => remove(p.plan_key)} className="rounded bg-rose-700 px-2 py-1 text-xs">حذف</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(creating || editing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-slate-900 p-6 text-slate-100">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">{creating ? "إضافة خطة جديدة" : `تعديل: ${editing?.plan_key}`}</h2>
              <div className="flex items-center gap-3">
                {dirty && <span className="rounded-full bg-amber-400/20 px-2.5 py-1 text-[11px] font-bold text-amber-300">تغييرات غير محفوظة</span>}
                <a href="/pricing" target="_blank" rel="noreferrer" className="text-xs font-bold text-sky-300 underline">معاينة كصفحة المستخدم ↗</a>
              </div>
            </div>
            <form action={submit} onChange={() => setDirty(true)} className="space-y-3">
              {!creating && <input type="hidden" name="plan_key" value={editing?.plan_key ?? ""} />}
              {creating && (
                <label className="block text-sm">معرّف الخطة (plan_key)
                  <input name="plan_key" required className="mt-1 w-full rounded bg-slate-800 p-2" />
                </label>
              )}
              <label className="block text-sm">الاسم (EN)
                <input name="name" required defaultValue={editing?.name ?? ""} className="mt-1 w-full rounded bg-slate-800 p-2" />
              </label>
              <label className="block text-sm">الاسم (AR)
                <input name="display_name_ar" defaultValue={editing?.display_name_ar ?? ""} className="mt-1 w-full rounded bg-slate-800 p-2" />
              </label>
              <div className="grid grid-cols-3 gap-3">
                <label className="block text-sm">السعر Final
                  <input name="price" type="number" step="0.01" required defaultValue={editing?.price ?? 0} className="mt-1 w-full rounded bg-slate-800 p-2" />
                </label>
                <label className="block text-sm">السعر الأصلي
                  <input name="original_price" type="number" step="0.01" defaultValue={editing?.original_price ?? ""} className="mt-1 w-full rounded bg-slate-800 p-2" />
                </label>
                <label className="block text-sm">خصم %
                  <input name="discount_percentage" type="number" step="0.01" defaultValue={editing?.discount_percentage ?? 0} className="mt-1 w-full rounded bg-slate-800 p-2" />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <label className="block text-sm">كردت/شهر (credits_monthly)
                  <input name="credits_monthly" type="number" min={0} step={1} required defaultValue={editing?.credits_monthly ?? 0} className="mt-1 w-full rounded bg-slate-800 p-2" />
                </label>
                <label className="block text-sm">رسائل/يوم
                  <input name="messages_daily" type="number" min={0} step={1} defaultValue={editing?.messages_daily ?? 20} className="mt-1 w-full rounded bg-slate-800 p-2" />
                </label>
                <label className="block text-sm">رسائل/شهر
                  <input name="messages_monthly" type="number" min={0} step={1} defaultValue={editing?.messages_monthly ?? 300} className="mt-1 w-full rounded bg-slate-800 p-2" />
                </label>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <label className="block text-sm">بروفايلات
                  <input name="profile_limit" type="number" required defaultValue={editing?.profile_limit ?? 1} className="mt-1 w-full rounded bg-slate-800 p-2" />
                </label>
                <label className="block text-sm">رسائل/2h
                  <input name="messages_per_2h" type="number" required defaultValue={editing?.messages_per_2h ?? 20} className="mt-1 w-full rounded bg-slate-800 p-2" />
                </label>
                <label className="block text-sm">رفعات/يوم
                  <input name="uploads_daily" type="number" required defaultValue={editing?.uploads_daily ?? 5} className="mt-1 w-full rounded bg-slate-800 p-2" />
                </label>
                <label className="block text-sm">أقصى MB
                  <input name="max_file_size_mb" type="number" required defaultValue={editing?.max_file_size_mb ?? 20} className="mt-1 w-full rounded bg-slate-800 p-2" />
                </label>
              </div>
              <label className="block text-sm">أنواع الملفات (comma)
                <input name="file_types" defaultValue={(editing?.file_types ?? []).join(",")} className="mt-1 w-full rounded bg-slate-800 p-2" />
              </label>
              <label className="block text-sm">أيام تجربة
                <input name="trial_days" type="number" defaultValue={editing?.trial_days ?? 0} className="mt-1 w-full rounded bg-slate-800 p-2" />
              </label>
              <label className="block text-sm">المميزات (كل سطر = ميزة)
                <textarea name="features" rows={5} defaultValue={(editing?.features ?? []).join("\n")} className="mt-1 w-full rounded bg-slate-800 p-2" />
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="video_audio_exclusive" defaultChecked={editing?.video_audio_exclusive ?? false} /> فيديو/صوت</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={editing?.is_active ?? true} /> مفعّلة</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_popular" defaultChecked={editing?.is_popular ?? false} /> الأكثر شعبية</label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={close} className="rounded bg-slate-700 px-4 py-2 text-sm">إلغاء</button>
                <button type="submit" disabled={pending} className="rounded bg-marker px-4 py-2 text-sm font-bold text-[var(--on-marker)]">{pending ? "..." : "حفظ"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

