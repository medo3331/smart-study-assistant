import { requireAdminPermission } from "@/lib/admin/auth-check";
import { AdminPageHeader, AdminCard, AdminNotice, AdminTableWrap } from "@/components/admin/ui";
import { isPgConfigured, pgQuery } from "@/lib/admin/pg";

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
};

export default async function AdminSupportPage() {
  await requireAdminPermission("support.manage");

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
      SELECT id, ticket_id, author_id, author_role, body, created_at
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
        subtitle="تذاكر الدعم والرسائل (قراءة حقيقية من قاعدة البيانات)"
        badge="support"
        permissionKey="support.manage"
      />
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
              </tr>
            ))}
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-slate-400 py-4">
                  لا توجد تذاكر دعم.
                </td>
              </tr>
            ) : null}
          </tbody>
        </AdminTableWrap>
      </AdminCard>

      {tickets.map((t) => {
        const msgs = messagesByTicket.get(t.id) || [];
        if (!msgs.length) return null;
        return (
          <AdminCard key={t.id} title={`${t.title} — الرسائل (${msgs.length})`} tone="default">
            <div className="space-y-2">
              <p className="text-[11px] text-slate-400 whitespace-pre-wrap">{t.description}</p>
              <ul className="space-y-2">
                {msgs.map((m) => (
                  <li key={m.id} className="border border-slate-800 rounded-lg p-2">
                    <p className="text-[10px] text-slate-500">
                      {m.author_role} — {new Date(m.created_at).toLocaleString()}
                    </p>
                    <p className="text-xs whitespace-pre-wrap">{m.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          </AdminCard>
        );
      })}
    </div>
  );
}
