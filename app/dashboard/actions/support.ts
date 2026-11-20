"use server";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase/admin";

async function getSessionUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { get: (name: string) => cookieStore.get(name)?.value },
  });
  const { data: { user } } = await supabase.auth.getUser();
  return user && !user.is_anonymous ? user : null;
}

/** Compatibility action: create ticket and its opening message on the unified support path. */
export async function createTicket(subject: string, description: string, category = "other") {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "غير مصرح" };
  const title = subject.trim();
  const body = description.trim();
  const allowedCategories = ["login", "account", "payment", "bug", "content", "performance", "other"];
  if (!title || title.length > 200 || !body || body.length < 10 || body.length > 5000 || !allowedCategories.includes(category)) {
    return { ok: false, message: "بيانات التذكرة غير صالحة." };
  }

  const db = createServiceClient();
  const { data: ticket, error } = await db.from("support_tickets")
    .insert({ user_id: user.id, title, subject: title, description: body, category, status: "open" })
    .select("*").single();
  if (error || !ticket) return { ok: false, message: "فشل إنشاء التذكرة." };
  const { error: messageError } = await db.from("support_messages").insert({ ticket_id: ticket.id, author_id: user.id, author_role: "user", body });
  if (messageError) {
    await db.from("support_tickets").delete().eq("id", ticket.id).eq("user_id", user.id);
    return { ok: false, message: "فشل حفظ أول رسالة." };
  }
  return { ok: true, message: "تم إنشاء التذكرة", ticket };
}

export async function listMyTickets() {
  const user = await getSessionUser();
  if (!user) return { data: [], error: "unauth" };
  const db = createServiceClient();
  const { data, error } = await db.from("support_tickets").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
  if (error) return { data: [], error: error.message };
  const ticketIds = (data ?? []).map((ticket) => ticket.id);
  if (!ticketIds.length) return { data: [], error: null };
  const { data: messages, error: messagesError } = await db.from("support_messages").select("id, ticket_id, author_id, author_role, body, created_at").in("ticket_id", ticketIds).order("created_at", { ascending: true });
  if (messagesError) return { data: data ?? [], error: messagesError.message };
  const byTicket = new Map<string, unknown[]>();
  for (const message of messages ?? []) byTicket.set(message.ticket_id, [...(byTicket.get(message.ticket_id) ?? []), message]);
  return { data: (data ?? []).map((ticket) => ({ ...ticket, messages: byTicket.get(ticket.id) ?? [] })), error: null };
}

export async function getMyTicketWithReplies(ticketId: string) {
  const user = await getSessionUser();
  if (!user) return { ticket: null, replies: [] };
  const db = createServiceClient();
  const { data: ticket } = await db.from("support_tickets").select("*").eq("id", ticketId).eq("user_id", user.id).maybeSingle();
  if (!ticket) return { ticket: null, replies: [] };
  const { data: messages } = await db.from("support_messages").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true });
  return { ticket, replies: (messages ?? []).map((message) => ({ ...message, message: message.body, is_admin: message.author_role === "admin" })) };
}

export async function addMyReply(ticketId: string, message: string) {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "غير مصرح" };
  const body = message.trim();
  if (!body || body.length > 5000) return { ok: false, message: "الرسالة غير صالحة." };
  const db = createServiceClient();
  const { data: ticket } = await db.from("support_tickets").select("id, status").eq("id", ticketId).eq("user_id", user.id).maybeSingle();
  if (!ticket) return { ok: false, message: "غير مصرح" };
  if (ticket.status === "closed") return { ok: false, message: "التذكرة مغلقة." };
  const { error } = await db.from("support_messages").insert({ ticket_id: ticketId, author_id: user.id, author_role: "user", body });
  if (error) return { ok: false, message: "فشل إرسال الرد." };
  await db.from("support_tickets").update({ status: "open", updated_at: new Date().toISOString() }).eq("id", ticketId).eq("user_id", user.id);
  return { ok: true, message: "تم إرسال الرد" };
}

export async function listMyNotifications() {
  const user = await getSessionUser();
  if (!user) return { data: [], error: "unauth" };
  const db = createServiceClient();
  const { data: modern, error: modernError } = await db.from("notifications").select("*").eq("recipient_id", user.id).order("created_at", { ascending: false }).limit(20);
  let legacy: any[] = [];
  // Keep pre-migration user_id notices visible, but never include global NULL-recipient rows.
  try {
    const { data, error } = await db.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
    if (!error) legacy = data ?? [];
  } catch { /* legacy column may not exist in a newer-only schema */ }
  const byId = new Map<string, any>();
  for (const item of [...(modern ?? []), ...legacy]) byId.set(item.id, item);
  const data = [...byId.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 20);
  return {
    data: data.map((item) => ({ ...item, message: item.body ?? item.message ?? "", is_read: Boolean(item.read_at ?? item.is_read) })),
    error: modernError?.message ?? null,
  };
}

export async function markNotificationRead(id: string) {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const db = createServiceClient();
  const modern = await db.from("notifications").select("recipient_id").eq("id", id).maybeSingle();
  if (!modern.error && modern.data?.recipient_id === user.id) {
    const { error } = await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("recipient_id", user.id);
    return { ok: !error };
  }
  const legacy = await db.from("notifications").select("user_id").eq("id", id).maybeSingle();
  if (!legacy.data || legacy.data.user_id !== user.id) return { ok: false };
  const { error } = await db.from("notifications").update({ is_read: true }).eq("id", id).eq("user_id", user.id);
  return { ok: !error };
}

export async function deleteMyNotification(id: string) {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const db = createServiceClient();
  const modern = await db.from("notifications").select("recipient_id").eq("id", id).maybeSingle();
  if (!modern.error && modern.data?.recipient_id === user.id) {
    const { error } = await db.from("notifications").delete().eq("id", id).eq("recipient_id", user.id);
    return { ok: !error };
  }
  const legacy = await db.from("notifications").select("user_id").eq("id", id).maybeSingle();
  if (!legacy.data || legacy.data.user_id !== user.id) return { ok: false };
  const { error } = await db.from("notifications").delete().eq("id", id).eq("user_id", user.id);
  return { ok: !error };
}
