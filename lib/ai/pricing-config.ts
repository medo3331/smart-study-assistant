// ═══════════════════════════════════════════════════════════════════════
// MAGICLY — PHASE 3 CREDIT PRICING ENGINE
// Centralized pricing configuration, credit conversion model, and
// operation catalog.
//
// Source of truth for all AI credit pricing.
// No pricing values scattered across API routes.
// ═══════════════════════════════════════════════════════════════════════

import type { AiProviderName } from "./types";

// ─────────────────────────────────────────────────────────────────────
// A. PROVIDER COST CONFIGURATION
// ─────────────────────────────────────────────────────────────────────

/**
 * Provider cost rates — actual costs incurred by Magicly for each provider.
 *
 * ⚠️ **IMPORTANT** — These are CONFIGURATION VALUES, not fabricated estimates.
 * Each rate must be verified against the actual provider billing API before
 * go-live. If a rate is unknown, it MUST be marked `null` and the system
 * must handle missing usage metadata safely (no hard-coded fallbacks).
 *
 * Format: 1 unit = the billing unit the provider uses (typically 1M tokens
 * for text models, 1 second for audio/video/image).
 *
 * Provider costs are SEPARATE from user credit consumption. The credit
 * conversion model (below) converts provider cost → user credit cost.
 *
 * TODO: These values MUST be populated from actual provider billing
 * invoices/statments before production use. Currently all values are null.
 * The platform MUST NOT proceed to pricing until these are verified.
 */
export const PROVIDER_COST_RATES: Record<AiProviderName, Record<string, number | null>> = {
  groq: {
    // Token-based (1M tokens)
    input_tokens: null,
    output_tokens: null,
    // Audio models
    audio: null,
    // Image generation
    image: null,
  },
  nvidia: {
    input_tokens: null,
    output_tokens: null,
    audio: null,
    image: null,
  },
  openrouter: {
    input_tokens: null,
    output_tokens: null,
    audio: null,
    image: null,
    // OpenRouter-specific: per-model rates (not yet configured)
  },
  gemini: {
    input_tokens: null,
    output_tokens: null,
    audio: null,
    image: null,
  },
};

// ─────────────────────────────────────────────────────────────────────
// B. CREDIT CONVERSION MODEL
// ─────────────────────────────────────────────────────────────────────

/**
 * Credit conversion parameters — configurable, documented assumptions.
 *
 * The business owner MUST approve the actual values before production use.
 * These parameters convert provider cost → user credit cost.
 *
 * Design:
 *   creditCost = max(minCredit, roundUp(providerCost * conversionFactor * margin))
 *
 *   - providerCost: actual cost incurred by Magicly (in currency units)
 *   - conversionFactor: how many currency units per 1 Credit (configurable)
 *   - margin: protection factor so Magicly doesn't lose money
 *   - minCredit: minimum charge per operation (prevents fractional credits)
 *   - decimals: rounding precision
 *
 * NOTE: These values are mutable (not `as const`) so tests can configure
 * them temporarily. In production, the business owner sets these values
 * from approved billing invoices.
 */
export const CREDIT_CONVERSION = {
  /** Conversion factor: currency units per Credit. Must be approved by owner. */
  conversionFactor: null as number | null,

  /** Protection margin: 1 + margin. E.g., 0.20 = 20% above provider cost. */
  margin: null as number | null,

  /** Minimum credit charge per operation. */
  minCredit: null as number | null,

  /** Rounding decimals. */
  decimals: null as number | null,
};

// ─────────────────────────────────────────────────────────────────────
// C. CREDIT CONVERSION SERVICE (DETERMINISTIC, TESTABLE)
// ─────────────────────────────────────────────────────────────────────

export type CreditConversionError =
  | { code: "UNCONFIGURED"; message: string }
  | { code: "NEGATIVE"; message: string }
  | { code: "EXCEEDS_MAX"; message: string };

export interface CreditConversionResult {
  credits: number;
  providerCost: number;
  currencyCost: number;
  minChargeApplied: boolean;
  rounded: boolean;
}

/**
 * Convert provider cost to credits using the configurable conversion model.
 *
 * @param providerCost - actual cost incurred by Magicly
 * @param operationType - operation type (for minimum charge policies)
 * @returns conversion result
 */
export function convertProviderCostToCredits(
  providerCost: number,
  operationType?: string,
): CreditConversionResult {
  if (providerCost < 0) {
    return {
      credits: 0,
      providerCost: 0,
      currencyCost: 0,
      minChargeApplied: false,
      rounded: false,
    };
  }

  // Config must be approved before use
  if (CREDIT_CONVERSION.conversionFactor === null || CREDIT_CONVERSION.margin === null || CREDIT_CONVERSION.minCredit === null || CREDIT_CONVERSION.decimals === null) {
    throw new Error("Credit conversion not configured — business owner must approve CREDIT_CONVERSION values.");
  }

  const { conversionFactor, margin, minCredit, decimals } = CREDIT_CONVERSION;

  // currencyCost = providerCost × (1 + margin) — currency units
  // NOTE: The previous formula (providerCost × conversionFactor × (1 + margin))
  // mathematically canceled the conversionFactor (currencyCost / Factor = nothing).
  // This version keeps conversionFactor distinct from the currency output.
  const currencyCost = providerCost * (1 + margin);

  // Minimum provider currency cost (1 currency unit minimum)
  const minimumCurrencyCost = 1;
  const chargedCurrency = Math.max(currencyCost, minimumCurrencyCost);

  // Convert currency to Credits: credits = currencyCost / currencyUnitsPerCredit
  const rawCredits = chargedCurrency / conversionFactor;

  // Apply minimum credit charge (separate from minimum currency cost)
  const minimumCreditCharge = minCredit;
  const minApplicable = rawCredits < minimumCreditCharge;
  const finalCredits = minApplicable ? minimumCreditCharge : rawCredits;

  // Round to configured decimals
  const roundedCredits = Math.round(finalCredits * 10 ** decimals) / 10 ** decimals;

  return {
    credits: roundedCredits,
    providerCost,
    currencyCost: chargedCurrency,
    minChargeApplied: minApplicable,
    rounded: false,
  };
}

// ─────────────────────────────────────────────────────────────────────
// D. OPERATION CATALOG
// ─────────────────────────────────────────────────────────────────────

/**
 * Billing classification for operations.
 */
export type BillingClassification = "FREE" | "SUBSCRIPTION_INCLUDED" | "CREDIT_BILLED" | "NON_AI_OPERATION";

/**
 * Pricing strategy for an operation.
 */
export type PricingStrategy =
  | { type: "fixed"; credits: number }
  | { type: "perUnit"; unit: string; rate: number; usageField: string }
  | { type: "subscribed"; operation: string }
  | { type: "free" };

/**
 * A single operation in the pricing catalog.
 */
export interface PricingPolicy {
  /** Unique operation identifier */
  operationId: string;

  /** Billing classification */
  classification: BillingClassification;

  /** Pricing strategy */
  strategy: PricingStrategy;

  /** Description of usage inputs */
  usageInputs: string[];

  /** AI provider/model dependency */
  providerDependency: string | null;

  /** Cost calculation method (human-readable) */
  costCalculation: string;

  /** Fallback behavior */
  fallbackBehavior: "charge" | "noCharge" | "skip";

  /** Refund behavior */
  refundBehavior: "fullRefund" | "partialRefund" | "noRefund" | "idempotent";

  /** Whether usage metadata is mandatory or estimated */
  usageMetadata: "mandatory" | "optional" | "estimated";

  /** Maximum allowed cost/credits per operation */
  maxCost?: number;

  /** Whether subscription-included operations require the plan */
  requiresPlan?: boolean;

  /** Usage limits for subscription-included operations */
  usageLimits?: {
    daily?: number;
    monthly?: number;
  };
}

/**
 * Central operation catalog — all AI operations with billing classification.
 *
 * ⚠️ **محاذاة مع الإنتاج**: الأسعار الثابتة هنا تحاكي `lib/ai/credit-pricing.ts`
 * (CREDIT_COSTS) — مصدر التسعير المعتمد فعليًا في الإنتاج. استراتيجيات
 * `perUnit` (تسعير بالتوكن) لا تُفعّل قبل التحقق من PROVIDER_COST_RATES،
 * لأن الحساب فيها يتطلب أسعار مزوّدين مُوثّقة — لا تقديرات مُختلقة.
 */
export const OPERATION_CATALOG: PricingPolicy[] = [
  // ── Chat / Question AI ──────────────────────────────────────────
  // CREDIT_COSTS: chat = 1 (طلب واحد = كريدت واحد)
  {
    operationId: "ai_chat",
    classification: "CREDIT_BILLED",
    strategy: { type: "fixed", credits: 1 },
    usageInputs: ["tokens_used", "model_type"],
    providerDependency: null,
    costCalculation: "Fixed 1 credit per request (per-unit token metering deferred until provider rates verified)",
    fallbackBehavior: "charge",
    refundBehavior: "idempotent",
    usageMetadata: "mandatory",
  },
  // ── AI Explanation ─────────────────────────────────────────────
  // CREDIT_COSTS: explain = 1
  {
    operationId: "ai_explain",
    classification: "CREDIT_BILLED",
    strategy: { type: "fixed", credits: 1 },
    usageInputs: ["tokens_used", "model_type"],
    providerDependency: null,
    costCalculation: "Fixed 1 credit per request",
    fallbackBehavior: "charge",
    refundBehavior: "idempotent",
    usageMetadata: "mandatory",
  },
  // ── AI Tutor ───────────────────────────────────────────────────
  // CREDIT_COSTS: tutor = 1 (كان 2 هنا — تضارب مع الإنتاج)
  {
    operationId: "ai_tutor",
    classification: "CREDIT_BILLED",
    strategy: { type: "fixed", credits: 1 },
    usageInputs: ["model_type"],
    providerDependency: null,
    costCalculation: "Fixed 1 credit per tutor session",
    fallbackBehavior: "charge",
    refundBehavior: "idempotent",
    usageMetadata: "mandatory",
  },
  // ── Summarization ──────────────────────────────────────────────
  // CREDIT_COSTS: summarize = 1
  {
    operationId: "ai_summarize",
    classification: "CREDIT_BILLED",
    strategy: { type: "fixed", credits: 1 },
    usageInputs: ["input_tokens", "output_tokens"],
    providerDependency: null,
    costCalculation: "Fixed 1 credit per summarization request",
    fallbackBehavior: "charge",
    refundBehavior: "idempotent",
    usageMetadata: "mandatory",
  },
  // ── Lecture Analysis ───────────────────────────────────────────
  // CREDIT_COSTS: file-analysis = 2
  {
    operationId: "lecture_analysis",
    classification: "CREDIT_BILLED",
    strategy: { type: "fixed", credits: 2 },
    usageInputs: ["content_size_bytes", "model_type"],
    providerDependency: null,
    costCalculation: "Fixed 2 credits per lecture analysis",
    fallbackBehavior: "charge",
    refundBehavior: "idempotent",
    usageMetadata: "mandatory",
  },
  // ── MCQ Generation ─────────────────────────────────────────────
  // CREDIT_COSTS: quiz = 1 (كان 2 هنا — تضارب مع الإنتاج)
  {
    operationId: "ai_mcq",
    classification: "CREDIT_BILLED",
    strategy: { type: "fixed", credits: 1 },
    usageInputs: ["question_count", "analysis_level"],
    providerDependency: null,
    costCalculation: "Fixed 1 credit per MCQ batch",
    fallbackBehavior: "charge",
    refundBehavior: "idempotent",
    usageMetadata: "mandatory",
    maxCost: 5,
  },
  // ── Study-Plan Generation ──────────────────────────────────────
  // CREDIT_COSTS: generate-plan = 5
  {
    operationId: "study_plan",
    classification: "CREDIT_BILLED",
    strategy: { type: "fixed", credits: 5 },
    usageInputs: ["plan_size", "processing_level"],
    providerDependency: null,
    costCalculation: "Fixed 5 credits per study plan",
    fallbackBehavior: "charge",
    refundBehavior: "idempotent",
    usageMetadata: "mandatory",
  },
  // ── File Question Answering ────────────────────────────────────
  // CREDIT_COSTS: file-analysis = 2
  {
    operationId: "file_qa",
    classification: "CREDIT_BILLED",
    strategy: { type: "fixed", credits: 2 },
    usageInputs: ["content_size_bytes", "model_type"],
    providerDependency: null,
    costCalculation: "Fixed 2 credits per file analysis",
    fallbackBehavior: "charge",
    refundBehavior: "idempotent",
    usageMetadata: "mandatory",
  },
  // ── Lecture Question Answering ─────────────────────────────────
  // CREDIT_COSTS: unified-ai = 1 (سؤال محاضرة يمر عبر unified-ai)
  {
    operationId: "lecture_question",
    classification: "CREDIT_BILLED",
    strategy: { type: "fixed", credits: 1 },
    usageInputs: ["content_size_bytes", "model_type"],
    providerDependency: null,
    costCalculation: "Fixed 1 credit per lecture question (unified-ai rate)",
    fallbackBehavior: "charge",
    refundBehavior: "idempotent",
    usageMetadata: "mandatory",
  },
  // ── AI Agents ──────────────────────────────────────────────────
  // CREDIT_COSTS: agents-generate = 3
  {
    operationId: "ai_agent",
    classification: "CREDIT_BILLED",
    strategy: { type: "fixed", credits: 3 },
    usageInputs: ["agent_steps", "model_type"],
    providerDependency: null,
    costCalculation: "Fixed 3 credits per agent generation",
    fallbackBehavior: "charge",
    refundBehavior: "fullRefund",
    usageMetadata: "mandatory",
    maxCost: 20,
  },
  // ── Image Generation ───────────────────────────────────────────
  // CREDIT_COSTS: image-gen = 1 / sd = 3 / premium = 5
  {
    operationId: "image_generation",
    classification: "CREDIT_BILLED",
    strategy: { type: "fixed", credits: 1 },
    usageInputs: ["model_type", "image_tier"],
    providerDependency: null,
    costCalculation: "Fixed 1 credit (standard) — SD = 3, Premium = 5 per CREDIT_COSTS",
    fallbackBehavior: "charge",
    refundBehavior: "idempotent",
    usageMetadata: "mandatory",
  },
  // ── Audio Transcription ────────────────────────────────────────
  {
    operationId: "audio_transcription",
    classification: "CREDIT_BILLED",
    strategy: { type: "perUnit", unit: "minutes", rate: 0.5, usageField: "duration_minutes" },
    usageInputs: ["duration_minutes", "provider", "model"],
    providerDependency: null,
    costCalculation: "Duration (minutes) × rate — per-unit metering deferred until provider rates verified",
    fallbackBehavior: "charge",
    refundBehavior: "fullRefund",
    usageMetadata: "mandatory",
    maxCost: 50,
  },
  // ── Magic Assistant ────────────────────────────────────────────
  {
    operationId: "magic_assistant",
    classification: "SUBSCRIPTION_INCLUDED",
    strategy: { type: "subscribed", operation: "ai_chat" },
    usageInputs: ["usage_tracking"],
    providerDependency: null,
    costCalculation: "Tracked within subscription; no per-operation credit deduction",
    fallbackBehavior: "noCharge",
    refundBehavior: "noRefund",
    usageMetadata: "estimated",
    requiresPlan: true,
    usageLimits: { daily: 50, monthly: 500 },
  },
];

// ─────────────────────────────────────────────────────────────────────
// E. SUPERSET: OPERATION PRICING LOOKUP
// ─────────────────────────────────────────────────────────────────────

const catalogMap = new Map(OPERATION_CATALOG.map((p) => [p.operationId, p]));

export function getPricingPolicy(operationId: string): PricingPolicy | undefined {
  return catalogMap.get(operationId);
}

export function getOperationIdForFeature(feature: string): string | null {
  // Map feature names to operation IDs (for backward compatibility)
  const mapping: Record<string, string> = {
    chat: "ai_chat",
    explain: "ai_explain",
    tutor: "ai_tutor",
    summarize: "ai_summarize",
    lecture_analysis: "lecture_analysis",
    quiz: "ai_mcq",
    flashcards: "ai_mcq",
    "study_plan": "study_plan",
    file_analysis: "file_qa",
    "lesson_analysis": "lecture_analysis",
    "agent": "ai_agent",
    image_generation: "image_generation",
    image_gen: "image_generation",
    transcription: "audio_transcription",
    "magic_assistant": "magic_assistant",
  };

  // Case-insensitive lookup: normalize both keys and input
  const lowerFeature = feature.trim().toLowerCase();
  for (const [key, opId] of Object.entries(mapping)) {
    if (key.toLowerCase() === lowerFeature) {
      return opId;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// F. TRANSACTIONAL CREDIT RECHARGE (SAFE, NO DUPLICATE)
// ─────────────────────────────────────────────────────────────────────

/**
 * Reserved for Phase 4. This is a signature placeholder that ensures
 * the pricing layer is integrated before any credit recharge logic.
 * Implementation is out of scope for Phase 3.
 */
export async function reserveCredits(
  userId: string,
  credits: number,
  operationId: string,
  providerCost?: number,
): Promise<{ ok: boolean; error?: string }> {
  throw new Error("Reserved for Phase 4 — credit recharge logic not yet implemented.");
}
