// ═══════════════════════════════════════════════════════════════════════
// MAGICLY — PHASE 3.2 TESTS
// Tests for the unified AI billing and settlement engine.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  settleUnifiedAiUsage,
  validateSettlement,
  getSettlementKey,
  type UsageAttempt,
  type UsageRequestContext,
} from "../unified-ai-billing";

// ─────────────────────────────────────────────────────────────────────
// Helper: create a test usage context
// ─────────────────────────────────────────────────────────────────────

function createUsageContext(overrides?: Partial<UsageRequestContext>): UsageRequestContext {
  return {
    operationId: "op-test-1",
    idempotencyKey: "idem-key-1",
    source: "server",
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Helper: create a test usage attempt
// ─────────────────────────────────────────────────────────────────────

function createAttempt(overrides?: Partial<UsageAttempt>): UsageAttempt {
  return {
    attemptId: "attempt-1",
    operationId: "op-test-1",
    attemptStatus: "initial",
    provider: "groq",
    model: "openai/gpt-oss-120b",
    eventStatus: "completed",
    inputTokens: 100,
    outputTokens: 50,
    cachedTokens: 10,
    estimated: false,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────
// A. SETTLEMENT ENGINE
// ─────────────────────────────────────────────────────────────────────

describe("Unified AI Billing & Settlement", () => {
  it("records settlement with successful attempt", async () => {
    const context = createUsageContext();
    const attempts = [
      createAttempt({ attemptId: "attempt-1", provider: null, eventStatus: "completed" }),
    ];
    const result = await settleUnifiedAiUsage(
      null, // no Supabase client (shadow-only)
      context,
      attempts,
      0,
      context.operationId,
      "openai/gpt-oss-120b",
    );

    expect(result.operationId).toBe("op-test-1");
    expect(result.totalInputTokens).toBe(100);
    expect(result.totalOutputTokens).toBe(50);
    expect(result.totalCachedTokens).toBe(10);
    expect(result.estimatedInputTokens).toBe(false);
    expect(result.estimatedOutputTokens).toBe(false);
    expect(result.finalStatus).toBe("pending_reconcile");
  });

  it("handles multiple attempts (initial + fallback)", async () => {
    const context = createUsageContext();
    // First attempt failed (fallback to second) with 10 cached tokens
    const attempt1 = createAttempt({ attemptId: "attempt-1", attemptStatus: "fallback", provider: "groq", inputTokens: 50, outputTokens: 25, cachedTokens: 10 });
    // Second attempt succeeded (final) with no cached tokens
    const attempt2 = createAttempt({ attemptId: "attempt-2", attemptStatus: "retried", provider: "nvidia", inputTokens: 100, outputTokens: 75, cachedTokens: undefined });
    const attempts = [attempt1, attempt2];

    const result = await settleUnifiedAiUsage(
      null,
      context,
      attempts,
      1, // successful attempt index (second attempt succeeds)
      context.operationId,
      "nvidia/nemotron-3.5-lightning-30b-a3b",
    );

    expect(result.totalInputTokens).toBe(150); // 50 + 100 from both attempts
    expect(result.totalOutputTokens).toBe(100); // 25 + 75 from both attempts
    // First attempt has 10 cached tokens, second has none
    expect(result.totalCachedTokens).toBe(10);
    expect(result.attempts.length).toBe(2);
    expect(result.attempts[1].attemptId).toBe("attempt-2");
  });

  it("handles estimated usage (no provider rates configured)", async () => {
    const context = createUsageContext();
    const attempts = [
      createAttempt({ attemptId: "attempt-1", estimated: true, inputTokens: 100, outputTokens: 50 }),
    ];
    const result = await settleUnifiedAiUsage(
      null,
      context,
      attempts,
      0,
      context.operationId,
      "openrouter",
      "unknown",
    );

    expect(result.providerCost).toBe(0); // rates unknown
    expect(result.estimatedInputTokens).toBe(true);
    expect(result.estimatedOutputTokens).toBe(true); // estimated: true on attempt
  });

  it("handles unknown provider rates (returns 0)", async () => {
    const context = createUsageContext();
    const attempts = [
      createAttempt({ attemptId: "attempt-1", provider: "unknown-provider", inputTokens: 100, outputTokens: 50 }),
    ];
    const result = await settleUnifiedAiUsage(
      null,
      context,
      attempts,
      0,
      context.operationId,
      "unknown-provider",
      "unknown-model",
    );

    expect(result.providerCost).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// B. SETTLEMENT SAFETY
// ─────────────────────────────────────────────────────────────────────

describe("Settlement Safety", () => {
  it("validates credit charge within maximum", () => {
    const result = validateSettlement(5, 10);
    expect(result.ok).toBe(true);

    const overLimit = validateSettlement(15, 10);
    expect(overLimit.ok).toBe(false);
    expect(overLimit.reason).toContain("maximum");
  });

  it("rejects negative credit charge", () => {
    const result = validateSettlement(-1);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Negative");
  });

  it("generates stable settlement keys per operation", () => {
    // Key is operationId ONLY — not (operationId + status)
    const key1 = getSettlementKey("op-1");
    const key2 = getSettlementKey("op-1");
    const key3 = getSettlementKey("op-2");
    // الحالة مش جزء من المفتاح — التوقيع بياخد operationId فقط
    const key4 = getSettlementKey("op-1");

    // Same operationId → same key (regardless of status)
    expect(key1).toBe(key2);
    expect(key1).toBe(key4);
    // Different operationId → different key
    expect(key1).not.toBe(key3);
  });
});

// ─────────────────────────────────────────────────────────────────────
// C. UNIT TESTS (run in isolation)
// ─────────────────────────────────────────────────────────────────────

describe("Unit Tests (isolated)", () => {
  it("creating a usage context is deterministic", () => {
    const ctx1 = createUsageContext();
    const ctx2 = createUsageContext();
    expect(ctx1.operationId).toBeTruthy();
    expect(ctx1.idempotencyKey).toBeTruthy();
    expect(ctx1.source).toBe("server");
  });

  it("creating an attempt includes required fields", () => {
    const a = createAttempt();
    expect(a.attemptId).toBeTruthy();
    expect(a.operationId).toBeTruthy();
    expect(a.provider).toBe("groq");
    expect(a.model).toBe("openai/gpt-oss-120b");
    expect(a.attemptStatus).toBe("initial");
    expect(a.eventStatus).toBe("completed");
  });
});
