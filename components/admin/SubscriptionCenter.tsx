"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { BadgeCheck, BookOpen, CircleAlert, Gift, Search, Sparkles, Users, Wallet } from "lucide-react";
import { grantCreditsAction } from "@/app/admin/actions/grants-manage";
import { searchUsers, type UserSearchResult } from "@/app/admin/actions/users-search";
import { activateSubscription } from "@/app/admin/actions/subscription-activate";
import { issueReward, type RewardType } from "@/app/admin/actions/rewards-issue";

type Props = { initialUsers: UserSearchResult[]; canActivate: boolean; canGrantCredits: boolean; canGrantReward: boolean };
type ActionResult = { id: string; name: string; ok: boolean; message: string };
const CONTROL = "w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20";

export default function SubscriptionCenter({ initialUsers, canActivate, canGrantCredits, canGrantReward }: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [plan, setPlan] = useState("pro");
  const [duration, setDuration] = useState("30");
  const [creditAmount, setCreditAmount] = useState("100");
  const [creditDays, setCreditDays] = useState("90");
  const [rewardType, setRewardType] = useState<RewardType>("upload_credits");
  const [rewardValue, setRewardValue] = useState("10");
  const [rewardDays, setRewardDays] = useState("7");
  const [note, setNote] = useState("");
  const [results, setResults] = useState<ActionResult[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canAct = canActivate || canGrantCredits || canGrantReward;
  const selectedUsers = users.filter((user) => selected.includes(user.id));

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        const found = await searchUsers(query, "all", "all", "all");
        setUsers(found);
        setSelected((current) => current.filter((id) => found.some((user) => user.id === id)));
        setFeedback(`ظهرت ${found.length} نتيجة كحد أقصى.`);
        setResults([]);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "تعذر البحث عن المستخدمين.");
      }
    });
  }

  function runBulk(kind: "subscription" | "credits" | "reward") {
    if (!selectedUsers.length || pending) return;
    const amount = Number(kind === "credits" ? creditAmount : rewardValue);
    const days = Number(kind === "subscription" ? duration : kind === "credits" ? creditDays : rewardDays);
    if (!Number.isInteger(amount) || amount < 1 || amount > 10000) { setFeedback("أدخل كمية صحيحة بين 1 و10,000."); return; }
    if (!Number.isInteger(days) || days < 1 || days > 365) { setFeedback("أدخل مدة صحيحة بين 1 و365 يومًا."); return; }
    const selectedSnapshot = [...selectedUsers];
    const label = kind === "subscription" ? "تفعيل الاشتراك" : kind === "credits" ? "منح الكريدت" : "إصدار الهدية";
    if (!window.confirm(`${label} لـ ${selectedSnapshot.length} مستخدم؟ ستُنفّذ منفصلة لكل UUID، وقد تنجح لبعضهم وتفشل لآخرين.`)) return;
    setResults([]);
    setFeedback(null);
    startTransition(async () => {
      const completed: ActionResult[] = [];
      for (const recipient of selectedSnapshot) {
        let result: { ok: boolean; message: string; userId?: string | null };
        try {
        if (kind === "subscription") {
          result = await activateSubscription({
            recipientUserId: recipient.id,
            planKey: plan,
            durationDays: days,
            note: note || "Bulk subscription activation from admin center",
          });
          if (result.ok && result.userId !== recipient.id) result = { ok: false, message: "رفض أمني: UUID الحساب الناتج لا يطابق الصف المحدد." };
        } else if (kind === "credits") {
          const formData = new FormData();
          formData.set("user_id", recipient.id);
          formData.set("amount", String(amount));
          formData.set("source", "manual");
          formData.set("expires_in_days", String(days));
          formData.set("notes", note);
          result = await grantCreditsAction(formData);
        } else {
          result = await issueReward({
            recipientUserId: recipient.id,
            rewardType,
            rewardValue: amount,
            durationDays: rewardType === "trial_week" || rewardType === "pro_week" ? days : undefined,
            note,
          });
        }
        } catch (error) {
          result = { ok: false, message: error instanceof Error ? error.message : "تعذر تنفيذ العملية لهذا المستخدم." };
        }
        completed.push({ id: recipient.id, name: recipient.display_name || recipient.email || recipient.id.slice(0, 8), ok: result.ok, message: result.message });
        setResults([...completed]);
      }
      setFeedback(`اكتملت المعالجة: نجح ${completed.filter((item) => item.ok).length} من ${completed.length}.`);
    });
  }

  return (
    <section className="space-y-5 rounded-2xl border border-amber-500/30 bg-slate-900/80 p-4 shadow-xl sm:p-6" aria-labelledby="subscription-center-title">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="subscription-center-title" className="flex items-center gap-2 text-lg font-bold text-amber-300"><Users size={19} /> مركز المستخدمين والاشتراكات والمنح</h2>
          <p className="mt-1 max-w-3xl text-xs leading-6 text-slate-400">افتح ملف الطالب للاستهلاك وبيانات الدراسة والتحليلات، أو حدّد أكثر من طالب للإجراء. UUID هو مفتاح الربط والتنفيذ؛ كود MAG معرّف مساعد. كل إجراء يعيد فحص الصلاحيات على الخادم.</p>
        </div>
        <span className="w-fit shrink-0 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-[11px] text-slate-300">{selected.length} محدد · {users.length} نتيجة</span>
      </header>

      <form onSubmit={handleSearch} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
        <label className="sr-only" htmlFor="subscription-center-search">البحث بالاسم أو البريد أو UUID أو كود MAG</label>
        <input id="subscription-center-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="الاسم أو البريد أو كود MAG أو UUID" className={CONTROL} />
        <button type="submit" disabled={pending} className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-600 disabled:cursor-wait disabled:opacity-50"><Search size={16} />{pending ? "جارٍ البحث…" : "بحث"}</button>
        <button type="button" disabled={!users.length || pending} onClick={() => setSelected(users.map((user) => user.id))} className="cursor-pointer rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-200 transition hover:border-amber-400 disabled:opacity-50">تحديد النتائج</button>
      </form>

      {users.length > 0 ? <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[780px] text-right text-xs">
          <thead className="bg-slate-950 text-slate-400"><tr><th className="p-3">اختيار</th><th className="p-3">الطالب</th><th className="p-3">UUID الموحد</th><th className="p-3">كود MAG</th><th className="p-3">الخطة</th><th className="p-3">الملف والتحليلات</th></tr></thead>
          <tbody>{users.map((user) => <tr key={user.id} className="border-t border-slate-800 transition hover:bg-slate-800/40">
            <td className="p-3"><input type="checkbox" aria-label={`اختيار ${user.display_name || user.email || user.id}`} checked={selected.includes(user.id)} onChange={() => toggle(user.id)} className="size-4 cursor-pointer accent-amber-400" /></td>
            <td className="p-3"><span className="block font-semibold text-slate-100">{user.display_name || "بدون اسم"}</span><span className="mt-1 block text-slate-400" dir="ltr">{user.email || "—"}</span></td>
            <td className="p-3 font-mono text-[10px] text-slate-400" dir="ltr" title={user.id}>{user.id.slice(0, 8)}…</td>
            <td className="p-3 font-mono text-amber-300" dir="ltr">{user.user_code || user.public_user_code || "—"}</td>
            <td className="p-3"><span className="rounded-md bg-slate-800 px-2 py-1 text-slate-300">{user.on_trial ? "تجربة" : user.plan_key === "premium" ? "Premium" : "مجانية"}</span></td>
            <td className="p-3"><Link className="inline-flex cursor-pointer items-center gap-1.5 text-blue-300 underline-offset-4 hover:underline" href={`/admin/users/${user.id}`}><BookOpen size={14} />فتح الملف والتحليلات</Link></td>
          </tr>)}</tbody>
        </table>
      </div> : <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">لا توجد نتائج مطابقة.</div>}

      {selectedUsers.length > 0 && <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {canActivate && <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <h3 className="flex items-center gap-2 font-bold text-emerald-300"><Sparkles size={16} />اشتراك جماعي</h3>
          <label className="block text-xs text-slate-300">الخطة<select value={plan} onChange={(event) => setPlan(event.target.value)} className={`${CONTROL} mt-1`}><option value="free">Free</option><option value="pro">Pro</option><option value="ultra">Ultra</option></select></label>
          <label className="block text-xs text-slate-300">المدة (أيام)<input type="number" min={1} max={365} value={duration} onChange={(event) => setDuration(event.target.value)} className={`${CONTROL} mt-1`} /></label>
          <button disabled={pending} onClick={() => runBulk("subscription")} className="w-full cursor-pointer rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-50">{pending ? "جارٍ التنفيذ…" : `تفعيل لـ ${selectedUsers.length} مستخدم`}</button>
        </div>}
        {canGrantCredits && <div className="space-y-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
          <h3 className="flex items-center gap-2 font-bold text-blue-300"><Wallet size={16} />منح كريدت جماعي</h3>
          <label className="block text-xs text-slate-300">الكمية لكل طالب<input type="number" min={1} max={10000} value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} className={`${CONTROL} mt-1`} /></label>
          <label className="block text-xs text-slate-300">تنتهي بعد (أيام)<input type="number" min={1} max={365} value={creditDays} onChange={(event) => setCreditDays(event.target.value)} className={`${CONTROL} mt-1`} /></label>
          <button disabled={pending} onClick={() => runBulk("credits")} className="w-full cursor-pointer rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-400 disabled:cursor-wait disabled:opacity-50">{pending ? "جارٍ التنفيذ…" : `منح لكل واحد من ${selectedUsers.length}`}</button>
        </div>}
        {canGrantReward && <div className="space-y-3 rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
          <h3 className="flex items-center gap-2 font-bold text-purple-300"><Gift size={16} />هدية جماعية</h3>
          <label className="block text-xs text-slate-300">نوع الهدية<select value={rewardType} onChange={(event) => setRewardType(event.target.value as RewardType)} className={`${CONTROL} mt-1`}><option value="upload_credits">Credits رفع/تفريغ</option><option value="limit_boost">زيادة حد الاستخدام</option><option value="trial_week">أسبوع تجربة</option><option value="pro_week">Pro مؤقت</option></select></label>
          <label className="block text-xs text-slate-300">القيمة<input type="number" min={1} max={10000} value={rewardValue} onChange={(event) => setRewardValue(event.target.value)} className={`${CONTROL} mt-1`} /></label>
          {(rewardType === "trial_week" || rewardType === "pro_week") && <label className="block text-xs text-slate-300">المدة (أيام)<input type="number" min={1} max={365} value={rewardDays} onChange={(event) => setRewardDays(event.target.value)} className={`${CONTROL} mt-1`} /></label>}
          <button disabled={pending} onClick={() => runBulk("reward")} className="w-full cursor-pointer rounded-xl bg-purple-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-purple-400 disabled:cursor-wait disabled:opacity-50">{pending ? "جارٍ التنفيذ…" : `إصدار لـ ${selectedUsers.length} مستخدم`}</button>
        </div>}
      </div>}
      {canAct && selectedUsers.length > 0 && <label className="block text-xs text-slate-300">ملاحظة موحدة (اختيارية)<input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className={`${CONTROL} mt-1`} placeholder="سبب الإجراء أو تفاصيل الهدية" /></label>}
      {feedback && <p role="status" aria-live="polite" className="rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-200">{feedback}</p>}
      {results.length > 0 && <ul className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/50 p-3" aria-label="نتائج الإجراءات الجماعية">{results.map((result) => <li key={`${result.id}-${results.indexOf(result)}`} className={`flex items-start gap-2 text-xs ${result.ok ? "text-emerald-300" : "text-rose-300"}`}>{result.ok ? <BadgeCheck size={14} className="mt-0.5 shrink-0" /> : <CircleAlert size={14} className="mt-0.5 shrink-0" />}<span><strong>{result.name}:</strong> {result.message}</span></li>)}</ul>}
      {!canAct && <p className="text-xs text-amber-300">ليس لديك صلاحية لتنفيذ المنح الجماعية. كل صلاحية تُفحص مرة أخرى داخل إجراء الخادم.</p>}
    </section>
  );
}
