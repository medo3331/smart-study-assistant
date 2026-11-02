"use server";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase/admin";

async function getSessionUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { get: (n: string) => cookieStore.get(n)?.value } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return null;
  return user;
}

export async function createTicket(subject: string, description: string, priority: string) {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "غير مصرح" };
  const db = createServiceClient();
  const { error } = await db.from("support_tickets").insert({ user_id: user.id, subject, description, priority });
  if (error) return { ok: false, message: "فشل إنشاء التذكرة: " + error.message };
  return { ok: true, message: "تم إنشاء التذكرة" };
}

export async function listMyTickets() {
  const user = await getSessionUser();
  if (!user) return { data: [], error: "unauth" };
  const db = createServiceClient();
  const { data, error } = await db.from("support_tickets").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  return { data: data ?? [], error: error?.message ?? null };
}

export async function getMyTicketWithReplies(ticketId: string) {
  const user = await getSessionUser();
  if (!user) return { ticket: null, replies: [] };
  const db = createServiceClient();
  const { data: ticket } = await db.from("support_tickets").select("*").eq("id", ticketId).eq("user_id", user.id).maybeSingle();
  if (!ticket) return { ticket: null, replies: [] };
  const { data: replies } = await db.from("ticket_replies").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true });
  return { ticket, replies: replies ?? [] };
}

export async function addMyReply(ticketId: string, message: string) {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "غير مصرح" };
  const db = createServiceClient();
  // ensure ownership
  const { data: ticket } = await db.from("support_tickets").select("id").eq("id", ticketId).eq("user_id", user.id).maybeSingle();
  if (!ticket) return { ok: false, message: "غير مصرح" };
  const { error } = await db.from("ticket_replies").insert({ ticket_id: ticketId, sender_id: user.id, message, is_admin: false });
  if (error) return { ok: false, message: "فشل إرسال الرد" };
  return { ok: true, message: "تم إرسال الرد" };
}

export async function listMyNotifications() {
  const user = await getSessionUser();
  if (!user) return { data: [], error: "unauth" };
  const db = createServiceClient();
  const { data, error } = await db.from("notifications").select("*").or(`user_id.eq.${user.id},user_id.is.null`).order("created_at", { ascending: false }).limit(20);
  return { data: data ?? [], error: error?.message ?? null };
}

export async function markNotificationRead(id: string) {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const db = createServiceClient();
  await db.from("notifications").update({ is_read: true }).eq("id", id).or(`user_id.eq.${user.id},user_id.is.null`);
  return { ok: true };
}

export async function deleteMyNotification(id: string) {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const db = createServiceClient();
  await db.from("notifications").delete().eq("id", id).or(`user_id.eq.${user.id},user_id.is.null`);
  return { ok: true };
}
