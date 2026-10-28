/**
 * Subscription quota helper: daily + monthly UTC message quotas.
 */

import { createServiceClient } from "@/lib/supabase/admin";

export type QuotaKind = "message" | "upload";

export interface QuotaCheckResult {
  allowed: boolean;
  kind: QuotaKind;
  planKey: string;
  used: number;
  limit: number;
  resetAt: string | null;
  reasonAr?: string;
  ownerBypass?: boolean;
  dailyUsed: number;
  dailyLimit: number;
  dailyResetAt: string | null;
  monthlyUsed: number;
  monthlyLimit: number;
  monthlyResetAt: string | null;
  exceededPeriod?: "daily" | "monthly" | null;
}

function utcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function utcMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function isFailOpenEnabled(): boolean {
  return process.env.QUOTA_FAIL_OPEN === "true";
}

function logQuotaFailOpen(userId: string, kind: QuotaKind, error: unknown): void {
  const msg = (error as { message?: string })?.message || String(error);
  console.error(JSON.stringify({ event: "quota_fail_open", severity: "high", user_id: userId, kind, reason: "rpc_or_table_unavailable", error: msg, timestamp: new Date().toISOString(), policy: "fail-open" }));
}

export async function checkSubscriptionQuotas(
  userId: string,
  kind: QuotaKind,
  isOwner = false,
  requestId?: string
): Promise<QuotaCheckResult> {
  if (isOwner) {
    return {
      allowed: true,
      kind,
      planKey: "owner",
      used: 0,
      limit: -1,
      resetAt: null,
      reasonAr: "Owner bypass",
      ownerBypass: true,
      dailyUsed: 0,
      dailyLimit: -1,
      dailyResetAt: null,
      monthlyUsed: 0,
      monthlyLimit: -1,
      monthlyResetAt: null,
      exceededPeriod: null,
    };
  }

  const reqId = requestId && requestId.trim() ? requestId.trim() : crypto.randomUUID();
  const dailyKey = `quota:${userId}:${kind}:day:${utcDateKey()}:${reqId}`;
  const monthlyKey = kind === "message" ? `quota:${userId}:message:month:${utcMonthKey()}:${reqId}` : null;

  try {
    const privileged = createServiceClient();
    const { data, error } = await privileged.rpc("consume_subscription_quotas", {
      p_user_id: userId,
      p_kind: kind,
      p_daily_idempotency_key: dailyKey,
      p_monthly_idempotency_key: monthlyKey,
    } as unknown as { p_user_id: string; p_kind: string; p_daily_idempotency_key: string; p_monthly_idempotency_key: string | null });

    if (error) throw error;

    const result = data as {
      allowed: boolean;
      daily_used: number;
      daily_limit: number;
      monthly_used: number;
      monthly_limit: number;
      reset_at_daily: string | null;
      reset_at_monthly: string | null;
      already_consumed_daily: boolean;
      already_consumed_monthly: boolean;
      exceeded_period: string | null;
      plan_key: string | null;
    } | null;

    if (!result) throw new Error("consume_subscription_quotas returned no data");

    let planKey = "free";
    try {
      const { data: ent } = await privileged
        .from("entitlements")
        .select("value")
        .eq("user_id", userId)
        .eq("kind", "plan")
        .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (typeof ent?.value === "string" && ent.value) planKey = ent.value;
    } catch {
      // keep free
    }
    if (result.plan_key) planKey = result.plan_key;

    const exceeded = (result.exceeded_period === "daily" || result.exceeded_period === "monthly")
      ? (result.exceeded_period as "daily" | "monthly")
      : null;

    if (!result.allowed) {
      const reasonAr = exceeded === "monthly"
        ? `Monthly quota exceeded (${result.monthly_limit}/month).`
        : `Daily quota exceeded (${result.daily_limit}/day).`;
      return {
        allowed: false,
        kind,
        planKey,
        used: result.daily_used,
        limit: result.daily_limit,
        resetAt: result.reset_at_daily,
        reasonAr,
        dailyUsed: result.daily_used,
        dailyLimit: result.daily_limit,
        dailyResetAt: result.reset_at_daily,
        monthlyUsed: result.monthly_used,
        monthlyLimit: result.monthly_limit,
        monthlyResetAt: result.reset_at_monthly,
        exceededPeriod: exceeded,
      };
    }

    return {
      allowed: true,
      kind,
      planKey,
      used: result.daily_used,
      limit: result.daily_limit,
      resetAt: result.reset_at_daily,
      dailyUsed: result.daily_used,
      dailyLimit: result.daily_limit,
      dailyResetAt: result.reset_at_daily,
      monthlyUsed: result.monthly_used,
      monthlyLimit: result.monthly_limit,
      monthlyResetAt: result.reset_at_monthly,
      exceededPeriod: null,
    };
  } catch (e) {
    if (isFailOpenEnabled()) {
      logQuotaFailOpen(userId, kind, e);
      return {
        allowed: true,
        kind,
        planKey: "unknown",
        used: 0,
        limit: -1,
        resetAt: null,
        dailyUsed: 0,
        dailyLimit: -1,
        dailyResetAt: null,
        monthlyUsed: 0,
        monthlyLimit: -1,
        monthlyResetAt: null,
        exceededPeriod: null,
      };
    }
    const msg = (e as { message?: string })?.message || String(e);
    console.error(JSON.stringify({ event: "quota_fail_closed", severity: "critical", user_id: userId, kind, reason: "rpc_or_table_unavailable", error: msg, timestamp: new Date().toISOString(), policy: "fail-closed" }));
    return {
      allowed: false,
      kind,
      planKey: "unknown",
      used: 0,
      limit: -1,
      resetAt: null,
      reasonAr: "Quota service unavailable. Try again later.",
      dailyUsed: 0,
      dailyLimit: -1,
      dailyResetAt: null,
      monthlyUsed: 0,
      monthlyLimit: -1,
      monthlyResetAt: null,
      exceededPeriod: null,
    };
  }
}

export async function checkSubscriptionQuota(
  userId: string,
  kind: QuotaKind,
  isOwner = false,
  requestId?: string
): Promise<QuotaCheckResult> {
  return checkSubscriptionQuotas(userId, kind, isOwner, requestId);
}
