"use server";

import { recordAuditLog } from "@/lib/admin/audit-log-record";
import { requireAdminActor, ActionAuthError } from "@/lib/admin/action-guard";
import { isUuid } from "@/lib/credits/grants";
import { createServiceClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type UserOperationsInput = {
  userId: string;
  category: "normal" | "vip" | "follow_up" | "at_risk" | "other";
  paymentStatus: "paid" | "unpaid" | "unknown" | null;
  paidAmount?: number | null;
  currency?: string;
  paymentMethod?: string;
  issueStatus: "none" | "open" | "in_progress" | "resolved";
  internalNote?: string;
};

export async function updateUserOperations(input: UserOperationsInput) {
  let actor;
  try {
    ({ actor } = await requireAdminActor("subscriptions.manage"));
  } catch (error) {
    const message = error instanceof ActionAuthError ? error.message : "غير مصرح";
    return { ok: false, message, error: "authorization_denied" };
  }

  const fail = async (message: string, reason: string) => {
    await recordAuditLog({
      actor: actor.userId,
      actor_email: actor.userEmail,
      action: "subscriptions.manage",
      resource_type: "user_operations",
      resource_id: input?.userId ?? null,
      details: { reason },
      result: "FAIL",
    });
    return { ok: false, message, error: reason };
  };

  if (!input || !isUuid(input.userId)) return fail("UUID المستخدم غير صالح", "invalid_user_id");
  if (!(["normal", "vip", "follow_up", "at_risk", "other"].includes(input.category))) return fail("تصنيف المستخدم غير صالح", "invalid_category");
  if (input.paymentStatus != null && !["paid", "unpaid", "unknown"].includes(input.paymentStatus)) return fail("حالة الدفع غير صالحة", "invalid_payment_status");
  if (!["none", "open", "in_progress", "resolved"].includes(input.issueStatus)) return fail("حالة المتابعة غير صالحة", "invalid_issue_status");
  if (input.paymentStatus === "paid" && (!Number.isFinite(input.paidAmount) || (input.paidAmount ?? 0) <= 0)) {
    return fail("أدخل مبلغًا موجبًا عند تسجيل الدفع", "invalid_payment_amount");
  }
  if (input.paymentStatus !== "paid" && input.paidAmount != null) {
    return fail("أزل المبلغ أو حدّد حالة الدفع: مدفوع", "unexpected_payment_amount");
  }
  const note = (input.internalNote ?? "").trim();
  const method = (input.paymentMethod ?? "").trim();
  const currency = (input.currency ?? "EGP").trim().toUpperCase();
  if (note.length > 1000 || method.length > 80 || !/^[A-Z]{3}$/.test(currency)) {
    return fail("تحقق من الملاحظة وطريقة الدفع والعملة", "invalid_fields");
  }

  const db = createServiceClient();
  const { data, error } = await db.rpc("admin_update_user_operations", {
    p_user_id: input.userId,
    p_updated_by: actor.userId,
    p_category: input.category,
    p_payment_status: input.paymentStatus,
    p_paid_amount: input.paymentStatus === "paid" ? input.paidAmount : null,
    p_currency: currency,
    p_payment_method: method || null,
    p_issue_status: input.issueStatus,
    p_internal_note: note,
  });
  if (error) {
    await recordAuditLog({
      actor: actor.userId,
      actor_email: actor.userEmail,
      action: "subscriptions.manage",
      resource_type: "user_operations",
      resource_id: input.userId,
      details: { reason: "database_write_failed", error: error.message },
      result: "FAIL",
    });
    const missing = error.code === "PGRST202" || error.code === "42P01" || error.message.includes("admin_update_user_operations");
    return {
      ok: false,
      message: missing
        ? "يلزم تطبيق db/56-admin-user-operations-center.sql لحفظ التصنيف والدفع والمتابعة."
        : `فشل حفظ بيانات المستخدم: ${error.message}`,
      error: missing ? "migration_required" : "database_error",
    };
  }

  await recordAuditLog({
    actor: actor.userId,
    actor_email: actor.userEmail,
    action: "subscriptions.manage",
    resource_type: "user_operations",
    resource_id: input.userId,
    details: {
      category: input.category,
      payment_status: input.paymentStatus,
      paid_amount: input.paymentStatus === "paid" ? input.paidAmount : null,
      currency,
      issue_status: input.issueStatus,
    },
    result: "PASS",
  });
  revalidatePath("/admin/subscriptions");
  revalidatePath(`/admin/users/${input.userId}`);
  return { ok: true, message: "تم حفظ تصنيف المستخدم والدفع والمتابعة.", record: Array.isArray(data) ? data[0] : data };
}
