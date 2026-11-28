"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { BadgeCheck, BookOpen, CircleAlert, CreditCard, Gift, Search, Sparkles, Users, Wallet } from "lucide-react";
import { grantCreditsAction } from "@/app/admin/actions/grants-manage";
import { searchUsersAll, type UserSearchResult } from "@/app/admin/actions/users-search";
import { activateSubscription } from "@/app/admin/actions/subscription-activate";
import { revokeSubscription } from "@/app/admin/actions/subscription-manage";
import { banUser, unbanUser } from "@/app/admin/actions/users-ban";
import { updateUserOperations, type UserOperationsInput } from "@/app/admin/actions/user-operations";
import { issueReward, type RewardType } from "@/app/admin/actions/rewards-issue";

type Props = {
  initialUsers: UserSearchResult[];
  canActivate: boolean;
  canRevoke: boolean;
  canManageOps: boolean;
  canBan: boolean;
  canUnban: boolean;
  canGrantCredits: boolean;
  canGrantReward: boolean;
};
type ActionResult = { id: string; name: string; ok: boolean; message: string };
const CONTROL = "w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20";
const CATEGORY_LABELS: Record<string, string> = { normal: "عادي", vip: "مميز", follow_up: "متابعة", at_risk: "معرّض للتوقف", other: "آخر" };
const ISSUE_LABELS: Record<string, string> = { none: "لا توجد", open: "مفتوحة", in_progress: "جاري الحل", resolved: "تم الحل", closed: "مغلقة", pending: "بانتظار الرد" };

function planLabel(user: UserSearchResult) {
  if (user.plan_status === "unknown") return "غير متاح";
  if (user.plan_status === "free") return "Free · مجاني";
  const key = user.plan_key?.toLowerCase();
  return key === "pro" ? "Pro" : key === "ultra" ? "Ultra" : key === "premium" ? "Premium" : user.plan_key || "اشتراك";
}

function planTone(status: UserSearchResult["plan_status"]) {
  return status === "active" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : status === "expired" ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : status === "unknown" ? "border-slate-600 bg-slate-800 text-slate-300" : "border-slate-700 bg-slate-900 text-slate-300";
}

export default function SubscriptionCenter({ initialUsers, canActivate, canRevoke, canManageOps, canBan, canUnban, canGrantCredits, canGrantReward }: Props) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [planFilter, setPlanFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [issueFilter, setIssueFilter] = useState("all");
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
  const canAct = canActivate || canManageOps || canGrantCredits || canGrantReward;
  const filteredUsers = users.filter((user) =>
    (planFilter === "all" || (planFilter === "active" ? user.plan_status === "active" : planFilter === "expired" ? user.plan_status === "expired" : user.plan_status === "free")) &&
    (paymentFilter === "all" || user.payment_status === paymentFilter) &&
    (categoryFilter === "all" || (user.admin_category || "normal") === categoryFilter) &&
    (issueFilter === "all" || (issueFilter === "open" ? user.issue_status != null && !["none", "resolved", "closed"].includes(user.issue_status) : issueFilter === "resolved" ? ["resolved", "closed"].includes(user.issue_status || "") : (user.issue_status || "none") === "none"))
  );
  const selectedUsers = filteredUsers.filter((user) => selected.includes(user.id));

  async function refreshUsers() {
    try {
      const found = await searchUsersAll(query);
      setUsers(found);
      setSelected((current) => current.filter((id) => found.some((user) => user.id === id)));
      router.refresh();
    } catch {
      router.refresh();
    }
  }

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        const found = await searchUsersAll(query);
        setUsers(found);
        setSelected((current) => current.filter((id) => found.some((user) => user.id === id)));
        setFeedback(`ظهرت ${found.length} نتيجة (كل المسجلين).`);
        setResults([]);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "تعذر البحث عن المستخدمين.");
      }
    });
  }

  async function saveUserOps(user: UserSearchResult, formData: FormData) {
    const paymentChoice = String(formData.get("paymentStatus"));
    const paymentStatus: UserOperationsInput["paymentStatus"] = paymentChoice === "preserve" ? null : paymentChoice as Exclude<UserOperationsInput["paymentStatus"], null>;
    const amountText = String(formData.get("paidAmount") ?? "").trim();
    const requestedPaymentStatus = paymentStatus;
    if (requestedPaymentStatus === "paid" && (!amountText || !Number.isFinite(Number(amountText)) || Number(amountText) <= 0)) {
      setFeedback("أدخل مبلغًا موجبًا لإثبات حالة الدفع.");
      return;
    }
    const result = await updateUserOperations({
      userId: user.id,
      category: String(formData.get("category")) as UserOperationsInput["category"],
      paymentStatus: requestedPaymentStatus,
      paidAmount: requestedPaymentStatus === "paid" ? Number(amountText) : null,
      currency: String(formData.get("currency") || "EGP"),
      paymentMethod: String(formData.get("paymentMethod") || ""),
      issueStatus: String(formData.get("issueStatus")) as UserOperationsInput["issueStatus"],
      internalNote: String(formData.get("internalNote") || ""),
    });
    setFeedback(result.message);
    if (result.ok) await refreshUsers();
  }

  function activateOne(user: UserSearchResult) {
    if (!canActivate || pending) return;
    const days = Number(duration);
    if (!Number.isInteger(days) || days < 1 || days > 365) { setFeedback("أدخل مدة صحيحة بين 1 و365 يومًا."); return; }
    if (!window.confirm(`تفعيل ${plan.toUpperCase()} للمستخدم ${user.display_name || user.email || user.id} لمدة ${days} يوم؟`)) return;
    startTransition(async () => {
      const result = await activateSubscription({ recipientUserId: user.id, planKey: plan, durationDays: days, note: note || "تفعيل من مركز المستخدمين" });
      setFeedback(result.message);
      if (result.ok) {
        const refreshed = await searchUsersAll(query);
        setUsers(refreshed);
        setSelected((current) => current.filter((id) => refreshed.some((row) => row.id === id)));
        router.refresh();
      }
    });
  }

  function toggleBan(user: UserSearchResult) {
    if (pending || (user.is_banned ? !canUnban : !canBan)) return;
    const label = user.is_banned ? "فك الحظر عن" : "حظر";
    if (!window.confirm(`${label} المستخدم ${user.display_name || user.email || user.id}؟`)) return;
    startTransition(async () => {
      const result = user.is_banned
        ? await unbanUser(user.id, user.user_code)
        : await banUser(user.id, user.user_code, "حظر من مركز المستخدمين");
      setFeedback(result.message);
      if (result.ok) await refreshUsers();
    });
  }

  function revokeOne(user: UserSearchResult) {
    if (!canRevoke || pending || !user.active_activation_id) return;
    if (!window.confirm(`إلغاء اشتراك ${user.display_name || user.email || user.id}؟`)) return;
    startTransition(async () => {
      const result = await revokeSubscription(user.id, "إلغاء من مركز المستخدمين");
      setFeedback(result.message);
      if (result.ok) await refreshUsers();
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
    if (!window.confirm(`${label} لـ ${selectedSnapshot.length} مستخدم؟ ستُنفّذ منفصلة لكل مستخدم، وقد تنجح لبعضهم وتفشل لآخرين.`)) return;
    setResults([]);
    setFeedback(null);
    startTransition(async () => {
      const completed: ActionResult[] = [];
      for (const recipient of selectedSnapshot) {
        let result: { ok: boolean; message: string; userId?: string | null };
        try {
          if (kind === "subscription") {
            result = await activateSubscription({ recipientUserId: recipient.id, planKey: plan, durationDays: days, note: note || "Bulk subscription activation from admin center" });
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
            result = await issueReward({ recipientUserId: recipient.id, rewardType, rewardValue: amount, durationDays: rewardType === "trial_week" || rewardType === "pro_week" ? days : undefined, note });
          }
        } catch (error) {
          result = { ok: false, message: error instanceof Error ? error.message : "تعذر تنفيذ العملية لهذا المستخدم." };
        }
        completed.push({ id: recipient.id, name: recipient.display_name || recipient.email || recipient.id.slice(0, 8), ok: result.ok, message: result.message });
        setResults([...completed]);
      }
      setFeedback(`اكتملت المعالجة: نجح ${completed.filter((item) => item.ok).length} من ${completed.length}.`);
      await refreshUsers();
    });
  }

  return (
    <section className="space-y-5 rounded-2xl border border-amber-500/30 bg-slate-900/80 p-4 shadow-xl sm:p-6" aria-labelledby="subscription-center-title">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="subscription-center-title" className="flex items-center gap-2 text-lg font-bold text-amber-300"><Users size={19} /> مركز المستخدمين والاشتراكات</h2>
          <p className="mt-1 max-w-3xl text-xs leading-6 text-slate-400">ملف المستخدم، خطته الحالية، الدفع، التصنيف، ومتابعة المشاكل في قائمة واحدة. افتح إدارة الصف لإجراء التغييرات، أو اضغط الملف لعرض استخدامه وبياناته.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]"><span className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-300">{selectedUsers.length} محدد · {filteredUsers.length} نتيجة ظاهرة</span>{canManageOps || canActivate || canGrantCredits || canGrantReward ? <button type="button" disabled={!filteredUsers.length || pending} onClick={() => setSelected(filteredUsers.map((user) => user.id))} className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300 hover:border-amber-400 disabled:opacity-50">تحديد الظاهر</button> : null}</div>
      </header>

      <form onSubmit={handleSearch} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
        <label className="sr-only" htmlFor="subscription-center-search">البحث بالاسم أو البريد أو UUID أو كود MAG</label>
        <input id="subscription-center-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="الاسم أو البريد أو كود MAG أو UUID" className={CONTROL} />
        <button type="submit" disabled={pending} className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-600 disabled:cursor-wait disabled:opacity-50"><Search size={16} />{pending ? "جارٍ البحث…" : "بحث"}</button>
        <button type="button" disabled={!users.length || pending} onClick={() => setSelected(filteredUsers.map((user) => user.id))} className="cursor-pointer rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-200 transition hover:border-amber-400 disabled:opacity-50">تحديد النتائج</button>
      </form>

      {users.length > 0 ? <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-[11px] text-slate-400">الاشتراك<select value={planFilter} onChange={(event) => setPlanFilter(event.target.value)} className={`${CONTROL} mt-1`}><option value="all">كل الخطط</option><option value="active">اشتراك نشط</option><option value="expired">منتهي</option><option value="free">مجاني</option></select></label>
        <label className="text-[11px] text-slate-400">الدفع<select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} className={`${CONTROL} mt-1`}><option value="all">كل حالات الدفع</option><option value="paid">مدفوع</option><option value="unpaid">غير مدفوع</option><option value="unknown">غير معروف</option></select></label>
        <label className="text-[11px] text-slate-400">التصنيف<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={`${CONTROL} mt-1`}><option value="all">كل التصنيفات</option><option value="normal">عادي</option><option value="vip">مميز</option><option value="follow_up">متابعة</option><option value="at_risk">معرّض للتوقف</option><option value="other">آخر</option></select></label>
        <label className="text-[11px] text-slate-400">المشاكل<select value={issueFilter} onChange={(event) => setIssueFilter(event.target.value)} className={`${CONTROL} mt-1`}><option value="all">كل الحالات</option><option value="open">مفتوحة</option><option value="resolved">تم الحل</option><option value="none">لا توجد</option></select></label>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[1050px] text-right text-xs">
          <thead className="bg-slate-950 text-slate-400"><tr><th className="p-3">اختيار</th><th className="p-3">المستخدم / الملف</th><th className="p-3">الخطة الحالية</th><th className="p-3">الدفع</th><th className="p-3">التصنيف</th><th className="p-3">المتابعة</th><th className="p-3">إدارة</th></tr></thead>
          <tbody>{filteredUsers.map((user) => {
            const hasIssue = user.issue_status != null && !["none", "resolved", "closed"].includes(user.issue_status);
            return <tr key={user.id} className="border-t border-slate-800 align-top transition hover:bg-slate-800/40">
              <td className="p-3"><input type="checkbox" aria-label={`اختيار ${user.display_name || user.email || user.id}`} checked={selected.includes(user.id)} onChange={() => toggle(user.id)} className="size-4 cursor-pointer accent-amber-400" /></td>
              <td className="p-3"><Link className="block font-semibold text-slate-100 underline decoration-slate-600 underline-offset-4 hover:text-amber-300" href={`/admin/users/${user.id}`}>{user.display_name || "بدون اسم"}</Link><span className="mt-1 block text-slate-400" dir="ltr">{user.email || "—"}</span><span className="mt-1 block font-mono text-[10px] text-amber-300" dir="ltr">{user.user_code || user.public_user_code || user.id.slice(0, 8)}</span></td>
              <td className="p-3"><span className={`inline-flex rounded-full border px-2.5 py-1 font-semibold ${planTone(user.plan_status)}`}>{planLabel(user)}</span><span className="mt-1 block text-[10px] text-slate-500">{user.plan_status === "active" ? "نشطة" : user.plan_status === "expired" ? "منتهية" : user.plan_status === "free" ? "لا يوجد اشتراك مدفوع" : "تحقق من إعداد الترحيل"}{user.plan_expires_at ? ` · حتى ${new Date(user.plan_expires_at).toLocaleDateString("ar-EG")}` : ""}</span></td>
              <td className="p-3"><span className={user.payment_status === "paid" ? "font-bold text-emerald-300" : user.payment_status === "unpaid" ? "font-bold text-amber-300" : "text-slate-400"}>{user.payment_status === "paid" ? "مدفوع" : user.payment_status === "unpaid" ? "غير مدفوع" : "غير معروف"}</span>{user.payment_total != null ? <span className="mt-1 block text-slate-400">{user.payment_total.toLocaleString("ar-EG")} {user.payment_currency || ""}</span> : null}</td>
              <td className="p-3"><span className="rounded-md bg-slate-800 px-2 py-1 text-slate-300">{CATEGORY_LABELS[user.admin_category || "normal"] || user.admin_category || "عادي"}</span></td>
              <td className="p-3"><span className={hasIssue ? "font-bold text-rose-300" : user.issue_status === "resolved" ? "text-emerald-300" : "text-slate-400"}>{ISSUE_LABELS[user.issue_status || "none"] || "لا توجد"}</span>{user.issue_note ? <span className="mt-1 block max-w-48 truncate text-slate-500" title={user.issue_note}>{user.issue_note}</span> : null}</td>
              <td className="p-3"><button type="button" onClick={() => { setExpanded((current) => current === user.id ? null : user.id); setFeedback(null); }} className="rounded-lg border border-amber-500/40 px-3 py-1.5 font-semibold text-amber-300 hover:bg-amber-500/10">{expanded === user.id ? "إغلاق" : "إدارة المستخدم"}</button></td>
            </tr>;
          })}</tbody>
        </table>
        {filteredUsers.length === 0 ? <div className="p-6 text-center text-slate-400">لا توجد نتائج بهذه الفلاتر.</div> : null}
        {expanded ? (() => {
          const user = users.find((row) => row.id === expanded);
          if (!user) return null;
          return <div className="border-t border-amber-500/20 bg-slate-950/70 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-slate-100">إدارة {user.display_name || user.email || user.id}</h3><p className="mt-1 text-xs text-slate-400">الخطة: {planLabel(user)} · الدفع: {user.payment_status === "paid" ? "مدفوع" : user.payment_status === "unpaid" ? "غير مدفوع" : "غير معروف"}</p></div><Link href={`/admin/users/${user.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 px-3 py-2 text-xs text-blue-300 hover:bg-blue-500/10"><BookOpen size={14} />فتح الملف والاستخدام</Link></div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {canActivate && <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"><h4 className="flex items-center gap-2 font-bold text-emerald-300"><Sparkles size={15} />تفعيل أو تغيير الخطة</h4><div className="grid grid-cols-2 gap-2"><label className="text-xs text-slate-300">الخطة<select value={plan} onChange={(event) => setPlan(event.target.value)} className={`${CONTROL} mt-1`}><option value="pro">Pro</option><option value="ultra">Ultra</option><option value="free">Free</option></select></label><label className="text-xs text-slate-300">المدة بالأيام<input type="number" min={1} max={365} value={duration} onChange={(event) => setDuration(event.target.value)} className={`${CONTROL} mt-1`} /></label></div><button type="button" disabled={pending} onClick={() => activateOne(user)} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50">تفعيل/تجديد وإظهار الخطة فورًا</button>{canRevoke && user.active_activation_id ? <button type="button" disabled={pending} onClick={() => revokeOne(user)} className="mr-2 rounded-lg border border-rose-500/40 px-4 py-2 text-sm font-bold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">إلغاء الاشتراك</button> : null}{(user.is_banned ? canUnban : canBan) ? <button type="button" disabled={pending} onClick={() => toggleBan(user)} className="mr-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50">{user.is_banned ? "فك الحظر" : "حظر المستخدم"}</button> : null}</div>}
              {canManageOps && <form action={(formData) => startTransition(async () => { await saveUserOps(user, formData); })} className="space-y-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4"><h4 className="flex items-center gap-2 font-bold text-blue-300"><CreditCard size={15} />التصنيف والدفع ومشكلة المستخدم</h4><div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><label className="text-xs text-slate-300">تصنيف المستخدم<select name="category" defaultValue={user.admin_category || "normal"} className={`${CONTROL} mt-1`}><option value="normal">عادي</option><option value="vip">مميز</option><option value="follow_up">يحتاج متابعة</option><option value="at_risk">معرّض للتوقف</option><option value="other">آخر</option></select></label><label className="text-xs text-slate-300">حالة الدفع<select name="paymentStatus" defaultValue="preserve" className={`${CONTROL} mt-1`}><option value="preserve">دون تغيير</option><option value="unknown">غير معروف</option><option value="unpaid">غير مدفوع</option><option value="paid">تم الدفع</option></select></label><label className="text-xs text-slate-300">المبلغ المدفوع<input name="paidAmount" type="number" min="0.01" step="0.01" defaultValue="" className={`${CONTROL} mt-1`} placeholder={user.payment_status === "paid" && user.payment_total != null ? `مسجل سابقًا: ${user.payment_total}` : "مثال: 500"} /></label><label className="text-xs text-slate-300">العملة وطريقة الدفع<div className="mt-1 grid grid-cols-2 gap-2"><input name="currency" maxLength={3} defaultValue={user.payment_currency || "EGP"} className={CONTROL} aria-label="العملة" /><input name="paymentMethod" defaultValue={user.payment_method || ""} className={CONTROL} placeholder="فوري/تحويل/نقدي" aria-label="طريقة الدفع" /></div></label><label className="text-xs text-slate-300 sm:col-span-2">حالة المشكلة/المتابعة<select name="issueStatus" defaultValue={user.issue_status || "none"} className={`${CONTROL} mt-1`}><option value="none">لا توجد مشكلة</option><option value="open">مفتوحة</option><option value="in_progress">جاري الحل</option><option value="resolved">تم الحل</option></select></label><label className="text-xs text-slate-300 sm:col-span-2">ملاحظة داخلية<textarea name="internalNote" maxLength={1000} defaultValue={user.internal_note || ""} className={`${CONTROL} mt-1 min-h-20`} placeholder="تفاصيل الدفع أو المشكلة أو المطلوب متابعته" /></label></div><button type="submit" disabled={pending} className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-bold text-white hover:bg-blue-400 disabled:opacity-50">حفظ التصنيف والدفع والمتابعة</button></form>}
            </div>
          </div>;
        })() : null}
      </div>
      </> : <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">لا توجد نتائج مطابقة.</div>}

      {selectedUsers.length > 0 && <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {canActivate && <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"><h3 className="flex items-center gap-2 font-bold text-emerald-300"><Sparkles size={16} />اشتراك جماعي</h3><label className="block text-xs text-slate-300">الخطة<select value={plan} onChange={(event) => setPlan(event.target.value)} className={`${CONTROL} mt-1`}><option value="pro">Pro</option><option value="ultra">Ultra</option><option value="free">Free</option></select></label><label className="block text-xs text-slate-300">المدة (أيام)<input type="number" min={1} max={365} value={duration} onChange={(event) => setDuration(event.target.value)} className={`${CONTROL} mt-1`} /></label><button disabled={pending} onClick={() => runBulk("subscription")} className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50">{pending ? "جارٍ التنفيذ…" : `تفعيل لـ ${selectedUsers.length} مستخدم`}</button></div>}
        {canGrantCredits && <div className="space-y-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4"><h3 className="flex items-center gap-2 font-bold text-blue-300"><Wallet size={16} />منح كريدت جماعي</h3><label className="block text-xs text-slate-300">الكمية لكل طالب<input type="number" min={1} max={10000} value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} className={`${CONTROL} mt-1`} /></label><label className="block text-xs text-slate-300">تنتهي بعد (أيام)<input type="number" min={1} max={365} value={creditDays} onChange={(event) => setCreditDays(event.target.value)} className={`${CONTROL} mt-1`} /></label><button disabled={pending} onClick={() => runBulk("credits")} className="w-full rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-400 disabled:opacity-50">{pending ? "جارٍ التنفيذ…" : `منح لكل واحد من ${selectedUsers.length}`}</button></div>}
        {canGrantReward && <div className="space-y-3 rounded-xl border border-purple-500/20 bg-purple-500/5 p-4"><h3 className="flex items-center gap-2 font-bold text-purple-300"><Gift size={16} />هدية جماعية</h3><label className="block text-xs text-slate-300">نوع الهدية<select value={rewardType} onChange={(event) => setRewardType(event.target.value as RewardType)} className={`${CONTROL} mt-1`}><option value="upload_credits">Credits رفع/تفريغ</option><option value="limit_boost">زيادة حد الاستخدام</option><option value="trial_week">أسبوع تجربة</option><option value="pro_week">Pro مؤقت</option></select></label><label className="block text-xs text-slate-300">القيمة<input type="number" min={1} max={10000} value={rewardValue} onChange={(event) => setRewardValue(event.target.value)} className={`${CONTROL} mt-1`} /></label>{(rewardType === "trial_week" || rewardType === "pro_week") && <label className="block text-xs text-slate-300">المدة (أيام)<input type="number" min={1} max={365} value={rewardDays} onChange={(event) => setRewardDays(event.target.value)} className={`${CONTROL} mt-1`} /></label>}<button disabled={pending} onClick={() => runBulk("reward")} className="w-full rounded-xl bg-purple-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-purple-400 disabled:opacity-50">{pending ? "جارٍ التنفيذ…" : `إصدار لـ ${selectedUsers.length} مستخدم`}</button></div>}
      </div>}
      {canAct && selectedUsers.length > 0 && <label className="block text-xs text-slate-300">ملاحظة موحدة للإجراءات الجماعية<input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className={`${CONTROL} mt-1`} placeholder="سبب الإجراء أو تفاصيل الهدية" /></label>}
      {feedback && <p role="status" aria-live="polite" className="rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-200">{feedback}</p>}
      {results.length > 0 && <ul className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/50 p-3" aria-label="نتائج الإجراءات الجماعية">{results.map((result, index) => <li key={`${result.id}-${index}`} className={`flex items-start gap-2 text-xs ${result.ok ? "text-emerald-300" : "text-rose-300"}`}>{result.ok ? <BadgeCheck size={14} className="mt-0.5 shrink-0" /> : <CircleAlert size={14} className="mt-0.5 shrink-0" />}<span><strong>{result.name}:</strong> {result.message}</span></li>)}</ul>}
      {!canAct && <p className="text-xs text-amber-300">ليس لديك صلاحية لإدارة المستخدمين. كل صلاحية تُفحص مرة أخرى داخل إجراء الخادم.</p>}
      {!users.every((user) => user.admin_record_available) && <p className="text-[11px] text-amber-300">بيانات التصنيف والدفع اليدوي تحتاج ترحيل db/56-admin-user-operations-center.sql قبل الحفظ. لا يُعرض غياب البيانات كأنه تأكيد بعدم الدفع.</p>}
      {users.some((user) => user.plan_status === "unknown") && <p className="text-[11px] text-amber-300">حالة خطة بعض المستخدمين غير قابلة للتحقق؛ راجع تطبيق ترحيل الاشتراك واتصال قاعدة البيانات.</p>}
    </section>
  );
}
