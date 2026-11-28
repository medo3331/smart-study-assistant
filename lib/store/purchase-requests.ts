/**
 * مساعدات طلبات الشراء (متجر الكريدت + الاشتراكات) — مشتركة بين الـ API والأدمن.
 *
 * إشعار المالك/الأدمن: `notifications` سياسة القراءة فيها (user_id null أو صاحبها)
 * — إذًا الإشعار الإداري يُدرَج لكل حساب أدمن/م OWNER على حدة (لن يراه المستخدمون).
 */

import { createServiceClient } from "@/lib/supabase/admin";

export type PurchaseRequestRow = {
  id: string;
  user_id: string;
  kind: "credits" | "plan" | "coins";
  pack_id: string | null;
  credits: number | null;
  coin_pack_id: string | null;
  coins: number | null;
  plan_key: string | null;
  plan_duration_days: number | null;
  amount: number | null;
  currency: string;
  status: "awaiting_payment" | "payment_submitted" | "approved" | "rejected" | "cancelled";
  payment_method: string | null;
  payment_reference: string | null;
  user_note: string | null;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  ticket_id: string | null;
  created_at: string;
  updated_at: string;
};

/** يرسل إشعارًا لكل الأدمنز/المالك (best-effort — لا يكسر إنشاء الطلب). */
export async function notifyAdmins(params: {
  title: string;
  message: string;
  type?: "info" | "warning";
}): Promise<void> {
  try {
    const db = createServiceClient();
    const { data: admins } = await db.from("site_admins").select("user_id");
    const ids = ((admins ?? []) as Array<{ user_id?: string | null }>)
      .map((a) => a.user_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (ids.length === 0) return;
    await db.from("notifications").insert(
      ids.map((userId) => ({
        user_id: userId,
        title: params.title,
        message: params.message,
        type: params.type ?? "info",
      }))
    );
  } catch (error) {
    console.warn("[purchase-requests] admin notification failed (non-blocking):", error);
  }
}

/** يرسل إشعارًا لمستخدم واحد (best-effort). */
export async function notifyUser(userId: string, title: string, message: string): Promise<void> {
  try {
    const db = createServiceClient();
    await db.from("notifications").insert({ user_id: userId, title, message, type: "info" });
  } catch (error) {
    console.warn("[purchase-requests] user notification failed (non-blocking):", error);
  }
}

/**
 * إنشاء تذكرة دعم لطلب اشتراك مُرسل عبر رسايل الدعم، وربطها بالطلب.
 * تستخدم المخطط الحي: support_tickets (title/description/category) + support_messages.
 * service client (يتجاوز RLS) — best-effort: يرجع null عند الفشل دون كسر الطلب.
 */
export async function createSupportTicketForRequest(params: {
  userId: string;
  requestId: string;
  planLabel: string;
  durationDays: number;
  amount: number | null;
  currency: string;
}): Promise<string | null> {
  try {
    const db = createServiceClient();
    const title = `طلب اشتراك — باقة ${params.planLabel} (${params.durationDays} يوم)`;
    const body = [
      `أريد الاشتراك في باقة ${params.planLabel} لمدة ${params.durationDays} يوم.`,
      `المبلغ: ${params.amount != null ? `${Number(params.amount).toFixed(2)} ${params.currency}` : "—"}.`,
      `رقم الطلب: ${params.requestId}`,
      `بعد تحويل المبلغ هأكد الدفع من صفحة الطلب، وأرجو المراجعة والتفعيل.`,
    ].join("\n");
    const { data: ticket, error: ticketError } = await db
      .from("support_tickets")
      .insert({ user_id: params.userId, title, description: body, category: "payment", status: "open", priority: "normal" })
      .select("id")
      .single();
    if (ticketError || !ticket) return null;
    await db.from("support_messages").insert({
      ticket_id: ticket.id,
      author_id: params.userId,
      author_role: "user",
      body,
    });
    await db
      .from("purchase_requests")
      .update({ ticket_id: ticket.id })
      .eq("id", params.requestId);
    return ticket.id;
  } catch (error) {
    console.warn("[purchase-requests] support ticket creation failed (non-blocking):", error);
    return null;
  }
}

/** إضافة رد الإدارة في محادثة الدعم المرتبطة بالطلب — best-effort. resolve=true يقفل التذكرة. */
export async function appendTicketAdminReply(
  ticketId: string | null,
  authorId: string,
  message: string,
  resolve = false
): Promise<void> {
  if (!ticketId) return;
  try {
    const db = createServiceClient();
    await db.from("support_messages").insert({
      ticket_id: ticketId,
      author_id: authorId,
      author_role: "admin",
      body: message.slice(0, 5000),
    });
    await db
      .from("support_tickets")
      .update(
        resolve
          ? { status: "resolved", resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() }
          : { status: "in_progress", updated_at: new Date().toISOString() }
      )
      .eq("id", ticketId);
  } catch (error) {
    console.warn("[purchase-requests] ticket reply failed (non-blocking):", error);
  }
}
