// ============================================================
// EPIC-2 / Subscriptions — Manual Activation (Server Action)
// Created 2026-09-19 — requires DB tables: user_codes, subscription_plans, subscription_activations, audit_log
// ============================================================

"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "./audit-log-record";
import type { AdminPermissionKey } from "@/lib/auth-roles";
import { getAdminRole, isOwnerEmail } from "@/lib/auth-roles";

export interface SubscriptionActivationInput {
  userCode: string;          // MAG-XXXX
  planKey: string;           // free | pro | ultra
  durationDays: number;      // e.g., 30, 90, 365
  note?: string;             // admin note (payment method, etc.)
}

export interface SubscriptionActivationResult {
  ok: boolean;
  message: string;
  activationId?: string | null;
  auditId?: string | null;
  userId?: string | null;
  error?: string | null;
}

/** تفعيل اشتراك يدوي عبر User Code — يسجل في subscription_activations + audit_log */
export async function activateSubscription(
  input: SubscriptionActivationInput,
  adminUserId: string,
  adminEmail: string | null = null
): Promise<SubscriptionActivationResult> {
  try {
    // ── EPIC-2 Authorization Guard: ONLY Owner can activate subscriptions (not Admin, not Support)
    const supabaseClient = createServiceClient();
    const role = await getAdminRole(supabaseClient, adminUserId, adminEmail);
    const isActualOwner = role === "owner" || isOwnerEmail(adminEmail ?? null);
    if (!isActualOwner) {
      // Explicit clear rejection — NOT silent fail, NOT bypass
      await recordAuditLog({
        actor: adminUserId,
        actor_email: adminEmail,
        action: "subscriptions.manage",
        resource_type: "subscription",
        resource_id: input.userCode.trim(),
        details: { user_code: input.userCode.trim(), plan_key: input.planKey, rejected_by: adminUserId, reason: "non_owner_attempt_rejected" },
        result: "BLOCKED",
      });
      return {
        ok: false,
        message: "غير مصرح: تفعيل الاشتراكات متاح لـ Owner فقط (ليس Admin أو Support)",
        error: "authorization_denied_non_owner",
        activationId: null,
        auditId: null,
        userId: null,
      };
    }

    const privileged = createServiceClient();

    // 1. Lookup user by code
    const { data: codeRow, error: codeError } = await privileged
      .from("user_codes")
      .select("code, user_id, is_active")
      .eq("code", input.userCode.trim())
      .single();

    if (codeError || !codeRow) {
      // Audit FAIL for invalid code
      await recordAuditLog({
        actor: adminUserId,
        actor_email: adminEmail,
        action: "subscriptions.manage",
        resource_type: "subscription",
        resource_id: input.userCode.trim(),
        details: { user_code: input.userCode.trim(), plan_key: input.planKey, reason: "invalid_or_inactive_user_code" },
        result: "FAIL",
      });
      return { ok: false, message: "كود المستخدم غير موجود أو غير نشط", error: "invalid_user_code" };
    }

    const userId = (codeRow as any).user_id;
    if (!(codeRow as any).is_active) {
      return { ok: false, message: "كود المستخدم غير نشط", error: "user_code_inactive" };
    }

    // 2. Verify plan exists
    const { data: planRow, error: planError } = await privileged
      .from("subscription_plans")
      .select("plan_key, name, profile_limit, messages_per_2h, uploads_daily, max_file_size_mb, video_audio_exclusive, is_active")
      .eq("plan_key", input.planKey)
      .single();

    if (planError || !planRow) {
      return { ok: false, message: "الخطة غير موجودة أو غير نشطة", error: "invalid_plan" };
    }

    // 3. Check for existing active subscription (optional: allow multiple or extend)
    // Per spec: manual activation creates a new activation record.
    // We'll insert a new one (manual override) — if user wants to extend, they can do it manually via admin note.

    // 4. Insert activation record
    const { data: activationData, error: activationError } = await privileged
      .from("subscription_activations")
      .insert({
        user_code: input.userCode.trim(),
        user_id: userId,
        plan_key: input.planKey,
        duration_days: input.durationDays,
        activated_by: adminUserId,
        note: input.note || "تفعيل يدوي عبر لوحة التحكم",
      })
      .select("id")
      .single();

    if (activationError) {
      await recordAuditLog({
        actor: adminUserId,
        actor_email: adminEmail,
        action: "subscriptions.manage",
        resource_type: "subscription",
        resource_id: input.userCode.trim(),
        details: { user_code: input.userCode.trim(), plan_key: input.planKey, duration_days: input.durationDays, reason: "db_insert_failed" },
        result: "FAIL",
      });
      return { ok: false, message: "فشل تسجيل التفعيل: " + activationError.message, error: activationError.message, activationId: null };
    }

    const activationId = (activationData as any)?.id || null;

    // 5. Audit PASS
    const auditResult = await recordAuditLog({
      actor: adminUserId,
      actor_email: adminEmail,
      action: "subscriptions.manage",
      resource_type: "subscription",
      resource_id: input.userCode.trim(),
      details: {
        user_code: input.userCode.trim(),
        user_id: userId,
        plan_key: input.planKey,
        duration_days: input.durationDays,
        note: input.note || "تفعيل يدوي عبر لوحة التحكم",
        activation_record_id: activationId,
      },
      result: "PASS",
    });

    return {
      ok: true,
      message: `تم تفعيل اشتراك ${planRow?.name || input.planKey} لمدة ${input.durationDays} يوم للمستخدم ${input.userCode.trim()}`,
      activationId: activationId,
      auditId: auditResult.id,
      userId: userId,
    };
  } catch (e: any) {
    return { ok: false, message: "خطأ غير متوقع أثناء التفعيل", error: e?.message || String(e), activationId: null };
  }
}
