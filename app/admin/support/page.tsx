import { requireAdminPermission } from "@/lib/admin/auth-check";
import { AdminPageHeader, AdminCard, AdminNotice, AdminTableWrap } from "@/components/admin/ui";
import { isPgConfigured, pgQuery } from "@/lib/admin/pg";
import {
  replyToTicket,
  updateTicketStatus,
  markTicketRead,
  deleteSupportMessage,
  deleteSupportTicket,
} from "@/app/admin/actions/support-manage";

type Ticket = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  created_at: string;
  updated_at: string;
  display_name: string | null;
  email: string | null;
};

type SupportMessage = {
  id: string;
  ticket_id: string;
  author_id: string;
  author_role: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams?: Promise<{ success?: string; error?: string }>;
}) {
  await requireAdminPermission("support.manage");

  const sp = (await searchParams) || {};

  let tickets: Ticket[] = [];
  let messages: SupportMessage[] = [];

  if (isPgConfigured()) {
    tickets = await pgQuery<Ticket>(`
      SELECT t.id, t.user_id, t.title, t.description, t.status::text, t.priority::text,
             t.category, t.created_at, t.updated_at,
             p.display_name, u.email
      FROM public.support_tickets t
      LEFT JOIN public.profiles p ON p.id = t.user_id
      LEFT JOIN auth.users u ON u.id = t.user_id
      ORDER BY t.created_at DESC
      LIMIT 200
    `);
    messages = await pgQuery<SupportMessage>(`
      SELECT id, ticket_id, author_id, author_role, body, created_at, read_at
      FROM public.support_messages
      ORDER BY created_at ASC
    `);
  }

  const messagesByTicket = new Map<string, SupportMessage[]>();
  for (const m of messages) {
    const list = messagesByTicket.get(m.ticket_id) || [];
    list.push(m);
    messagesByTicket.set(m.ticket_id, list);
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="صندوق الدعم"
        subtitle="تذاكر الدعم والرسائل (قراءة/كتابة حقيقية من قاعدة البيانات)"
        badge="support"
        permissionKey="support.manage"
      />
      {sp.success ? <AdminNotice tone="emerald">{sp.success}</AdminNotice> : null}
      {sp.error ? <AdminNotice tone="rose">{sp.error}</AdminNotice> : null}
      {!isPgConfigured() ? (
        <AdminNotice tone="amber">DATABASE_URL غير متاح — لا يمكن عرض التذاكر.</AdminNotice>
      ) : null}
      <AdminCard title={`التذاكر (${tickets.length})`} tone="default">
        <AdminTableWrap>
          <thead>
            <tr>
              <th>العنوان</th>
              <th>المستخدم</th>
              <th>الفئة</th>
              <th>الحالة</th>
              <th>الأولوية</th>
              <th>تاريخ الإنشاء</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id}>
                <td className="font-bold">{t.title}</td>
                <td className="text-[10px]">{t.display_name || t.email || t.user_id}</td>
                <td>{t.category}</td>
                <td>{t.status}</td>
                <td>{t.priority}</td>
                <td>{new Date(t.created_at).toLocaleString()}</td>
                <td>
                  <form action={deleteSupportTicket} className="inline">
                    <input type="hidden" name="ticket_id" value={t.id} />
                    <button type="submit" className="text-[10px] text-red-400 hover:underline">
                      حذف
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-slate-400 py-4">
                  لا توجد تذاكر دعم.
                </td>
              </tr>
            ) : null}
          </tbody>
        </AdminTableWrap>
      </AdminCard>

      {tickets.map((t) => {
        const msgs = messagesByTicket.get(t.id) || [];
        const unreadUser = msgs.filter((m) => m.author_role === "user" && !m.read_at).length;
        return (
          <AdminCard key={t.id} title={`${t.title} — الرسائل (${msgs.length})`} tone="default">
            <div className="space-y-3">
              <p className="text-[11px] text-slate-400 whitespace-pre-wrap">{t.description}</p>

              <div className="flex flex-wrap items-center gap-2">
                <form action={updateTicketStatus} className="flex items-center gap-2">
                  <input type="hidden" name="ticket_id" value={t.id} />
                  <select name="status" defaultValue={t.status} className="text-xs bg-slate-900 border border-slate-700 rounded px-2 py-1">
                    <option value="open">open</option>
                    <option value="pending">pending</option>
                    <option value="resolved">resolved</option>
                    <option value="closed">closed</option>
                  </select>
                  <button type="submit" className="text-xs px-2 py-1 bg-slate-700 rounded">
                    تحديث الحالة
                  </button>
                </form>
                <form action={markTicketRead}>
                  <input type="hidden" name="ticket_id" value={t.id} />
                  <button type="submit" className="text-xs px-2 py-1 bg-blue-700 rounded">
                    تحديد مقروء ({unreadUser})
                  </button>
                </form>
              </div>

              <ul className="space-y-2">
                {msgs.map((m) => (
                  <li key={m.id} className="border border-slate-800 rounded-lg p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] text-slate-500">
                        {m.author_role} — {new Date(m.created_at).toLocaleString()}
                        {m.read_at ? " · مقروء" : " · غير مقروء"}
                      </p>
                      <form action={deleteSupportMessage}>
                        <input type="hidden" name="message_id" value={m.id} />
                        <button type="submit" className="text-[10px] text-red-400 hover:underline">
                          حذف
                        </button>
                      </form>
                    </div>
                    <p className="text-xs whitespace-pre-wrap mt-1">{m.body}</p>
                  </li>
                ))}
                {msgs.length === 0 ? (
                  <li className="text-slate-400 text-xs">لا توجد رسائل.</li>
                ) : null}
              </ul>

              <form action={replyToTicket} className="space-y-2">
                <input type="hidden" name="ticket_id" value={t.id} />
                <textarea
                  name="body"
                  rows={3}
                  placeholder="اكتب ردًا للمستخدم..."
                  className="w-full text-xs bg-slate-900 border border-slate-700 rounded p-2"
                  required
                />
                <button type="submit" className="text-xs px-3 py-1 bg-emerald-700 rounded">
                  إرسال رد
                </button>
              </form>
            </div>
          </AdminCard>
        );
      })}
    </div>
  );
}
