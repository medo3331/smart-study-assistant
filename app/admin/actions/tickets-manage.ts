"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "./audit-log-record";
import { requireAdminActor, ActionAuthError } from "@/lib/admin/action-guard";

/**
 * ⚠️ أمان (P0، 2026-11):
 *   - `listAllTickets` و`getTicketWithReplies` كانتا بـ service_role **بدون
 *     أي فحص** — أي حد يقدر يقرأ تذاكر الدعم وردودها.
 *   - الرد وتغيير الحالة كانوا بيفحصوا "plans.manage" (Owner-only) كـproxy —
 *     يعني فريق الدعم (support.manage) كان ممنوع. دلوقتي المفتاح الصحيح.
 */

const ACTION = "support.manage" as const;

export async function listAllTickets() {
  try {
    await requireAdminActor(ACTION);
  } catch (e) {
    if (e instanceof ActionAuthError) return { data: [], error: e.message };
    throw e;
  }
  const db = createServiceClient();
  const { data, error } = await db.from("support_tickets").select("*").order("created_at", { ascending: false }).limit(100);
  return { data: data ?? [], error: error?.message ?? null };
}

export async function getTicketWithReplies(ticketId: string) {
  try {
    await requireAdminActor(ACTION);
  } catch (e) {
    if (e instanceof ActionAuthError) return { ticket: null, replies: [] };
    throw e;
  }
  const db = createServiceClient();
  const { data: ticket } = await db.from("support_tickets").select("*").eq("id", ticketId).maybeSingle();
  const { data: replies } = await db.from("ticket_replies").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true });
  return { ticket, replies: replies ?? [] };
}

export async function replyToTicket(ticketId: string, message: string) {
  let actor;
  try {
    ({ actor } = await requireAdminActor(ACTION));
  } catch (e) {
    if (e instanceof ActionAuthError) return { ok: false, message: "غير مصرح", error: "denied" };
    throw e;
  }
  const db = createServiceClient();
  const { error } = await db.from("ticket_replies").insert({ ticket_id: ticketId, sender_id: actor.userId, message, is_admin: true });
  if (error) return { ok: false, message: "فشل الرد", error: error.message };
  await db.from("support_tickets").update({ updated_at: new Date().toISOString(), status: "in_progress" }).eq("id", ticketId).eq("status", "open");
  // notify user
  const { data: ticket } = await db.from("support_tickets").select("user_id, subject").eq("id", ticketId).maybeSingle();
  if (ticket) {
    await db.from("notifications").insert({ user_id: ticket.user_id, title: "رد على تذكرتك", message: `تم الرد على: ${ticket.subject}`, type: "support_reply", created_by: actor.userId });
  }
  await recordAuditLog({ actor: actor.userId, actor_email: actor.userEmail, action: ACTION, resource_type: "support_ticket", resource_id: ticketId, details: { op: "reply" }, result: "PASS" });
  return { ok: true, message: "تم إرسال الرد", error: null };
}

export async function updateTicketStatus(ticketId: string, status: string) {
  let actor;
  try {
    ({ actor } = await requireAdminActor(ACTION));
  } catch (e) {
    if (e instanceof ActionAuthError) return { ok: false, message: "غير مصرح", error: "denied" };
    throw e;
  }
  const db = createServiceClient();
  const { error } = await db.from("support_tickets").update({ status, updated_at: new Date().toISOString() }).eq("id", ticketId);
  if (error) return { ok: false, message: "فشل التحديث", error: error.message };
  await recordAuditLog({ actor: actor.userId, actor_email: actor.userEmail, action: ACTION, resource_type: "support_ticket", resource_id: ticketId, details: { op: "status", status }, result: "PASS" });
  return { ok: true, message: "تم التحديث", error: null };
}
