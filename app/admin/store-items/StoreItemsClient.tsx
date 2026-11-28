"use client";

/**
 * واجهة عناصر المتجر المخصصة — نموذج إضافة + قائمة بالعناصر الحالية مع حذف.
 * الحماية في السيرفر (rewards.manage + Audit Log).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStoreItem, deleteStoreItem, updateStoreItem } from "@/app/admin/actions/store-items";
import { RARITIES, RARITY } from "@/lib/shop/rarity";
import type { CustomStoreItem } from "@/lib/admin/store-items";

const inputCls = "w-full rounded bg-slate-800 border border-slate-700 p-2 text-xs text-slate-200";
const btnCls = "rounded bg-amber-500/20 border border-amber-500/40 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-500/30 disabled:opacity-50";

const SLOT_OPTIONS: { id: string; label: string; hint: string }[] = [
  { id: "posters", label: "بوستر 🖼️", hint: "اقتباس نصي منمق — تقدر تعدّله في أي وقت" },
  { id: "avatar", label: "صورة رمزية 🖼️", hint: "إيموجي واحد أو أكثر — بيظهر بدل الصورة" },
  { id: "title", label: "لقب 🏷️", hint: "نص قصير بيظهر تحت الاسم" },
  { id: "companion", label: "رفيق 🐾", hint: "مراحل مفصولة بـ · زي: 🥚·🐣·🐔" },
];

export function StoreItemsClient({ items }: { items: CustomStoreItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const [slot, setSlot] = useState("posters");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [value, setValue] = useState("");
  const [rarity, setRarity] = useState<string>("common");
  const [price, setPrice] = useState("500");
  const [creditsPrice, setCreditsPrice] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: "", desc: "", value: "", rarity: "common", price: "", creditsPrice: "" });

  function submit() {
    const amt = parseInt(price, 10);
    const cAmt = creditsPrice.trim() === "" ? null : parseInt(creditsPrice, 10);
    startTransition(async () => {
      const res = await createStoreItem({
        slot,
        name,
        desc,
        value,
        rarity,
        price: Number.isFinite(amt) ? amt : -1,
        creditsPrice: cAmt !== null && Number.isFinite(cAmt) ? cAmt : null,
      });
      setFeedback(res);
      if (res.ok) {
        setName(""); setDesc(""); setValue(""); setCreditsPrice("");
        router.refresh();
      }
    });
  }

  function openEdit(it: CustomStoreItem) {
    setEditingId(it.id);
    setEdit({
      name: it.name,
      desc: it.desc,
      value: it.value,
      rarity: it.rarity && isRarityStr(it.rarity) ? it.rarity : "common",
      price: String(it.price),
      creditsPrice: it.creditsPrice === null ? "" : String(it.creditsPrice),
    });
  }

  function isRarityStr(v: string): v is typeof RARITIES[number] {
    return (RARITIES as readonly string[]).includes(v);
  }

  function saveEdit(id: string) {
    const amt = parseInt(edit.price, 10);
    const cRaw = edit.creditsPrice.trim();
    startTransition(async () => {
      const res = await updateStoreItem({
        itemId: id,
        name: edit.name,
        desc: edit.desc,
        value: edit.value,
        rarity: edit.rarity,
        price: Number.isFinite(amt) ? amt : undefined,
        creditsPrice: cRaw === "" ? null : Number.isFinite(parseInt(cRaw, 10)) ? parseInt(cRaw, 10) : undefined,
      });
      setFeedback(res);
      if (res.ok) {
        setEditingId(null);
        router.refresh();
      }
    });
  }

  function toggleActive(it: CustomStoreItem) {
    startTransition(async () => {
      const res = await updateStoreItem({ itemId: it.id, active: !it.active });
      setFeedback(res);
      if (res.ok) router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteStoreItem(id);
      setFeedback(res);
      if (res.ok) router.refresh();
    });
  }

  const slotHint = SLOT_OPTIONS.find((s) => s.id === slot)?.hint;
  const ready = name.trim().length > 0 && value.trim().length > 0 && Number.isInteger(parseInt(price, 10));

  return (
    <div className="space-y-6">
      {feedback && (
        <p className={`text-xs ${feedback.ok ? "text-emerald-400" : "text-rose-400"}`} role="status">
          {feedback.message}
        </p>
      )}

      <section className="rounded-2xl border border-slate-700 p-4">
        <h2 className="text-sm font-extrabold text-amber-300 mb-3">إضافة عنصر جديد</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-[11px] text-slate-300">
            القسم
            <select value={slot} onChange={(e) => setSlot(e.target.value)} className={inputCls}>
              {SLOT_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            {slotHint && <span className="block mt-1 text-[10px] text-slate-500">{slotHint}</span>}
          </label>
          <label className="block text-[11px] text-slate-300">
            الاسم
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={inputCls} />
          </label>
          <label className="block text-[11px] text-slate-300">
            المحتوى (إيموجي / نص اللقب)
            <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={60} dir="auto" className={inputCls} />
          </label>
          <label className="block text-[11px] text-slate-300">
            الندرة
            <select value={rarity} onChange={(e) => setRarity(e.target.value)} className={inputCls}>
              {RARITIES.map((r) => (
                <option key={r} value={r}>{RARITY[r].name}</option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] text-slate-300">
            السعر بالكوينز
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" className={inputCls} />
          </label>
          <label className="block text-[11px] text-slate-300">
            سعر الكريدت الإضافي (اختياري — هجين)
            <input value={creditsPrice} onChange={(e) => setCreditsPrice(e.target.value)} inputMode="numeric" className={inputCls} />
          </label>
          <label className="block text-[11px] text-slate-300 sm:col-span-2">
            الوصف (اختياري)
            <input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={200} className={inputCls} />
          </label>
        </div>
        <button type="button" disabled={pending || !ready} onClick={submit} className={`${btnCls} mt-3`}>
          إضافة للمتجر
        </button>
      </section>

      <section className="rounded-2xl border border-slate-700 p-4">
        <h2 className="text-sm font-extrabold text-amber-300 mb-3">
          العناصر المخصصة ({items.length})
        </h2>
        {items.length === 0 ? (
          <p className="text-[11px] text-slate-400">مفيش عناصر مخصصة لسه.</p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              editingId === it.id ? (
                <div key={it.id} className="border border-amber-500/40 rounded p-3 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="block text-[11px] text-slate-300">
                      الاسم
                      <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={60} className={inputCls} />
                    </label>
                    <label className="block text-[11px] text-slate-300">
                      المحتوى (إيموجي / نص)
                      <input value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} maxLength={60} dir="auto" className={inputCls} />
                    </label>
                    <label className="block text-[11px] text-slate-300">
                      السعر بالكوينز
                      <input value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} inputMode="numeric" className={inputCls} />
                    </label>
                    <label className="block text-[11px] text-slate-300">
                      سعر الكريدت الإضافي (فاضي = كوينز بس)
                      <input value={edit.creditsPrice} onChange={(e) => setEdit({ ...edit, creditsPrice: e.target.value })} inputMode="numeric" className={inputCls} />
                    </label>
                    <label className="block text-[11px] text-slate-300">
                      الندرة
                      <select value={edit.rarity} onChange={(e) => setEdit({ ...edit, rarity: e.target.value })} className={inputCls}>
                        {RARITIES.map((r) => (
                          <option key={r} value={r}>{RARITY[r].name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-[11px] text-slate-300">
                      الوصف
                      <input value={edit.desc} onChange={(e) => setEdit({ ...edit, desc: e.target.value })} maxLength={200} className={inputCls} />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" disabled={pending} onClick={() => saveEdit(it.id)} className={btnCls}>حفظ</button>
                    <button type="button" onClick={() => setEditingId(null)} className="rounded bg-slate-700 px-3 py-1.5 text-xs text-slate-200">إلغاء</button>
                  </div>
                </div>
              ) : (
                <div key={it.id} className={`flex flex-wrap items-center gap-3 text-[12px] border border-slate-700/60 rounded p-2 ${it.active ? "" : "opacity-55"}`}>
                  <span className="text-lg">{it.value || "❔"}</span>
                  <span className="font-bold text-slate-200 min-w-32">{it.name}</span>
                  <span className="text-slate-400">
                    {it.slot} · {RARITY[(it.rarity as keyof typeof RARITY) ?? "common"]?.name ?? it.rarity}
                  </span>
                  <span className="text-amber-300">{it.price} 🪙{it.creditsPrice ? ` + ${it.creditsPrice} 💎` : ""}</span>
                  {!it.active && <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">مخفي</span>}
                  <span dir="ltr" className="font-mono text-[10px] text-slate-500 flex-1 min-w-40">{it.id}</span>
                  <button type="button" disabled={pending} onClick={() => openEdit(it)} className="rounded bg-sky-600/20 border border-sky-600/40 px-2 py-1 text-[11px] font-bold text-sky-300 hover:bg-sky-600/30 disabled:opacity-50">
                    تعديل
                  </button>
                  <button type="button" disabled={pending} onClick={() => toggleActive(it)} className="rounded bg-slate-700 px-2 py-1 text-[11px] text-slate-200 disabled:opacity-50">
                    {it.active ? "إخفاء" : "إظهار"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(it.id)}
                    className="rounded bg-rose-600/20 border border-rose-600/40 px-2 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-600/30 disabled:opacity-50"
                  >
                    حذف
                  </button>
                </div>
              )
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
