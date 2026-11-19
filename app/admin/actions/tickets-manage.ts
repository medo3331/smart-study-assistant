"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "./audit-log-record";
import { requireAdminActor, ActionAuthError } from "@/lib/admin/action-guard";

const ACTION = "support.manage" as const;

export async function listAllTickets() {
  try { await requireAdminActor(ACTION); }
  catch (error) {
    if (error instanceof ActionAuthError) return { data: [], error: error.message };
    throw error;
  }
  const db = createServiceClient();
  const { data, error } = await db.from("support_tickets").select("*").order("updated_at", { ascending: false }).limit(200);
  return { data: data ?? [], error: error?.message ?? null };
}

/** Compatibility adapter for legacy admin callers; replies now come only from support_messages. */
export async function getTicketWithReplies(ticketId: string) {
  try { await requireAdminActor(ACTION); }
  catch (error) {
    if (error instanceof ActionAuthError) return { ticket: null, replies: [] };
    throw error;
  }
  const db = createServiceClient();
  const { data: ticket } = await db.from("support_tickets").select("*").eq("id", ticketId).maybeSingle();
  if (!ticket) return { ticket: null, replies: [] };
  const { data: messages } = await db.from("support_messages").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true });
  return { ticket, replies: (messages ?? []).map((message) => ({ ...message, message: message.body, is_admin: message.author_role === "admin" })) };
}

export async function replyToTicket(ticketId: string, message: string) {
  let actor;
  try { ({ actor } = await requireAdminActor(ACTION)); }
  catch (error) {
    if (error instanceof ActionAuthError) return { ok: false, message: "غير مصرح", error: "denied" };
    throw error;
  }
  const body = message.trim();
  if (!ticketId || !body || body.length > 5000) return { ok: false, message: "الرسالة غير صالحة", error: "invalid" };
  const db = createServiceClient();
  const { data: ticket } = await db.from("support_tickets").select("id, user_id, status").eq("id", ticketId).maybeSingle();
  if (!ticket) return { ok: false, message: "التذكرة غير موجودة", error: "not_found" };
  if (["closed", "resolved"].includes(ticket.status)) return { ok: false, message: "أعد فتح التذكرة قبل الرد", error: "closed" };
  const { error } = await db.from("support_messages").insert({ ticket_id: ticketId, author_id: actor.userId, author_role: "admin", body });
  if (error) return { ok: false, message: "فشل الرد", error: error.message };
  await db.from("support_tickets").update({ updated_at: new Date().toISOString(), status: "open" }).eq("id", ticketId);
  try {
    await db.from("notifications").insert({ recipient_id: ticket.user_id, type: "support_reply", title: "رد على تذكرتك", body: body.slice(0, 200), link_url: `/dashboard/support?ticket=${ticketId}` });
  } catch (error) { console.error("[legacy support notification]", error instanceof Error ? error.message : error); }
  await recordAuditLog({ actor: actor.userId, actor_email: actor.userEmail, action: ACTION, resource_type: "support_ticket", resource_id: ticketId, details: { op: "reply" }, result: "PASS" });
  return { ok: true, message: "تم إرسال الرد", error: null };
}

export async function updateTicketStatus(ticketId: string, status: string) {
  let actor;
  try { ({ actor } = await requireAdminActor(ACTION)); }
  catch (error) {
    if (error instanceof ActionAuthError) return { ok: false, message: "غير مصرح", error: "denied" };
    throw error;
  }
  if (!ticketId || !["open", "resolved", "closed"].includes(status)) return { ok: false, message: "حالة غير صالحة", error: "invalid" };
  const db = createServiceClient();
  const { error } = await db.from("support_tickets").update({ status, updated_at: new Date().toISOString() }).eq("id", ticketId);
  if (error) return { ok: false, message: "فشل التحديث", error: error.message };
  await recordAuditLog({ actor: actor.userId, actor_email: actor.userEmail, action: ACTION, resource_type: "support_ticket", resource_id: ticketId, details: { op: "status", status }, result: "PASS" });
  return { ok: true, message: "تم التحديث", error: null };
}
