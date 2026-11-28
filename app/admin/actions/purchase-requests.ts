"use server";

/**
 * إجراءات الأدمن على طلبات الشراء (/admin/purchase-requests):
 *   - موافقة: credits → grant_credits (service-only)، plan → admin_activate_subscription.
 *   - رفض: status=rejected + admin_note.
 * كل محاولة تُسجَّل في admin_audit_log، والتحديث على الطلب ذرّي بشرط الحالة
 * (استحالة موافقة مزدوجة لو اتنين أدمن ضغطوا في نفس اللحظة).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "@/lib/admin/audit-log-record";
import { requireAdminActor } from "@/lib/admin/action-guard";
import { getTicketMessages } from "@/lib/admin/purchase-requests";
import { appendTicketAdminReply, notifyUser } from "@/lib/store/purchase-requests";
import { isUuid } from "@/lib/credits/grants";

/** قراءة محادثة الدعم المرتبطة بطلب (للعرض في لوحة المراجعة). */
export async function fetchPurchaseTicketMessages(requestId: string) {
  await requireAdminActor("subscriptions.manage");
  return getTicketMessages(requestId);
}

export interface PurchaseRequestActionResult {
  ok: boolean;
  message: string;
  error?: string | null;
}

const MAX_NOTE = 500;

async function loadRequest(requestId: string) {
  const db = createServiceClient();
  const { data, error } = await db
    .from("purchase_requests")
    .select("id, user_id, kind, credits, plan_key, plan_duration_days, amount, currency, status, ticket_id")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as {
    id: string; user_id: string; kind: "credits" | "plan";
    credits: number | null; plan_key: string | null; plan_duration_days: number | null;
    amount: number | null; currency: string; status: string; ticket_id: string | null;
  } | null;
}

/** تحديث ذرّي: ينجح مرة واحدة فقط من حالة payment_submitted. */
async function transitionStatus(
  requestId: string,
  to: "approved" | "rejected",
  reviewedBy: string,
  adminNote: string | null
): Promise<boolean> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("purchase_requests")
    .update({ status: to, reviewed_by: reviewedBy, reviewed_at: new Date().toISOString(), admin_note: adminNote })
    .eq("id", requestId)
    .eq("status", "payment_submitted")
    .select("id")
    .maybeSingle();
  return !error && !!data;
}

export async function approvePurchaseRequest(requestId: string, adminNote?: string): Promise<PurchaseRequestActionResult> {
  let actor;
  try {
    ({ actor } = await requireAdminActor("subscriptions.manage"));
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "غير مصرح", error: "authorization_denied" };
  }
  const adminUserId = actor.userId!;
  const db = createServiceClient();
  const note = (adminNote ?? "").trim().slice(0, MAX_NOTE);

  if (!isUuid(requestId)) {
    return { ok: false, message: "معرّف الطلب غير صالح.", error: "invalid_request_id" };
  }

  const request = await loadRequest(requestId).catch(() => null);
  if (!request) {
    return { ok: false, message: "الطلب غير موجود.", error: "not_found" };
  }
  if (request.status !== "payment_submitted") {
    return { ok: false, message: "لا يمكن الموافقة قبل تأكيد المستخدم للدفع.", error: "status_invalid" };
  }

  let resultMessage = "";

  if (request.kind === "credits") {
    const credits = Number(request.credits);
    if (!Number.isInteger(credits) || credits <= 0) {
      return { ok: false, message: "بيانات الكريدت في الطلب غير صالحة.", error: "invalid_credits" };
    }
    const { error: grantError } = await db.rpc("grant_credits", {
      p_user_id: request.user_id,
      p_amount: credits,
      p_expires_at: null, // default: 90 يومًا
      p_source: "bonus",
      p_notes: `شراء كريدت — طلب ${request.id.slice(0, 8)}`,
    });
    if (grantError) {
      await recordAuditLog({
        actor: adminUserId, actor_email: actor.userEmail ?? null, action: "subscriptions.manage", resource_type: "purchase_request", resource_id: requestId,
        details: { request_id: requestId, reason: grantError.message }, result: "FAIL",
      });
      return { ok: false, message: `فشل منح الكريدت: ${grantError.message}`, error: "grant_failed" };
    }
    resultMessage = `تمت الموافقة وإضافة ${credits} كريدت للمستخدم.`;
  } else if (request.kind === "plan") {
    const planKey = request.plan_key ?? "";
    const durationDays = Number(request.plan_duration_days ?? 30);
    if (!["pro", "ultra"].includes(planKey) || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365) {
      return { ok: false, message: "بيانات الباقة في الطلب غير صالحة.", error: "invalid_plan" };
    }
    const { data: codeRow } = await db
      .from("user_codes")
      .select("code")
      .eq("user_id", request.user_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: activationRows, error: activationError } = await db.rpc("admin_activate_subscription", {
      p_user_id: request.user_id,
      p_user_code: codeRow?.code ?? null,
      p_plan_key: planKey,
      p_duration_days: durationDays,
      p_activated_by: adminUserId,
      p_note: note || `اشتراك مدفوع — طلب ${request.id.slice(0, 8)}`,
    });
    const activation = Array.isArray(activationRows) ? activationRows[0] : activationRows;
    if (activationError || !activation?.activation_id) {
      await recordAuditLog({
        actor: adminUserId, actor_email: actor.userEmail ?? null, action: "subscriptions.manage", resource_type: "purchase_request", resource_id: requestId,
        details: { request_id: requestId, reason: activationError?.message ?? "no activation" }, result: "FAIL",
      });
      return { ok: false, message: `فشل تفعيل الاشتراك: ${activationError?.message ?? "لا نتيجة"}`, error: "activation_failed" };
    }
    resultMessage = `تمت الموافقة وتفعيل اشتراك ${planKey} لمدة ${durationDays} يوم.`;
  } else {
    return { ok: false, message: "نوع الطلب غير معروف.", error: "kind_invalid" };
  }

  const transitioned = await transitionStatus(requestId, "approved", adminUserId, note || null);
  if (!transitioned) {
    return { ok: false, message: "الطلب تغيّر للتو (مراجعة أخرى أو إلغاء) — حدّث القائمة.", error: "race_condition" };
  }

  const isPlan = request.kind === "plan";
  await notifyUser(
    request.user_id,
    isPlan ? "تم قبول اشتراكك ✅" : "تم شحن الكريدت ✅",
    isPlan
      ? `تمت الموافقة على اشتراك ${planLabel(request.plan_key)} وتفعيله.${note ? ` ملاحظة الإدارة: ${note}` : ""}`
      : `تمت الموافقة على طلبك وإضافة ${request.credits} كريدت لرصيدك.${note ? ` ملاحظة الإدارة: ${note}` : ""}`
  );
  await appendTicketAdminReply(
    request.ticket_id,
    adminUserId,
    `✅ تم قبول طلب الاشتراك وتفعيل باقة ${planLabel(request.plan_key)} لمدة ${request.plan_duration_days ?? 30} يوم.${note ? `\nملاحظة الإدارة: ${note}` : ""}`,
    true
  );
  await recordAuditLog({
    actor: adminUserId, actor_email: actor.userEmail ?? null, action: "subscriptions.manage", resource_type: "purchase_request", resource_id: requestId,
    details: { request_id: requestId, kind: request.kind, user_id: request.user_id, amount: request.amount, note }, result: "PASS",
  });

  return { ok: true, message: resultMessage };
}

export async function rejectPurchaseRequest(requestId: string, adminNote?: string): Promise<PurchaseRequestActionResult> {
  let actor;
  try {
    ({ actor } = await requireAdminActor("subscriptions.manage"));
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "غير مصرح", error: "authorization_denied" };
  }
  const adminUserId = actor.userId!;
  const note = (adminNote ?? "").trim().slice(0, MAX_NOTE);

  if (!isUuid(requestId)) {
    return { ok: false, message: "معرّف الطلب غير صالح.", error: "invalid_request_id" };
  }

  const request = await loadRequest(requestId).catch(() => null);
  if (!request) {
    return { ok: false, message: "الطلب غير موجود.", error: "not_found" };
  }
  if (request.status !== "payment_submitted") {
    return { ok: false, message: "لا يمكن الرفض إلا بعد تأكيد المستخدم للدفع.", error: "status_invalid" };
  }

  const transitioned = await transitionStatus(requestId, "rejected", adminUserId, note || null);
  if (!transitioned) {
    return { ok: false, message: "الطلب تغيّر للتو — حدّث القائمة.", error: "race_condition" };
  }

  await notifyUser(
    request.user_id,
    request.kind === "plan" ? "لم يتم قبول طلب الاشتراك ❌" : "لم يتم قبول طلب شراء الكريدت ❌",
    `بعد مراجعة إثبات الدفع، لم يتم قبول الطلب.${note ? ` السبب: ${note}` : " تواصل مع الدعم للاستفسار."}`
  );
  await appendTicketAdminReply(
    request.ticket_id,
    adminUserId,
    `❌ لم يتم قبول طلب الاشتراك بعد مراجعة إثبات الدفع.${note ? `\nالسبب: ${note}` : ""}`,
    true
  );
  await recordAuditLog({
    actor: adminUserId, actor_email: actor.userEmail ?? null, action: "subscriptions.manage", resource_type: "purchase_request", resource_id: requestId,
    details: { request_id: requestId, kind: request.kind, user_id: request.user_id, note }, result: "PASS",
  });

  return { ok: true, message: "تم رفض الطلب وإشعار المستخدم." };
}

export interface PurchaseRequestUpdateInput {
  requestId: string;
  planKey?: string;
  durationDays?: number;
  amount?: number;
  adminNote?: string;
}

/**
 * تعديل الطلب من الأدمن قبل المراجعة النهائية: الباقة / المدة / المبلغ / ملاحظة.
 * مسموح فقط قبل القرار (awaiting_payment أو payment_submitted) ولكل تعديل سجل audit.
 */
export async function updatePurchaseRequestAdmin(input: PurchaseRequestUpdateInput): Promise<PurchaseRequestActionResult> {
  let actor;
  try {
    ({ actor } = await requireAdminActor("subscriptions.manage"));
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "غير مصرح", error: "authorization_denied" };
  }
  const adminUserId = actor.userId!;
  const db = createServiceClient();

  if (!isUuid(input.requestId)) {
    return { ok: false, message: "معرّف الطلب غير صالح.", error: "invalid_request_id" };
  }
  const request = await loadRequest(input.requestId).catch(() => null);
  if (!request) {
    return { ok: false, message: "الطلب غير موجود.", error: "not_found" };
  }
  if (request.status !== "awaiting_payment" && request.status !== "payment_submitted") {
    return { ok: false, message: "لا يمكن تعديل الطلب بعد صدور القرار.", error: "status_invalid" };
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.planKey !== undefined) {
    const planKey = input.planKey.trim().toLowerCase();
    if (!["pro", "ultra"].includes(planKey)) {
      return { ok: false, message: "الباقة يجب أن تكون pro أو ultra.", error: "invalid_plan" };
    }
    updates.plan_key = planKey;
  }
  if (input.durationDays !== undefined) {
    if (!Number.isInteger(input.durationDays) || input.durationDays < 1 || input.durationDays > 365) {
      return { ok: false, message: "المدة يجب أن تكون من 1 إلى 365 يوم.", error: "invalid_duration" };
    }
    updates.plan_duration_days = input.durationDays;
  }
  if (input.amount !== undefined) {
    if (!Number.isFinite(input.amount) || input.amount < 0) {
      return { ok: false, message: "المبلغ غير صالح.", error: "invalid_amount" };
    }
    updates.amount = input.amount;
  }
  if (input.adminNote !== undefined) {
    updates.admin_note = input.adminNote.trim().slice(0, MAX_NOTE) || null;
  }

  const { error: updateError } = await db
    .from("purchase_requests")
    .update(updates)
    .eq("id", input.requestId)
    .in("status", ["awaiting_payment", "payment_submitted"]);
  if (updateError) {
    return { ok: false, message: `فشل التعديل: ${updateError.message}`, error: "update_failed" };
  }

  await recordAuditLog({
    actor: adminUserId, actor_email: actor.userEmail ?? null, action: "subscriptions.manage",
    resource_type: "purchase_request", resource_id: input.requestId,
    details: { request_id: input.requestId, action: "admin_edit", changes: updates }, result: "PASS",
  });

  return { ok: true, message: "تم حفظ التعديلات على الطلب." };
}

/** رد الإدارة في محادثة الدعم المرتبطة بطلب اشتراك (تظهر للمستخدم في /inbox). */
export async function replyToPurchaseTicket(requestId: string, message: string): Promise<PurchaseRequestActionResult> {
  let actor;
  try {
    ({ actor } = await requireAdminActor("subscriptions.manage"));
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "غير مصرح", error: "authorization_denied" };
  }
  const adminUserId = actor.userId!;
  const text = (message ?? "").trim().slice(0, 5000);
  if (!text) {
    return { ok: false, message: "اكتب نص الرد أولًا.", error: "empty_message" };
  }
  if (!isUuid(requestId)) {
    return { ok: false, message: "معرّف الطلب غير صالح.", error: "invalid_request_id" };
  }
  const request = await loadRequest(requestId).catch(() => null);
  if (!request?.ticket_id) {
    return { ok: false, message: "الطلب غير مرتبط بمحادثة دعم.", error: "no_ticket" };
  }
  await appendTicketAdminReply(request.ticket_id, adminUserId, text, false);
  await recordAuditLog({
    actor: adminUserId, actor_email: actor.userEmail ?? null, action: "subscriptions.manage",
    resource_type: "purchase_request", resource_id: requestId,
    details: { request_id: requestId, action: "ticket_reply" }, result: "PASS",
  });
  return { ok: true, message: "تم إرسال الرد في المحادثة." };
}

function planLabel(planKey: string | null): string {
  if (planKey === "pro") return "احترافي";
  if (planKey === "ultra") return "ألتميت";
  return planKey ?? "";
}
