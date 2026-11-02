import { requireAdminPermission } from "@/lib/admin/auth-check";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import { Search, MessageSquare, Send, Plus, CheckCircle } from "lucide-react";
import { replyToTicket } from "@/app/admin/actions/tickets-manage";

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

export default async function AdminTicketsPage({ searchParams }: { searchParams: { ticket?: string } }) {
  const user = await getSessionUser();
  const activeTicketId = searchParams.ticket || null;

  const { data: tickets } = await listAllTickets();
  const { ticket, replies } = activeTicketId
    ? await getTicketWithReplies(activeTicketId)
    : { ticket: null, replies: [] };

  async function replyAction(formData: FormData) {
    "use server";
    const u = await getSessionUser();
    if (!u || !activeTicketId) return { error: "غير مصرح" };
    await replyToTicket(activeTicketId, String(formData.get("message") ?? ""));
  }

  return (<div></div>);
}
