// ============================================================
// EPIC-2 / Rewards — Issue Reward (Server Action)
// Owner only (rewards.manage). Audit: rewards.manage (DISTINCT from subscriptions.manage)
// Reuses subscription_activations mechanism for trial_week/pro_week,
// but audit clearly marks it as a REWARD operation.
// ============================================================

"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "./audit-log-record";
import { getAdminRole, isOwnerEmail } from "@/lib/auth-roles";

export type RewardType = "limit_boost" | "trial_week" | "pro_week" | "upload_credits";

export interface IssueRewardInput {
  recipientUserId: string; // UUID from auth.users / profiles
  rewardType: RewardType;
  rewardValue: number;     // e.g., +50 for limit_boost, 7 for trial/pro week, 10 for upload_credits
  durationDays?: number | null; // only for trial/pro week
  note?: string;
}

export interface IssueRewardResult {
  ok: boolean;
  message: string;
  rewardId?: string | null;
  auditId?: string | null;
  error?: string | null;
  subscriptionActivationUsed?: boolean; // true when trial/pro week triggers subscription_activations
}

export async function issueReward(
  input: IssueRewardInput,
  adminUserId: string,
  adminEmail: string | null = null
): Promise<IssueRewardResult> {
  try {
    // ── EPIC-2 Authorization Guard: ONLY Owner (rewards.manage = owner only)
    const supabaseClient = createServiceClient();
    const role = await getAdminRole(supabaseClient, adminUserId, adminEmail);
    const isActualOwner = role === "owner" || isOwnerEmail(adminEmail ?? null);
    if (!isActualOwner) {
      await recordAuditLog({
        actor: adminUserId,
        actor_email: adminEmail,
        action: "rewards.manage",
        resource_type: "reward",
        resource_id: input.recipientUserId,
        details: {
          recipient_user_id: input.recipientUserId,
          reward_type: input.rewardType,
          rejected_by: adminUserId,
          reason: "non_owner_attempt_rejected",
        },
        result: "BLOCKED",
      });
      return {
        ok: false,
        message: "غير مصرح: إصدار المكافآت متاح لـ Owner فقط",
        error: "authorization_denied_non_owner",
        rewardId: null,
        auditId: null,
      };
    }

    const privileged = createServiceClient();
    let subscriptionActivationUsed = false;
    let activationId: string | null = null;

    // ── For trial_week / pro_week: reuse subscription_activations mechanism
    // BUT audit remains rewards.manage (clear distinction from subscriptions.manage)
    if (input.rewardType === "trial_week" || input.rewardType === "pro_week") {
      const planKey = input.rewardType === "trial_week" ? "free" : "pro"; // simplified mapping
      // Look up user code (same mechanism as subscription-activate)
      const { data: userProfile } = await privileged
        .from("profiles")
        .select("id")
        .eq("id", input.recipientUserId)
        .maybeSingle();
      if (!userProfile) {
        await recordAuditLog({
          actor: adminUserId,
          actor_email: adminEmail,
          action: "rewards.manage",
          resource_type: "reward",
          resource_id: input.recipientUserId,
          details: {
            recipient_user_id: input.recipientUserId,
            reward_type: input.rewardType,
            reason: "recipient_profile_not_found",
            via_subscription_activations: true,
          },
          result: "FAIL",
        });
        return { ok: false, message: "المتلقي غير موجود في قاعدة البيانات", error: "recipient_not_found", subscriptionActivationUsed: true };
      }

      // Check for existing user code (simplified: we don't enforce code lookup for rewards,
      // but we reuse the activation table for persistence of the trial/pro grant)
      const { data: activationData, error: activationError } = await privileged
        .from("subscription_activations")
        .insert({
          user_code: `REWARD-${input.recipientUserId.slice(0, 8)}`,
          user_id: input.recipientUserId,
          plan_key: planKey,
          duration_days: input.durationDays || 7,
          activated_by: adminUserId,
          note: `مكافأة (${input.rewardType}) عبر نظام Rewards — ${input.note || ""}`.trim(),
        })
        .select("id")
        .single();

      if (activationError) {
        await recordAuditLog({
          actor: adminUserId,
          actor_email: adminEmail,
          action: "rewards.manage",
          resource_type: "reward",
          resource_id: input.recipientUserId,
          details: {
            recipient_user_id: input.recipientUserId,
            reward_type: input.rewardType,
            reason: "subscription_activation_insert_failed",
            error: activationError.message,
            via_subscription_activations: true,
          },
          result: "FAIL",
        });
        return { ok: false, message: "فشل تسجيل التفعيل: " + activationError.message, error: activationError.message, subscriptionActivationUsed: true };
      }

      activationId = (activationData as any)?.id || null;
      subscriptionActivationUsed = true;
    }

    // ── Insert into rewards_issued (always, for all reward types)
    const { data: rewardData, error: rewardError } = await privileged
      .from("rewards_issued")
      .insert({
        recipient_user_id: input.recipientUserId,
        reward_type: input.rewardType,
        reward_value: input.rewardValue,
        duration_days: (input.rewardType === "trial_week" || input.rewardType === "pro_week") ? (input.durationDays || 7) : null,
        issued_by: adminUserId,
        note: input.note ? `مكافأة (${input.rewardType}) — ${input.note}` : `مكافأة (${input.rewardType})`,
      })
      .select("id")
      .single();

    if (rewardError) {
      await recordAuditLog({
        actor: adminUserId,
        actor_email: adminEmail,
        action: "rewards.manage",
        resource_type: "reward",
        resource_id: input.recipientUserId,
        details: {
          recipient_user_id: input.recipientUserId,
          reward_type: input.rewardType,
          reason: "rewards_issued_insert_failed",
          error: rewardError.message,
          via_subscription_activations: subscriptionActivationUsed,
        },
        result: "FAIL",
      });
      return { ok: false, message: "فشل تسجيل المكافأة: " + rewardError.message, error: rewardError.message, subscriptionActivationUsed };
    }

    const rewardId = (rewardData as any)?.id || null;

    // ── Audit PASS — ALWAYS rewards.manage (NEVER subscriptions.manage)
    // Details clearly distinguish subscription reuse when applicable.
    const auditResult = await recordAuditLog({
      actor: adminUserId,
      actor_email: adminEmail,
      action: "rewards.manage",
      resource_type: "reward",
      resource_id: input.recipientUserId,
      details: {
        recipient_user_id: input.recipientUserId,
        reward_type: input.rewardType,
        reward_value: input.rewardValue,
        duration_days: (input.rewardType === "trial_week" || input.rewardType === "pro_week") ? (input.durationDays || 7) : null,
        note: input.note || "",
        subscription_activation_reused: subscriptionActivationUsed,
        subscription_activation_id: activationId,
        reward_record_id: rewardId,
        distinction: "This is a REWARD operation (rewards.manage), not a direct subscription activation (subscriptions.manage). Audit distinguishes clearly even when subscription_activations mechanism is reused.",
      },
      result: "PASS",
    });

    return {
      ok: true,
      message: `تم إصدار مكافأة ${input.rewardType} للمستخدم ${input.recipientUserId.slice(0, 8)}... (Audit: ${auditResult.id || "none"})`,
      rewardId,
      auditId: auditResult.id,
      subscriptionActivationUsed,
    };
  } catch (e: any) {
    return {
      ok: false,
      message: "خطأ غير متوقع أثناء إصدار المكافأة",
      error: e?.message || String(e),
      rewardId: null,
      auditId: null,
    };
  }
}
