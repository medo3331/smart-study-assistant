// ============================================================
// EPIC-2 / Subscriptions â€” Manual Activation (Server Action)
// Created 2026-09-19 â€” requires DB tables: user_codes, subscription_plans, subscription_activations, audit_log
// ============================================================

"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "./audit-log-record";
import type { AdminPermissionKey } from "@/lib/auth-roles";
import { resolveActor } from "@/lib/policy";

export interface SubscriptionActivationInput {
  email?: string;          // ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ â€” ظٹظڈط­ظ„ظ‘ ظ„ظ€ UUID ط³ظٹط±ظپط±-side (ظٹظڈظپط¶ظ‘ظ„)
  userCode?: string;       // MAG-XXXX (ط§ط®طھظٹط§ط±ظٹطŒ ظ„ظ„طھظˆط§ظپظ‚ ظ…ط¹ ط§ظ„ط§ط³طھط¯ط¹ط§ط،ط§طھ ط§ظ„ظ‚ط¯ظٹظ…ط©)
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

/** طھظپط¹ظٹظ„ ط§ط´طھط±ط§ظƒ ظٹط¯ظˆظٹ ط¹ط¨ط± User Code â€” ظٹط³ط¬ظ„ ظپظٹ subscription_activations + audit_log */
export async function activateSubscription(
  input: SubscriptionActivationInput,
  adminUserId: string,
  adminEmail: string | null = null
): Promise<SubscriptionActivationResult> {
  try {
    // â”€â”€ EPIC-2 Authorization Guard: ONLY Owner can activate subscriptions (not Admin, not Support)
    const supabaseClient = createServiceClient();
    const actor = await resolveActor(supabaseClient, adminUserId, adminEmail ?? null);
    if (!actor.isOwner) {
      // Explicit clear rejection â€” NOT silent fail, NOT bypass
      await recordAuditLog({
        actor: adminUserId,
        actor_email: adminEmail,
        action: "subscriptions.manage",
        resource_type: "subscription",
        resource_id: input.userCode?.trim() ?? null,
        details: { user_code: input.userCode?.trim() ?? null, plan_key: input.planKey, rejected_by: adminUserId, reason: "non_owner_attempt_rejected" },
        result: "BLOCKED",
      });
      return {
        ok: false,
        message: "ط؛ظٹط± ظ…طµط±ط­: طھظپط¹ظٹظ„ ط§ظ„ط§ط´طھط±ط§ظƒط§طھ ظ…طھط§ط­ ظ„ظ€ Owner ظپظ‚ط· (ظ„ظٹط³ Admin ط£ظˆ Support)",
        error: "authorization_denied_non_owner",
        activationId: null,
        auditId: null,
        userId: null,
      };
    }

    const privileged = createServiceClient();

    // â”€â”€ ط­ظ„ ط§ظ„ظ…ط³طھظ„ظ…: ط§ظ„ط¥ظٹظ…ظٹظ„ ظٹظڈط­ظ„ظ‘ ظ„ظ€ UUID ط³ظٹط±ظپط±-sideط› ط§ظ„ظƒظˆط¯ ظƒط®ظٹط§ط± ط§ط­طھظٹط§ط·ظٹ
    const recipientEmail = (input.email ?? "").trim().toLowerCase();
    let recipientUserId: string | null = null;
    let usedEmail = false;

    if (recipientEmail) {
      const { data: profileRow } = await privileged
        .from("profiles")
        .select("id")
        .eq("email", recipientEmail)
        .maybeSingle();
      recipientUserId = (profileRow as { id?: string } | null)?.id ?? null;
      usedEmail = true;
      if (!recipientUserId) {
        try {
          let page = 1;
          const perPage = 200;
          while (!recipientUserId) {
            const { data } = await privileged.auth.admin.listUsers({ page, perPage });
            const users = data?.users ?? [];
            recipientUserId = users.find((u) => (u.email ?? "").toLowerCase() === recipientEmail)?.id ?? null;
            if (!users.length || users.length < perPage) break;
            page++;
            if (page > 50) break;
          }
        } catch { }
      }
    }
    if (!recipientUserId && input.userCode) {
      const { data: codeRow } = await privileged
        .from("user_codes")
        .select("user_id")
        .eq("code", input.userCode.trim())
        .maybeSingle();
      recipientUserId = (codeRow as { user_id?: string } | null)?.user_id ?? null;
      if (!recipientUserId) {
        const { data: byPublic } = await privileged
          .from("profiles")
          .select("id")
          .eq("public_user_code", input.userCode.trim())
          .maybeSingle();
        recipientUserId = (byPublic as { id?: string } | null)?.id ?? null;
      }
    }

    if (!recipientUserId) {
      await recordAuditLog({
        actor: adminUserId,
        actor_email: adminEmail,
        action: "subscriptions.manage",
        resource_type: "subscription",
        resource_id: (recipientEmail || input.userCode?.trim()) ?? null,
        details: {
          recipient_email: recipientEmail || null,
          user_code: input.userCode?.trim() || null,
          plan_key: input.planKey,
          reason: "recipient_not_found",
        },
        result: "FAIL",
      });
      return {
        ok: false,
        message: recipientEmail
          ? `ط§ظ„ط¥ظٹظ…ظٹظ„ ط؛ظٹط± ظ…ظˆط¬ظˆط¯: ${recipientEmail}`
          : input.userCode
            ? `ظƒظˆط¯ ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ…ظˆط¬ظˆط¯: ${input.userCode.trim()}`
            : "ط­ط¯ط¯ ط§ظ„ظ…ط³طھظ„ظ…: ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ ط£ظˆ ظƒظˆط¯ ط§ظ„ظ…ط³طھط®ط¯ظ…",
        error: "recipient_not_found",
        activationId: null,
        auditId: null,
        userId: null,
      };
    }

    const userId = recipientUserId;

    // 1. (ط¥ط°ط§ ظƒط§ظ† ط§ظ„ظƒظˆط¯ ظ…ط³طھط®ط¯ظ…ط§ظ‹) ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ط§ظ„ظƒظˆط¯ ظˆظ†ط´ط§ط·ظ‡
    if (input.userCode) {
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
        return { ok: false, message: "ظƒظˆط¯ ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ…ظˆط¬ظˆط¯ ط£ظˆ ط؛ظٹط± ظ†ط´ط·", error: "invalid_user_code" };
      }

      if (!(codeRow as any).is_active) {
        return { ok: false, message: "ظƒظˆط¯ ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ†ط´ط·", error: "user_code_inactive" };
      }
    }

    // 2. Verify plan exists
    const { data: planRow, error: planError } = await privileged
      .from("subscription_plans")
      .select("plan_key, name, profile_limit, messages_per_2h, uploads_daily, max_file_size_mb, video_audio_exclusive, is_active")
      .eq("plan_key", input.planKey)
      .single();

    if (planError || !planRow) {
      return { ok: false, message: "ط§ظ„ط®ط·ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط© ط£ظˆ ط؛ظٹط± ظ†ط´ط·ط©", error: "invalid_plan" };
    }

    // 3. Check for existing active subscription (optional: allow multiple or extend)
    // Per spec: manual activation creates a new activation record.
    // We'll insert a new one (manual override) â€” if user wants to extend, they can do it manually via admin note.

    // 4. Insert activation record
    const { data: activationData, error: activationError } = await privileged
      .from("subscription_activations")
      .insert({
        user_code: input.userCode?.trim() ?? null,
        user_id: userId,
        plan_key: input.planKey,
        duration_days: input.durationDays,
        activated_by: adminUserId,
        note: input.note || "طھظپط¹ظٹظ„ ظٹط¯ظˆظٹ ط¹ط¨ط± ظ„ظˆط­ط© ط§ظ„طھط­ظƒظ…",
      })
      .select("id")
      .single();

    if (activationError) {
      await recordAuditLog({
        actor: adminUserId,
        actor_email: adminEmail,
        action: "subscriptions.manage",
        resource_type: "subscription",
        resource_id: input.userCode?.trim() ?? null,
        details: { user_code: input.userCode?.trim() ?? null, plan_key: input.planKey, duration_days: input.durationDays, reason: "db_insert_failed" },
        result: "FAIL",
      });
      return { ok: false, message: "ظپط´ظ„ طھط³ط¬ظٹظ„ ط§ظ„طھظپط¹ظٹظ„: " + activationError.message, error: activationError.message, activationId: null };
    }

    const activationId = (activationData as any)?.id || null;

    // 5. Audit PASS
    const auditResult = await recordAuditLog({
      actor: adminUserId,
      actor_email: adminEmail,
      action: "subscriptions.manage",
      resource_type: "subscription",
      resource_id: (recipientEmail || input.userCode?.trim()) ?? null,
      details: {
        user_code: input.userCode?.trim() ?? null,
        user_id: userId,
        plan_key: input.planKey,
        duration_days: input.durationDays,
        note: input.note || "طھظپط¹ظٹظ„ ظٹط¯ظˆظٹ ط¹ط¨ط± ظ„ظˆط­ط© ط§ظ„طھط­ظƒظ…",
        activation_record_id: activationId,
      },
      result: "PASS",
    });

    return {
      ok: true,
      message: `طھظ… طھظپط¹ظٹظ„ ط§ط´طھط±ط§ظƒ ${planRow?.name || input.planKey} ظ„ظ…ط¯ط© ${input.durationDays} ظٹظˆظ… ظ„ظ„ظ…ط³طھط®ط¯ظ… ${recipientEmail || input.userCode?.trim() || userId.slice(0, 8)}`,
      activationId: activationId,
      auditId: auditResult.id,
      userId: userId,
    };
  } catch (e: any) {
    return { ok: false, message: "ط®ط·ط£ ط؛ظٹط± ظ…طھظˆظ‚ط¹ ط£ط«ظ†ط§ط، ط§ظ„طھظپط¹ظٹظ„", error: e?.message || String(e), activationId: null };
  }
}
