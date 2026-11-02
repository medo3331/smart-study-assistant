"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "./audit-log-record";
import { hasPermission } from "@/lib/auth-roles";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

async function getSessionActor() {
  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { get: (n: string) => cookieStore.get(n)?.value } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return null;
  return { userId: user.id, email: user.email ?? null };
}

export async function listAllTickets() {
  const db = createServiceClient();
  const { data, error } = await db.from("support_tickets").select("*").order("created_at", { ascending: false }).limit(100);
  return { data: data ?? [], error: error?.message ?? null };
}

export async function getTicketWithReplies(ticketId: string) {
  const db = createServiceClient();
  const { data: ticket } = await db.from("support_tickets").select("*").eq("id", ticketId).maybeSingle();
  const { data: replies } = await db.from("ticket_replies").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true });
  return { ticket, replies: replies ?? [] };
}

export async function replyToTicket(ticketId: string, message: string) {
  const actor = await getSessionActor();
  if (!actor) return { ok: false, message: "غير مصرح", error: "unauth" };
  const db = createServiceClient();
  const allowed = await hasPermission(db, actor.userId, actor.email, "plans.manage");
  if (!allowed) return { ok: false, message: "غير مصرح", error: "denied" };
  const { error } = await db.from("ticket_replies").insert({ ticket_id: ticketId, sender_id: actor.userId, message, is_admin: true });
  if (error) return { ok: false, message: "فشل الرد", error: error.message };
  await db.from("support_tickets").update({ updated_at: new Date().toISOString(), status: "in_progress" }).eq("id", ticketId).eq("status", "open");
  // notify user
  const { data: ticket } = await db.from("support_tickets").select("user_id, subject").eq("id", ticketId).maybeSingle();
  if (ticket) {
    await db.from("notifications").insert({ user_id: ticket.user_id, title: "رد على تذكرتك", message: `تم الرد على: ${ticket.subject}`, type: "support_reply", created_by: actor.userId });
  }
  return { ok: true, message: "تم إرسال الرد", error: null };
}

export async function updateTicketStatus(ticketId: string, status: string) {
  const actor = await getSessionActor();
  if (!actor) return { ok: false, message: "غير مصرح", error: "unauth" };
  const db = createServiceClient();
  const allowed = await hasPermission(db, actor.userId, actor.email, "plans.manage");
  if (!allowed) return { ok: false, message: "غير مصرح", error: "denied" };
  const { error } = await db.from("support_tickets").update({ status, updated_at: new Date().toISOString() }).eq("id", ticketId);
  if (error) return { ok: false, message: "فشل التحديث", error: error.message };
  return { ok: true, message: "تم التحديث", error: null };
}
