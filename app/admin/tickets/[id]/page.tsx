import { requireAdminPermission } from "@/lib/admin/auth-check";
import { AdminPageHeader, AdminCard } from "@/components/admin/ui";
import { getTicketWithReplies, replyToTicket, updateTicketStatus } from "@/app/admin/actions/tickets-manage";

export default async function AdminTicketDetailPage({ params }: { params: { id: string } }) {
  await requireAdminPermission("plans.manage");
  const { ticket, replies } = await getTicketWithReplies(params.id);

  async function replyAction(formData: FormData) {
    "use server";
    await replyToTicket(params.id, String(formData.get("message") ?? ""));
  }
  async function statusAction(formData: FormData) {
    "use server";
    await updateTicketStatus(params.id, String(formData.get("status") ?? "open"));
  }

  if (!ticket) return <div className="p-6">التذكرة غير موجودة</div>;

  return (
    <div className="space-y-6">
      <AdminPageHeader title={`تذكرة: ${ticket.subject}`} subtitle={ticket.description} badge="plans.manage" permissionKey="plans.manage" />
      <AdminCard title="الردود" tone="default">
        <ul className="space-y-2 mb-4">
          {replies.map((r: any) => (
            <li key={r.id} className={`rounded p-2 text-sm ${r.is_admin ? "bg-amber-900/30" : "bg-slate-800"}`}>
              <div className="text-xs text-slate-400">{r.is_admin ? "أدمن" : "مستخدم"} — {new Date(r.created_at).toLocaleString()}</div>
              <div>{r.message}</div>
            </li>
          ))}
        </ul>
        <form action={replyAction} className="space-y-2">
          <textarea name="message" required rows={3} className="w-full rounded bg-slate-800 p-2 text-sm" placeholder="ردك..." />
          <button type="submit" className="rounded bg-marker px-4 py-2 text-sm font-bold text-[var(--on-marker)]">رد</button>
        </form>
        <form action={statusAction} className="mt-3 flex gap-2">
          <select name="status" defaultValue={ticket.status} className="rounded bg-slate-800 p-2 text-sm">
            <option value="open">open</option>
            <option value="in_progress">in_progress</option>
            <option value="resolved">resolved</option>
            <option value="closed">closed</option>
          </select>
          <button type="submit" className="rounded bg-slate-700 px-3 py-2 text-sm">تحديث الحالة</button>
        </form>
      </AdminCard>
    </div>
  );
}
