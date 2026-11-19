"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, CircleHelp, LoaderCircle, MessageCircle, Plus, Search, Send, ShieldCheck } from "lucide-react";

type Ticket = {
  id: string;
  user_id: string;
  subject: string;
  title?: string | null;
  description?: string | null;
  category: string;
  status: string;
  created_at: string;
  updated_at: string;
  display_name?: string | null;
  public_user_code?: string | null;
  email?: string | null;
  last_message?: string | null;
};
type Message = { id: string; ticket_id: string; author_id: string; author_role: "user" | "admin"; body: string; created_at: string };

const ISSUE_LABELS: Record<string, string> = {
  login: "تسجيل الدخول", account: "الحساب", payment: "الاشتراك والدفع", bug: "خطأ تقني", content: "المحتوى والدروس", performance: "الأداء والسرعة", other: "مشكلة أخرى",
};
const STATUS_LABELS: Record<string, string> = { open: "مفتوحة", pending: "بانتظار الطالب", resolved: "تم الحل", closed: "مغلقة" };
const ADMIN_STATUS_OPTIONS: Record<string, string> = { open: "مفتوحة", resolved: "تم الحل", closed: "مغلقة" };
const ISSUE_OPTIONS = Object.entries(ISSUE_LABELS);
const ticketCode = (id: string) => `MAG-${id.replaceAll("-", "").slice(-8).toUpperCase()}`;
const dateTime = (value: string) => new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo" }).format(new Date(value));
const timeAgo = (value: string) => {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} د`;
  if (mins < 1440) return `منذ ${Math.floor(mins / 60)} س`;
  return `منذ ${Math.floor(mins / 1440)} يوم`;
};

function Badge({ children, kind = "neutral" }: { children: React.ReactNode; kind?: "neutral" | "status" | "mag" }) {
  const style = kind === "mag"
    ? "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300"
    : kind === "status"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : "border-rule bg-paper-3 text-ink-soft";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${style}`}>{children}</span>;
}

function MessageList({ messages, isAdmin }: { messages: Message[]; isAdmin: boolean }) {
  if (!messages.length) return <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-ink-soft"><MessageCircle className="h-8 w-8 opacity-40"/><p className="text-sm">ابدأ المحادثة بكتابة أول رسالة.</p></div>;
  return <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6" aria-live="polite">
    {messages.map((message) => {
      const own = isAdmin ? message.author_role === "admin" : message.author_role === "user";
      return <div key={message.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
        <article className={`max-w-[88%] rounded-2xl px-4 py-3 sm:max-w-[78%] ${own ? "rounded-tl-sm bg-marker text-[var(--on-marker)]" : "rounded-tr-sm border border-rule bg-paper-3 text-ink"}`}>
          <p className="whitespace-pre-wrap break-words text-sm leading-7">{message.body}</p>
          <footer className="mt-2 flex items-center gap-1.5 text-[10px] opacity-75">
            {!own && (isAdmin ? "الطالب" : "فريق دعم MAG")}<time dateTime={message.created_at}>{dateTime(message.created_at)}</time>{own && <Check className="h-3 w-3" aria-label="تم الإرسال"/>}
          </footer>
        </article>
      </div>;
    })}
  </div>;
}

export default function SupportInbox({ mode, initialTicketId = null }: { mode: "admin" | "student"; initialTicketId?: string | null }) {
  const isAdmin = mode === "admin";
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialTicketId);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [showNewTicket, setShowNewTicket] = useState(false);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(isAdmin ? "/api/admin/support/tickets" : "/api/support/tickets", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "تعذر تحميل محادثات الدعم.");
      const nextTickets: Ticket[] = payload.tickets ?? [];
      setTickets(nextTickets);
      setSelectedId((current) => current && nextTickets.some((ticket) => ticket.id === current) ? current : nextTickets[0]?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل محادثات الدعم.");
    } finally { setLoading(false); }
  }, [isAdmin]);

  useEffect(() => { void loadTickets(); }, [loadTickets]);

  const loadConversation = useCallback(async (id: string) => {
    setConversationLoading(true);
    setError(null);
    try {
      const response = await fetch(`${isAdmin ? "/api/admin" : "/api"}/support/tickets/${id}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "تعذر تحميل الرسائل.");
      setSelectedTicket(payload.ticket);
      setMessages(payload.messages ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل الرسائل.");
      setSelectedTicket(null);
      setMessages([]);
    } finally { setConversationLoading(false); }
  }, [isAdmin]);

  useEffect(() => { if (selectedId) void loadConversation(selectedId); else { setSelectedTicket(null); setMessages([]); } }, [selectedId, loadConversation]);

  useEffect(() => {
    if (!selectedId) return;
    const refresh = async () => {
      try {
        const [conversationResponse, listResponse] = await Promise.all([
          fetch(`${isAdmin ? "/api/admin" : "/api"}/support/tickets/${selectedId}`, { cache: "no-store" }),
          fetch(isAdmin ? "/api/admin/support/tickets" : "/api/support/tickets", { cache: "no-store" }),
        ]);
        const [conversation, list] = await Promise.all([conversationResponse.json(), listResponse.json()]);
        if (conversationResponse.ok && conversation.success) {
          setSelectedTicket(conversation.ticket);
          setMessages(conversation.messages ?? []);
        }
        if (listResponse.ok && list.success) setTickets(list.tickets ?? []);
      } catch { /* Keep the last loaded conversation visible during temporary network errors. */ }
    };
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 15000);
    return () => window.clearInterval(interval);
  }, [isAdmin, selectedId]);

  const visibleTickets = useMemo(() => tickets.filter((ticket) => {
    const searchText = `${ticket.subject} ${ticket.display_name ?? ""} ${ticket.email ?? ""} ${ticket.public_user_code ?? ""} ${ticketCode(ticket.id)}`.toLowerCase();
    const matchesSearch = searchText.includes(query.toLowerCase().trim());
    const matchesFilter = filter === "all" || (filter === "new" ? ticket.status === "open" : filter === "open" ? ["open", "pending"].includes(ticket.status) : ["resolved", "closed"].includes(ticket.status));
    return matchesSearch && matchesFilter;
  }), [tickets, query, filter]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || sending) return;
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "").trim();
    if (!body) return;
    setSending(true); setError(null);
    try {
      const response = await fetch(`${isAdmin ? "/api/admin" : "/api"}/support/tickets/${selectedId}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "تعذر إرسال الرسالة.");
      form.reset();
      await Promise.all([loadConversation(selectedId), loadTickets()]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر إرسال الرسالة."); }
    finally { setSending(false); }
  }

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const category = String(data.get("category") ?? "other");
    const message = String(data.get("message") ?? "").trim();
    if (message.length < 10) { setError("اكتب تفاصيل المشكلة في 10 أحرف على الأقل."); return; }
    setSending(true); setError(null);
    try {
      const response = await fetch("/api/support/tickets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: ISSUE_LABELS[category] ?? "مشكلة أخرى", category, message }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "تعذر إنشاء المحادثة.");
      form.reset(); setShowNewTicket(false);
      await loadTickets();
      setSelectedId(payload.ticket.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر إنشاء المحادثة."); }
    finally { setSending(false); }
  }

  async function updateStatus(status: string) {
    if (!selectedId) return;
    setError(null);
    try {
      const response = await fetch(`/api/admin/support/tickets/${selectedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "تعذر تحديث الحالة.");
      setSelectedTicket(payload.ticket);
      await loadTickets();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تحديث الحالة."); }
  }

  const selected = selectedTicket ?? tickets.find((ticket) => ticket.id === selectedId) ?? null;
  const countNew = tickets.filter((ticket) => ticket.status === "open").length;
  const countOpen = tickets.filter((ticket) => ["open", "pending"].includes(ticket.status)).length;

  return <main className="mx-auto w-full max-w-6xl px-3 py-5 text-ink sm:px-5 sm:py-8" dir="rtl">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rule bg-paper-2 p-4 sm:p-5">
      <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-marker text-xs font-black tracking-wide text-[var(--on-marker)]">MAG</div><div><h1 className="text-lg font-extrabold sm:text-xl">{isAdmin ? "صندوق الدعم" : "محادثاتي مع الدعم"}</h1><p className="mt-1 text-xs text-ink-soft">{isAdmin ? "تذاكر ورسائل الطلاب في مكان واحد" : "تابع رسائلك وردود فريق الدعم من هنا"}</p></div></div>
      {!isAdmin && <button type="button" onClick={() => { setShowNewTicket((value) => !value); setError(null); }} className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-marker px-4 py-2.5 text-xs font-bold text-[var(--on-marker)] transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marker"><Plus className="h-4 w-4"/>محادثة جديدة</button>}
      {isAdmin && <div className="flex gap-2"><Badge>{tickets.length} محادثة</Badge><Badge kind="status">{countNew} جديدة</Badge></div>}
    </div>

    {!isAdmin && showNewTicket && <form onSubmit={createTicket} className="mb-5 space-y-3 rounded-2xl border border-rule bg-paper-2 p-4 sm:p-5">
      <div><h2 className="font-bold">إرسال طلب دعم</h2><p className="mt-1 text-xs text-ink-soft">اختر نوع المشكلة واشرح ما حدث، وسنرد عليك داخل هذه الصفحة.</p></div>
      <label className="block text-xs font-bold">نوع المشكلة<select name="category" className="mt-1.5 w-full rounded-xl border border-rule bg-paper-3 px-3 py-2.5 text-sm" defaultValue="other">{ISSUE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="block text-xs font-bold">تفاصيل المشكلة<textarea name="message" rows={4} maxLength={5000} required minLength={10} placeholder="اكتب التفاصيل التي تساعدنا على حل المشكلة…" className="mt-1.5 w-full resize-y rounded-xl border border-rule bg-paper-3 px-3 py-3 text-sm leading-6 placeholder:text-ink-soft/70"/></label>
      <button disabled={sending} className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-marker px-4 py-2.5 text-xs font-bold text-[var(--on-marker)] disabled:cursor-not-allowed disabled:opacity-60">{sending ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4"/>}إرسال التذكرة</button>
    </form>}

    {error && <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div>}

    <div className="grid min-h-[610px] grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className={`${selectedId ? "hidden lg:block" : ""} overflow-hidden rounded-2xl border border-rule bg-paper-2`}>
        <div className="border-b border-rule p-4"><h2 className="mb-3 text-sm font-extrabold">{isAdmin ? "المحادثات" : "تذاكري"} <span className="font-normal text-ink-soft">· {tickets.length}</span></h2>
          <label className="flex items-center gap-2 rounded-xl border border-rule bg-paper-3 px-3 py-2.5"><Search className="h-4 w-4 shrink-0 text-ink-soft"/><input aria-label="البحث في المحادثات" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isAdmin ? "ابحث بالاسم أو MAG…" : "ابحث في محادثاتي…"} className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-ink-soft/70"/></label>
          {isAdmin && <div className="mt-3 flex flex-wrap gap-1.5">{[["all", `الكل ${tickets.length}`], ["new", `جديدة ${countNew}`], ["open", `مفتوحة ${countOpen}`], ["done", "مغلقة"]].map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`cursor-pointer rounded-full border px-2.5 py-1 text-[10px] transition ${filter === value ? "border-marker/30 bg-marker/10 font-bold text-ink" : "border-rule text-ink-soft hover:bg-paper-3"}`}>{label}</button>)}</div>}
        </div>
        <div className="max-h-[560px] overflow-y-auto">
          {loading ? <div className="flex items-center justify-center gap-2 p-8 text-xs text-ink-soft"><LoaderCircle className="h-4 w-4 animate-spin"/>جارٍ تحميل المحادثات…</div> : visibleTickets.length ? visibleTickets.map((ticket) => <button key={ticket.id} type="button" onClick={() => { setSelectedId(ticket.id); setShowNewTicket(false); }} className={`block w-full cursor-pointer border-b border-rule p-4 text-right transition hover:bg-paper-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-marker ${selectedId === ticket.id ? "border-r-4 border-r-marker bg-marker/5" : ""}`}>
            <span className="flex items-start justify-between gap-2"><strong className="line-clamp-1 text-xs">{ticket.subject || ISSUE_LABELS[ticket.category] || "طلب دعم"}</strong><time className="shrink-0 text-[10px] text-ink-soft">{timeAgo(ticket.updated_at || ticket.created_at)}</time></span>
            <span className="mt-1.5 block text-[10px] text-ink-soft">{isAdmin ? ticket.display_name || ticket.email || "طالب" : ticketCode(ticket.id)}{isAdmin && ticket.public_user_code ? ` · ${ticket.public_user_code}` : ""}</span>
            <span className="mt-2 block truncate text-[11px] text-ink-soft">{ticket.last_message || "لا توجد رسائل بعد"}</span>
            <span className="mt-2 flex flex-wrap gap-1.5"><Badge kind="mag">{ticketCode(ticket.id)}</Badge><Badge>{ISSUE_LABELS[ticket.category] || "مشكلة أخرى"}</Badge><Badge kind={ticket.status === "open" ? "status" : "neutral"}>{STATUS_LABELS[ticket.status] || ticket.status}</Badge></span>
          </button>) : <div className="p-8 text-center"><CircleHelp className="mx-auto mb-2 h-7 w-7 text-ink-soft/50"/><p className="text-xs font-bold">{query ? "لا توجد نتائج مطابقة" : isAdmin ? "لا توجد تذاكر دعم" : "لا توجد محادثات بعد"}</p><p className="mt-1 text-[11px] text-ink-soft">{query ? "جرب كلمة بحث أخرى." : "يمكنك بدء محادثة جديدة وسيظهر رد فريق الدعم هنا."}</p></div>}
        </div>
      </aside>

      <section className={`${isAdmin && !selectedId ? "hidden lg:flex" : "flex"} min-h-[610px] flex-col overflow-hidden rounded-2xl border border-rule bg-paper-2`}>
        {selected ? <>
          {selected.description && messages.length === 0 && <div className="border-b border-rule bg-paper-3/60 px-4 py-3 sm:px-5"><p className="text-[10px] font-bold text-ink-soft">وصف المشكلة الأصلية</p><p className="mt-1 whitespace-pre-wrap text-xs leading-6">{selected.description}</p></div>}
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rule p-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-2"><button type="button" onClick={() => setSelectedId(null)} className="cursor-pointer rounded-lg p-2 text-ink-soft hover:bg-paper-3 lg:hidden" aria-label="العودة للقائمة"><ChevronRight className="h-4 w-4"/></button><div className="min-w-0"><h2 className="truncate text-sm font-extrabold">{selected.subject || ISSUE_LABELS[selected.category] || "طلب دعم"}</h2><div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-soft"><span>{isAdmin ? selected.display_name || selected.email || "الطالب" : "مراسلة فريق الدعم"}</span><Badge kind="mag">{ticketCode(selected.id)}</Badge><Badge>{ISSUE_LABELS[selected.category] || "مشكلة أخرى"}</Badge><time dateTime={selected.created_at}>{dateTime(selected.created_at)}</time></div></div></div>
            {isAdmin ? <label className="flex items-center gap-2 text-[10px] font-bold text-ink-soft">الحالة<select aria-label="حالة التذكرة" value={selected.status} onChange={(event) => void updateStatus(event.target.value)} className="cursor-pointer rounded-lg border border-rule bg-paper-3 px-2 py-2 text-xs text-ink">{Object.entries({ ...ADMIN_STATUS_OPTIONS, ...(selected.status === "pending" ? { pending: STATUS_LABELS.pending } : {}) }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label> : <Badge kind={selected.status === "open" ? "status" : "neutral"}>{STATUS_LABELS[selected.status] || selected.status}</Badge>}
          </header>
          {conversationLoading ? <div className="flex flex-1 items-center justify-center gap-2 text-sm text-ink-soft"><LoaderCircle className="h-4 w-4 animate-spin"/>جارٍ تحميل الرسائل…</div> : <MessageList messages={messages} isAdmin={isAdmin}/>}
          {selected.status !== "closed" ? <form onSubmit={sendMessage} className="flex items-end gap-2 border-t border-rule p-3 sm:p-4"><textarea name="body" rows={2} maxLength={5000} required aria-label="نص الرسالة" placeholder={isAdmin ? "اكتب ردًا واضحًا للطالب…" : "اكتب ردك لفريق الدعم…"} className="min-h-11 flex-1 resize-y rounded-xl border border-rule bg-paper-3 px-3 py-2.5 text-sm leading-6 placeholder:text-ink-soft/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-marker"/><button type="submit" disabled={sending || conversationLoading} className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-marker px-4 text-xs font-bold text-[var(--on-marker)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">{sending ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4"/>}<span className="hidden sm:inline">إرسال</span></button></form> : <div className="flex items-center gap-2 border-t border-rule p-4 text-xs text-ink-soft"><ShieldCheck className="h-4 w-4"/>هذه المحادثة مغلقة. {isAdmin ? "يمكنك إعادة فتحها من قائمة الحالة." : "تواصل معنا بفتح محادثة جديدة إذا احتجت مساعدة إضافية."}</div>}
        </> : <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-ink-soft"><MessageCircle className="mb-3 h-12 w-12 opacity-25"/><h2 className="text-sm font-bold">{isAdmin ? "اختر محادثة للبدء" : "اختر محادثة لمتابعتها"}</h2><p className="mt-1 text-xs">{isAdmin ? "حدد طلبًا من القائمة لمراجعة التفاصيل والرد." : "كل رسائلك وردود فريق MAG محفوظة هنا."}</p>{!isAdmin && <button type="button" onClick={() => setShowNewTicket(true)} className="mt-4 cursor-pointer rounded-xl bg-marker px-4 py-2 text-xs font-bold text-[var(--on-marker)]">ابدأ محادثة</button>}</div>}
      </section>
    </div>
    {!isAdmin && <p className="mt-3 flex items-center gap-2 px-1 text-[11px] text-ink-soft"><ShieldCheck className="h-4 w-4 shrink-0"/>رسائلك خاصة بينك وبين فريق الدعم، ويظهر لكل طلب رقم MAG ونوع المشكلة ووقتها.</p>}
  </main>;
}
