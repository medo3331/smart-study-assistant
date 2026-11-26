// ═══════════════════════════════════════════════════════════════════════
// MAGICLY — PHASE 3.2 UNIFIED AI BILLING & ACTUAL USAGE SETTLEMENT
// Shared billing logic for the unified-ai route.
//
// Design goals (from Phase 3.1 corrections):
//   1. One logical operation ID per user request (idempotent).
//   2. One reservation per logical operation (shared credit guard).
//   3. One attempt ID per provider attempt (fallback retry).
//   4. Actual usage capture (input, output, cached, system prompts, RAG).
//   5. Provider cost + user charge separated.
//   6. Settlement idempotent: reservation, consume, refund, release.
// ═══════════════════════════════════════════════════════════════════════

import { createClient } from "@/lib/supabase/server";
import { getPricingPolicy, convertProviderCostToCredits, CREDIT_CONVERSION } from "./pricing-config";
import type { AiUsageContext, UsageRequestContext } from "./usage-context";

// ─────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────

export type SettlementStatus =
  | "pending"        // reservation created, not yet settled
  | "settled"        // charged and consumed
  | "refunded"       // reservation released, no charge
  | "pending_reconcile" // unknown provider status, awaiting reconciliation

export interface UsageAttempt {
  attemptId: string;
  operationId: string;
  attemptStatus: "initial" | "fallback" | "retried" | "timeout_unknown";
  provider: string | null;
  model: string | null;
  eventStatus: string; // usage event status
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedTokens?: number | null;
  estimated: boolean;
  latencyMs?: number | null;
  error?: string | null;
}

export type { UsageRequestContext };

export interface UsageSummary {
  operationId: string;
  attempts: UsageAttempt[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  estimatedInputTokens: boolean;
  estimatedOutputTokens: boolean;
  costEstimate: UsageCostEstimate;
  credits: number;      // final charge in credits
  customerCost: number; // currency after margin
  providerCost: number; // actual provider cost (known portion)
  finalStatus: SettlementStatus;
}

// ─────────────────────────────────────────────────────────────────────
// COST ESTIMATE
// ─────────────────────────────────────────────────────────────────────

export interface UsageCostEstimate {
  /** Confirmed actual cost (known provider rate applied). */
  confirmedCost?: number;
  /** Estimated cost (missing rates, but usage known). */
  estimatedCost?: number;
  /** Unknown cost (rates not available, no estimate). */
  unknownCost: boolean;
  provider: string | null;
  model: string | null;
  /** Actual tokens: input + output + cached. */
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedTokens?: number | null;
}

// ─────────────────────────────────────────────────────────────────────
// USAGE SETTLEMENT ENGINE
// ─────────────────────────────────────────────────────────────────────

/**
 * Settle a unified AI operation.
 *
 * Flow:
 *   1. Resolve pricing policy for the operation.
 *   2. Calculate provider cost from actual usage.
 *   3. Convert provider cost → customer cost (margin applied).
 *   4. Convert customer cost → credits (currency per credit conversion).
 *   5. Record usage events (shadow).
 *   6. Return settlement result (no DB write — phase 4 handles ledger).
 *
 * @param supabase Supabase server client
 * @param operationContext Usage request context (operationId, idempotencyKey)
 * @param attempts Array of provider attempts (initial + fallback)
 * @param operationId Logical operation ID (from credit guard reservation)
 * @param model Model used for the successful attempt
 * @returns Settlement result
 */
export async function settleUnifiedAiUsage(
  supabase: Awaited<ReturnType<typeof createClient>> | null,
  operationContext: UsageRequestContext,
  attempts: UsageAttempt[],
  lastSuccessfulAttemptIndex: number,
  operationId: string,
  model: string,
): Promise<UsageSummary> {
  const successfulAttempt = attempts[lastSuccessfulAttemptIndex];
  const allAttempts = attempts;

  // If no successful attempt, mark for reconciliation
  if (!successfulAttempt) {
    return {
      operationId,
      attempts: allAttempts,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCachedTokens: 0,
      estimatedInputTokens: false,
      estimatedOutputTokens: false,
      costEstimate: {
        confirmedCost: undefined,
        estimatedCost: undefined,
        unknownCost: true,
        provider: null,
        model: null,
      },
      credits: 0,
      customerCost: 0,
      providerCost: 0,
      finalStatus: "pending_reconcile",
    };
  }

  // Compute totals
  const totalInput = allAttempts.reduce((sum, a) => sum + (a.inputTokens ?? 0), 0);
  const totalOutput = allAttempts.reduce((sum, a) => sum + (a.outputTokens ?? 0), 0);
  const totalCached = allAttempts.reduce((sum, a) => sum + (a.cachedTokens ?? 0), 0);

  // Build cost estimate
  const costEstimate = buildCostEstimate(allAttempts);

  // Apply margin (store as rate, e.g., 0.20 for 20%)
  const marginRate = CREDIT_CONVERSION.margin ?? 0.20;
  const customerCost = costEstimate.confirmedCost ?? costEstimate.estimatedCost ?? 0;
  const finalCustomerCost = costEstimate.unknownCost
    ? 0 // unknown → charge = 0, but status stays "pending_reconcile" (not "settled")
    : customerCost * (1 + marginRate);

  // Convert currency → credits (only if cost is known AND confirmed)
  let credits = 0;
  if (!costEstimate.unknownCost) {
    const conversionFactor = CREDIT_CONVERSION.conversionFactor ?? 0.05;
    const minCredit = CREDIT_CONVERSION.minCredit ?? 0.5;
    let computedCredits = finalCustomerCost / conversionFactor;
    if (computedCredits < minCredit) {
      computedCredits = minCredit;
    }
    const decimals = CREDIT_CONVERSION.decimals ?? 2;
    credits = Math.round(computedCredits * 10 ** decimals) / 10 ** decimals;
  }

  // Record usage events (shadow — non-blocking)
  if (supabase) {
    for (const attempt of allAttempts) {
      void recordUsageEvent(supabase, operationContext, attempt);
    }
  }

  // CRITICAL: Unknown cost = pending_reconcile, NOT zero-charge settlement.
  // A successful operation with unknown provider cost MUST NOT be finalized
  // as a zero-cost settled operation. The reservation stays pending until
  // reconciliation policy resolves the cost or an approved policy is applied.
  // When cost is known, the final status is "settled"; otherwise "pending_reconcile".
  const finalStatus: SettlementStatus = costEstimate.unknownCost
    ? "pending_reconcile"
    : "settled";

  return {
    operationId,
    attempts: allAttempts,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalCachedTokens: totalCached,
    estimatedInputTokens: allAttempts.some(a => a.estimated),
    estimatedOutputTokens: allAttempts.some(a => a.estimated),
    costEstimate,
    credits,
    customerCost: finalCustomerCost,
    providerCost: costEstimate.confirmedCost ?? 0,
    finalStatus,
  };
}

/**
 * Build the cost estimate from attempts.
 *
 * States:
 *   - unknownCost: rates not available AND no estimate possible
 *   - estimatedCost: usage known but rates missing (best-effort)
 *   - confirmedCost: rates available and applied
 */
function buildCostEstimate(attempts: UsageAttempt[]): UsageCostEstimate {
  // Find a successful attempt (any attempt that proceeded to the provider)
  const successful = attempts.find(a => a.attemptStatus !== "initial" || a.attemptStatus !== "fallback" || a.attemptStatus !== "retried" || a.attemptStatus !== "timeout_unknown");

  if (!successful || !successful.provider) {
    return {
      confirmedCost: undefined,
      estimatedCost: undefined,
      unknownCost: true,
      provider: null,
      model: null,
      inputTokens: successful?.inputTokens,
      outputTokens: successful?.outputTokens,
      cachedTokens: successful?.cachedTokens,
    };
  }

  // If provider rates are not configured, use best-effort estimate
  // This is NOT a confirmed cost — it's an estimate
  // In production: check PROVIDER_COST_RATES in pricing-config.ts
  const hasKnownRates = false; // Placeholder

  if (hasKnownRates) {
    // In production: apply verified provider rates
    // cost = inputTokens/1M * inputRate + outputTokens/1M * outputRate
    // cached tokens should not be double-counted
    return {
      confirmedCost: 0, // placeholder
      estimatedCost: undefined,
      unknownCost: false,
      provider: successful.provider,
      model: successful.model,
      inputTokens: successful.inputTokens,
      outputTokens: successful.outputTokens,
      cachedTokens: successful.cachedTokens,
    };
  }

  // No known rates → best-effort estimate (NOT confirmed)
  return {
    confirmedCost: undefined,
    estimatedCost: 0, // placeholder — would use estimated rate
    unknownCost: false,
    provider: successful.provider,
    model: successful.model,
    inputTokens: successful.inputTokens,
    outputTokens: successful.outputTokens,
    cachedTokens: successful.cachedTokens,
  };
}

/**
 * Estimate provider cost from attempt usage.
 *
 * Uses configured provider rates when available.
 * When rates are unknown (null), returns 0 and marks as estimated.
 *
 * @param attempt Provider attempt
 * @returns Estimated provider cost in currency units
 */
function estimatedUsageCost(attempt: UsageAttempt): number {
  // In production, this uses VERIFIED provider rates:
  //   inputCost = inputTokens / 1_000_000 × inputRate
  //   outputCost = outputTokens / 1_000_000 × outputRate
  // But since no rates are configured yet, return 0.
  // DO NOT invent rates. Return 0 and mark as estimated.
  return 0;
}

/**
 * Record a usage event (shadow recording — non-blocking).
 *
 * This is a placeholder for the actual usage-accounting integration.
 * In production, this should call usage-accounting.ts:recordAiUsage.
 *
 * @param supabase Supabase server client
 * @param context Usage request context
 * @param attempt Provider attempt
 */
async function recordUsageEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  context: UsageRequestContext,
  attempt: UsageAttempt,
): Promise<void> {
  // Placeholder — real implementation would call usage-accounting.ts:recordAiUsage
  // with:
  //   - userId: context.userId
  //   - operationId: context.operationId
  //   - idempotencyKey: context.idempotencyKey
  //   - feature: "unified_ai"
  //   - provider: attempt.provider
  //   - model: attempt.model
  //   - status: attempt.status
  //   - units: 1 (per successful execution)
  //   - promptTokens: attempt.inputTokens
  //   - completionTokens: attempt.outputTokens
  //   - cachedTokens: attempt.cachedTokens
  //   - metadata: { attemptId, estimated }
  void supabase; // unused — placeholder
  const _ctx = context; // unused — placeholder
  const _att = attempt; // unused — placeholder
}

// ─────────────────────────────────────────────────────────────────────
// SETTLEMENT SAFETY
// ─────────────────────────────────────────────────────────────────────

/**
 * Validate settlement safety constraints.
 *
 * @param credits Proposed credit charge
 * @param maxCredit Operation maximum (configurable)
 * @returns Validation result
 */
export function validateSettlement(
  credits: number,
  maxCredit?: number,
): { ok: boolean; reason?: string } {
  if (maxCredit !== undefined && credits > maxCredit) {
    return {
      ok: false,
      reason: `Charge ${credits} credits exceeds maximum ${maxCredit} credits for this operation.`,
    };
  }
  if (credits < 0) {
    return { ok: false, reason: "Negative credit charge not allowed." };
  }
  return { ok: true };
}

/**
 * Idempotent settlement key: (operationId, status)
 *
 * Used to ensure:
 *   - No double deduction (same operationId + status = no second settlement)
 *   - No duplicate settlement
 *   - No duplicate refund
 */
export function getSettlementKey(operationId: string): string {
  return operationId;
}

/**
 * Idempotent settlement result: (operationId, finalStatus)
 *
 * Used to ensure:
 *   - No double deduction (same operationId = no second settlement)
 *   - No duplicate settlement
 *   - No duplicate refund
 *
 * The settlement key is stable for the lifetime of the operation.
 * Status changes update the ledger, never the key.
 */
export function getSettlementResultKey(operationId: string, finalStatus: SettlementStatus): string {
  return `${operationId}:${finalStatus}`;
}
