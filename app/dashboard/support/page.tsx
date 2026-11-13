import { listMyTickets, createTicket, getMyTicketWithReplies, addMyReply } from "@/app/dashboard/actions/support";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import Link from "next/link";
import { Search, MessageSquare, Send, Plus, CheckCircle } from "lucide-react";

type Ticket = { id: string; subject: string; description: string; status: string; priority: string; created_at: string; updated_at: string };
type Reply = { id: string; message: string; is_admin: boolean; created_at: string };

async function getSessionUser() {
  "use server";
  const { cookies } = await import("next/headers");
  const { createServerClient } = await import("@supabase/ssr");
  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { get: (n: string) => cookieStore.get(n)?.value } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return null;
  return user;
}

export default async function DashboardSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ ticket?: string }>;
}) {
  // في Next 15+ الـ searchParams بيعدّي Promise — القراءة من غير await
  // بترجّع undefined (يعني الروابط ?ticket= كانت بتتجاهل).
  const { ticket: ticketQuery } = await searchParams;
  const activeTicketId = ticketQuery || null;

  // ⚠️ أي فشل هنا (مفتاح الخدمة ناقص في البيئة، قاعدة بيانات واقفة…)
  // كان بيكسر الصفحة كلها بـ500 — بنمسكه ونعرض رسالة بدل كسر الشاشة.
  let tickets: Ticket[] = [];
  let ticket: Ticket | null = null;
  let replies: Reply[] = [];
  let loadError: string | null = null;
  try {
    const list = await listMyTickets();
    tickets = (list.data as Ticket[]) ?? [];
    if (activeTicketId) {
      const active = await getMyTicketWithReplies(activeTicketId);
      ticket = (active.ticket as Ticket | null) ?? null;
      replies = (active.replies as Reply[]) ?? [];
    }
  } catch (err) {
    console.error("dashboard/support: failed to load tickets", err);
    loadError = "مقدرنا نحمّل تذاكرك دلوقتي. جرّب تاني بعد شوية.";
  }

  async function createAction(formData: FormData) {
    "use server";
    const u = await getSessionUser();
    if (!u) return { error: "غير مصرح" };
    await createTicket(String(formData.get("subject") ?? ""), String(formData.get("description") ?? ""), String(formData.get("priority") ?? "medium"));
  }

  async function replyAction(formData: FormData) {
    "use server";
    const u = await getSessionUser();
    if (!u || !activeTicketId) return;
    // فشل الخدمة هنا (زي مفتاح ناقص) كان هيطلع لحدود الخطأ العليا —
    // بنمسكه ونسجّله عشان الرد ما يكسرش الصفحة.
    try {
      await addMyReply(activeTicketId, String(formData.get("message") ?? ""));
    } catch (err) {
      console.error("dashboard/support: replyAction failed", err);
    }
  }
return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <AnnouncementBanner />
      {loadError && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-600">
          {loadError}
        </div>
      )}
      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="lg:w-80 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-extrabold">تذاكري</h2>
            {/* الصفحة Server Component — الأحداث زي onClick ممنوعة فيها
                (React بيرمي خطأ وده كان سبب الـ500). التنقل بـLink. */}
            <Link href="/dashboard/support" className="flex items-center gap-2 rounded bg-marker px-3 py-1.5 text-xs font-bold text-[var(--on-marker)]">
              <Plus className="w-4 h-4" /> تذكرة جديدة
            </Link>
          </div>
          <div className="relative mb-4">
            <Search className="absolute left-2 top-2.5 w-4 h-4 text-ink-soft" />
            <input type="text" placeholder="البحث في المحادثات..." className="w-full rounded bg-paper-3 pl-8 pr-2 py-1.5 text-sm border border-rule focus:border-marker" />
          </div>
          <div className="space-y-1">
            {tickets.map((t: Ticket) => {
              const isActive = activeTicketId === t.id;
              const isResolved = t.status === "resolved" || t.status === "closed";
              return (
                <Link key={t.id} href={`/dashboard/support?ticket=${t.id}`} className={`w-full flex items-center justify-between p-3 rounded-xl border transition ${isActive ? "bg-marker text-[var(--on-marker)] border-marker" : "bg-paper-2 border-rule text-ink hover:bg-paper-3 hover:border-marker/50"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-bold ${isActive ? "text-[var(--on-marker)]" : "text-ink"}`}>{t.subject}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${isResolved ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
                        {t.status === "open" ? "مفتوحة" : t.status === "in_progress" ? "قيد العمل" : "مغلقة"}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-soft truncate">{t.description}</p>
                  </div>
                  <span className="text-[10px] text-ink-soft">{new Date(t.updated_at).toLocaleDateString("ar-SA")}</span>
                </Link>
              );
            })}
            {!loadError && tickets.length === 0 && (
              <div className="text-center py-8 text-ink-soft text-sm">
                لا توجد محادثات بعد. ابدأ محادثة جديدة أعلاه.
              </div>
            )}
          </div>
        </aside>
        <main className="flex-1 flex flex-col min-h-[600px]">
          {!activeTicketId || loadError ? (
            <div className="flex flex-col items-center justify-center h-full text-ink-soft">
              <MessageSquare className="w-16 h-16 mb-3 opacity-30" />
              <h3 className="font-bold">اختر محادثة للبدء</h3>
              <p className="text-sm">اختر تذكرة من القائمة على اليسار، أو ابدأ محادثة جديدة.</p>
            </div>
          ) : (
            <div className="flex flex-col h-[600px]">
              <header className="border-b border-rule bg-paper-2 p-4 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-ink">{ticket?.subject}</h2>
                  <p className="text-xs text-ink-soft">{ticket?.status} · أولوية {ticket?.priority}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${ticket?.status === "open" || ticket?.status === "in_progress" ? "bg-emerald-500" : "bg-slate-400"}`} />
                  <span className="text-xs font-bold text-ink-soft">متصل</span>
                </div>
              </header>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {replies.map((r: Reply, i: number) => (
                  <div key={r.id} className={`flex mb-3 ${r.is_admin ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[80%] rounded-2xl p-3 text-sm ${r.is_admin ? "bg-blue-500 text-white text-left rounded-tl-none shadow-sm" : "bg-paper-2 text-ink border border-rule rounded-tr-none shadow-sm"}`}>
                      <p className="break-words">{r.message}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[10px] text-ink-soft">{new Date(r.created_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}</span>
                        {r.is_admin && <CheckCircle className="w-3 h-3 text-emerald-400 ml-1" />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <form action={replyAction} className="border-t border-rule bg-paper-2 p-3">
                <div className="flex gap-2">
                  <input name="message" placeholder="اكتب ردك هنا..." className="flex-1 rounded bg-paper-3 pl-3 pr-8 py-2 text-sm border border-rule focus:border-marker focus:outline-none" />
                  <button type="submit" className="rounded bg-marker px-4 py-2 text-xs font-bold text-[var(--on-marker)]">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}