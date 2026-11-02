import { listMyTickets, createTicket, getMyTicketWithReplies, addMyReply } from "@/app/dashboard/actions/support";
import AnnouncementBanner from "@/components/AnnouncementBanner";

export default async function DashboardSupportPage() {
  const { data } = await listMyTickets();

  async function createAction(formData: FormData) {
    "use server";
    await createTicket(String(formData.get("subject") ?? ""), String(formData.get("description") ?? ""), String(formData.get("priority") ?? "medium"));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <AnnouncementBanner />
      <h1 className="text-2xl font-extrabold">الدعم الفني</h1>

      <form action={createAction} className="space-y-3 rounded-2xl border border-rule bg-paper-2 p-4">
        <input name="subject" placeholder="الموضوع" required className="w-full rounded bg-paper-3 p-2 text-sm" />
        <textarea name="description" placeholder="التفاصيل" required rows={4} className="w-full rounded bg-paper-3 p-2 text-sm" />
        <select name="priority" className="rounded bg-paper-3 p-2 text-sm">
          <option value="low">منخفضة</option>
          <option value="medium">متوسطة</option>
          <option value="high">عالية</option>
        </select>
        <button type="submit" className="rounded bg-marker px-4 py-2 text-sm font-bold text-[var(--on-marker)]">فتح تذكرة</button>
      </form>

      <div className="space-y-2">
        <h2 className="font-bold">تذاكري</h2>
        {data.map((t: any) => (
          <div key={t.id} className="rounded-xl border border-rule bg-paper-2 p-3 text-sm">
            <div className="font-bold">{t.subject}</div>
            <div className="text-xs text-ink-soft">{t.status} · {new Date(t.created_at).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
