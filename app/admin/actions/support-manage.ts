"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminPermission } from "@/lib/admin/auth-check";
import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "./audit-log-record";

async function actor() {
  const ctx = await requireAdminPermission("support.manage");
  return { id: ctx.user.id, email: ctx.user.email ?? null };
}

export async function replyToTicket(formData: FormData): Promise<void> {
  const { id: adminId, email: adminEmail } = await actor();
  const ticketId = String(formData.get("ticket_id") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!ticketId || !body) {
    redirect("/admin/support?error=" + encodeURIComponent("بيانات ناقصة"));
  }
  const db = createServiceClient();
  const { data: ticket } = await db
    .from("support_tickets")
    .select("id, user_id, status")
    .eq("id", ticketId)
    .maybeSingle();

  if (!ticket) {
    redirect("/admin/support?error=" + encodeURIComponent("التذكرة غير موجودة"));
  }

  const { error: msgErr } = await db.from("support_messages").insert({
    ticket_id: ticketId,
    author_id: adminId,
    author_role: "admin",
    body,
  });
  if (msgErr) {
    redirect("/admin/support?error=" + encodeURIComponent(msgErr.message));
  }

  await db
    .from("support_tickets")
    .update({ status: "pending", updated_at: new Date().toISOString() })
    .eq("id", ticketId);

  // notify the user
  try {
    await db.from("notifications").insert({
      recipient_id: (ticket as any).user_id,
      type: "support_reply",
      title: "رد من فريق الدعم",
      body: body.slice(0, 200),
      link_url: "/support",
    });
  } catch {}

  await recordAuditLog({
    actor: adminId,
    actor_email: adminEmail,
    action: "support.manage",
    resource_type: "support_ticket",
    resource_id: ticketId,
    details: { op: "reply" },
    result: "PASS",
  });

  revalidatePath("/admin/support");
  redirect("/admin/support?success=" + encodeURIComponent("تم إرسال الرد"));
}

export async function updateTicketStatus(formData: FormData): Promise<void> {
  const { id: adminId, email: adminEmail } = await actor();
  const ticketId = String(formData.get("ticket_id") || "").trim();
  const status = String(formData.get("status") || "").trim();
  if (!ticketId || !["open", "pending", "resolved", "closed"].includes(status)) {
    redirect("/admin/support?error=" + encodeURIComponent("حالة غير صالحة"));
  }
  const db = createServiceClient();
  const { error } = await db
    .from("support_tickets")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) {
    redirect("/admin/support?error=" + encodeURIComponent(error.message));
  }
  await recordAuditLog({
    actor: adminId,
    actor_email: adminEmail,
    action: "support.manage",
    resource_type: "support_ticket",
    resource_id: ticketId,
    details: { op: "status", status },
    result: "PASS",
  });
  revalidatePath("/admin/support");
  redirect("/admin/support?success=" + encodeURIComponent("تم تحديث الحالة"));
}

export async function markTicketRead(formData: FormData): Promise<void> {
  const { id: adminId, email: adminEmail } = await actor();
  const ticketId = String(formData.get("ticket_id") || "").trim();
  if (!ticketId) {
    redirect("/admin/support?error=" + encodeURIComponent("بيانات ناقصة"));
  }
  const db = createServiceClient();
  const now = new Date().toISOString();
  await db
    .from("support_messages")
    .update({ read_at: now, read_by: adminId })
    .eq("ticket_id", ticketId)
    .eq("author_role", "user")
    .is("read_at", null);
  await db
    .from("support_tickets")
    .update({ admin_last_read_at: now, updated_at: now })
    .eq("id", ticketId);
  await recordAuditLog({
    actor: adminId,
    actor_email: adminEmail,
    action: "support.manage",
    resource_type: "support_ticket",
    resource_id: ticketId,
    details: { op: "mark_read" },
    result: "PASS",
  });
  revalidatePath("/admin/support");
  redirect("/admin/support?success=" + encodeURIComponent("تم تحديد الرسائل مقروءة"));
}

export async function deleteSupportMessage(formData: FormData): Promise<void> {
  const { id: adminId, email: adminEmail } = await actor();
  const messageId = String(formData.get("message_id") || "").trim();
  if (!messageId) {
    redirect("/admin/support?error=" + encodeURIComponent("بيانات ناقصة"));
  }
  const db = createServiceClient();
  const { error } = await db.from("support_messages").delete().eq("id", messageId);
  if (error) {
    redirect("/admin/support?error=" + encodeURIComponent(error.message));
  }
  await recordAuditLog({
    actor: adminId,
    actor_email: adminEmail,
    action: "support.manage",
    resource_type: "support_message",
    resource_id: messageId,
    details: { op: "delete" },
    result: "PASS",
  });
  revalidatePath("/admin/support");
  redirect("/admin/support?success=" + encodeURIComponent("تم حذف الرسالة"));
}

export async function deleteSupportTicket(formData: FormData): Promise<void> {
  const { id: adminId, email: adminEmail } = await actor();
  const ticketId = String(formData.get("ticket_id") || "").trim();
  if (!ticketId) {
    redirect("/admin/support?error=" + encodeURIComponent("بيانات ناقصة"));
  }
  const db = createServiceClient();
  const { error } = await db.from("support_tickets").delete().eq("id", ticketId);
  if (error) {
    redirect("/admin/support?error=" + encodeURIComponent(error.message));
  }
  await recordAuditLog({
    actor: adminId,
    actor_email: adminEmail,
    action: "support.manage",
    resource_type: "support_ticket",
    resource_id: ticketId,
    details: { op: "delete" },
    result: "PASS",
  });
  revalidatePath("/admin/support");
  redirect("/admin/support?success=" + encodeURIComponent("تم حذف التذكرة"));
}
