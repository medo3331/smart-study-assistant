import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/auth-roles";

async function adminAllowed() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return false;
  return hasPermission(createServiceClient(), user.id, user.email ?? null, "support.manage");
}

export async function GET(req: Request) {
  if (!(await adminAllowed())) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  try {
    const service = createServiceClient();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    let query = service.from("support_tickets").select("*").order("updated_at", { ascending: false }).limit(200);
    if (status && ["open", "pending", "resolved", "closed"].includes(status)) query = query.eq("status", status);
    const { data: ticketRows, error } = await query;
    if (error) throw error;

    const tickets = ticketRows ?? [];
    const userIds = [...new Set(tickets.map((ticket) => ticket.user_id))];
    const ticketIds = tickets.map((ticket) => ticket.id);
    const [{ data: profiles, error: profileError }, { data: messages, error: messagesError }] = await Promise.all([
      userIds.length ? service.from("profiles").select("id, display_name, public_user_code, email").in("id", userIds) : Promise.resolve({ data: [], error: null }),
      ticketIds.length ? service.from("support_messages").select("ticket_id, body, created_at").in("ticket_id", ticketIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ]);
    if (profileError) throw profileError;
    if (messagesError) throw messagesError;
    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    const latestByTicket = new Map<string, string>();
    for (const message of messages ?? []) if (!latestByTicket.has(message.ticket_id)) latestByTicket.set(message.ticket_id, message.body);

    return NextResponse.json({ success: true, tickets: tickets.map((ticket) => ({
      ...ticket,
      subject: ticket.subject || ticket.title || "طلب دعم",
      display_name: profileById.get(ticket.user_id)?.display_name ?? null,
      public_user_code: profileById.get(ticket.user_id)?.public_user_code ?? null,
      email: profileById.get(ticket.user_id)?.email ?? null,
      last_message: latestByTicket.get(ticket.id) ?? null,
    })) });
  } catch (error) {
    console.error("[admin support] GET", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "تعذر تحميل صندوق الدعم." }, { status: 500 });
  }
}
