"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "@/lib/admin/audit-log-record";
import { isUuid } from "@/lib/credits/grants";
import { requireAdminActor } from "@/lib/admin/action-guard";

export interface SubscriptionActivationInput {
  recipientUserId?: string;
  email?: string;
  userCode?: string;
  planKey: string;
  durationDays: number;
  note?: string;
}

export interface SubscriptionActivationResult {
  ok: boolean;
  message: string;
  activationId?: string | null;
  auditId?: string | null;
  userId?: string | null;
  error?: string | null;
}

export async function activateSubscription(input: SubscriptionActivationInput): Promise<SubscriptionActivationResult> {
  let actor;
  try {
    ({ actor } = await requireAdminActor("subscriptions.manage"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "غير مصرح";
    return { ok: false, message, error: "authorization_denied", activationId: null, auditId: null, userId: null };
  }
  const adminUserId = actor.userId!;
  const adminEmail = actor.userEmail;
  const db = createServiceClient();
  const fail = async (message: string, error: string, userId: string | null = null) => {
    await recordAuditLog({ actor: adminUserId, actor_email: adminEmail, action: "subscriptions.manage", resource_type: "subscription", resource_id: userId, details: { user_id: userId, plan_key: input.planKey, reason: error }, result: "FAIL" });
    return { ok: false, message, error, activationId: null, userId };
  };

  if (!actor.isOwner && actor.role !== "admin") return fail("غير مصرح: دورك لا يسمح بإدارة الاشتراكات", "authorization_denied_role");
  if (!["free", "pro", "ultra"].includes(input.planKey) || !Number.isInteger(input.durationDays) || input.durationDays < 1 || input.durationDays > 365) {
    return fail("بيانات غير صالحة: اختر خطة معتمدة ومدة من 1 إلى 365 يومًا", "invalid_input");
  }

  let userId: string | null = null;
  let linkedCode: string | null = null;
  if (input.recipientUserId) {
    const id = input.recipientUserId.trim();
    if (!isUuid(id)) return fail("معرّف المستخدم ليس UUID صالحًا", "invalid_user_id");
    const { data, error } = await db.from("profiles").select("id").eq("id", id).maybeSingle();
    if (error) return fail("تعذر قراءة ملف المستخدم", "profile_lookup_failed");
    if (data) userId = data.id;
  }
  const email = (input.email ?? "").trim().toLowerCase();
  if (!userId && email) {
    const { data, error } = await db.from("profiles").select("id").ilike("email", email).maybeSingle();
    if (error) return fail("تعذر البحث عن المستخدم بالبريد", "profile_lookup_failed");
    if (data) userId = data.id;
    if (!userId) {
      for (let page = 1; page <= 50 && !userId; page++) {
        const { data: pageData, error: authError } = await db.auth.admin.listUsers({ page, perPage: 200 });
        if (authError) return fail("تعذر البحث عن المستخدم في الحسابات المسجلة", "auth_lookup_failed");
        const users = pageData?.users ?? [];
        userId = users.find((candidate) => candidate.email?.toLowerCase() === email)?.id ?? null;
        if (users.length < 200) break;
      }
    }
  }
  const requestedCode = (input.userCode ?? "").trim();
  if (!userId && requestedCode) {
    const { data } = await db.from("user_codes").select("user_id, code, is_active").eq("code", requestedCode).maybeSingle();
    if (data?.is_active && data.user_id) { userId = data.user_id; linkedCode = data.code; }
    if (!userId) {
      const { data: profile } = await db.from("profiles").select("id, public_user_code").eq("public_user_code", requestedCode).maybeSingle();
      if (profile) { userId = profile.id; linkedCode = profile.public_user_code ?? null; }
    }
  }
  if (!userId) return fail(email ? "الإيميل غير موجود ضمن الحسابات المسجلة" : requestedCode ? "كود المستخدم غير موجود" : "حدد المستخدم عبر UUID أو البريد الإلكتروني", "recipient_not_found");
  if (input.recipientUserId && userId !== input.recipientUserId.trim()) return fail("تعذر التحقق من تطابق المستخدم", "recipient_id_mismatch", userId);
  if (requestedCode && linkedCode && requestedCode !== linkedCode) return fail("كود المستخدم لا يطابق الحساب المحدد", "recipient_code_mismatch", userId);
  const { data: codeRows, error: codeError } = await db.from("user_codes").select("code").eq("user_id", userId).eq("is_active", true).order("created_at", { ascending: false }).limit(1);
  if (codeError && requestedCode) return fail("تعذر التحقق من كود MAG المرتبط بالمستخدم", "user_code_lookup_failed", userId);
  const activeCode = codeError ? null : codeRows?.[0]?.code ?? null;
  if (requestedCode && activeCode !== requestedCode) return fail("كود MAG غير نشط أو غير مرتبط بالحساب المحدد", "invalid_user_code", userId);
  linkedCode = activeCode;

  const { data: plan, error: planError } = await db.from("subscription_plans")
    .select("plan_key, name, is_active").eq("plan_key", input.planKey).eq("is_active", true).maybeSingle();
  if (planError || !plan) return fail("الخطة غير موجودة أو غير نشطة", "invalid_plan", userId);

  // MAG remains an optional compatibility identifier. The DB function is added by migration 54.
  const { data: resultRows, error: activationError } = await db.rpc("admin_activate_subscription", {
    p_user_id: userId,
    p_user_code: linkedCode,
    p_plan_key: input.planKey,
    p_duration_days: input.durationDays,
    p_activated_by: adminUserId,
    p_note: input.note?.trim() || "تفعيل يدوي عبر لوحة التحكم",
  });
  const activation = Array.isArray(resultRows) ? resultRows[0] : resultRows;
  if (activationError || !activation?.activation_id) {
    const message = activationError?.message ?? "Activation procedure did not return an activation.";
    const migrationMissing = activationError?.code === "PGRST202" || activationError?.message?.includes("admin_activate_subscription");
    return fail(migrationMissing ? "يلزم تطبيق ترحيل قاعدة البيانات 54 لتفعيل الاشتراك وإرسال رسالة الترحيب." : `فشل التفعيل: ${message}`, migrationMissing ? "migration_required" : "activation_failed", userId);
  }
  const expiresAt = String(activation.expires_at);
  const audit = await recordAuditLog({
    actor: adminUserId, actor_email: adminEmail, action: "subscriptions.manage", resource_type: "subscription", resource_id: userId,
    details: { user_id: userId, plan_key: input.planKey, duration_days: input.durationDays, expires_at: expiresAt, activation_record_id: activation.activation_id, user_code: linkedCode, welcome_notification_created: activation.notification_created === true }, result: "PASS",
  });
  return {
    ok: true,
    message: `تم تفعيل خطة ${activation.plan_name || plan.name || input.planKey} حتى ${new Date(expiresAt).toLocaleDateString("ar-EG")}${activation.notification_created ? " وإرسال رسالة الترحيب" : ""}.`,
    activationId: activation.activation_id,
    auditId: audit.id,
    userId,
  };
}
