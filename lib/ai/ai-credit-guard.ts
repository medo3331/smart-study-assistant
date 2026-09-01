/**
 * Phase H + Phase B + Phase C — AI Credit Guard (shared helper)
 *
 * القاعدة الذهبية: Client requests an action. Server decides whether it is allowed and what it costs.
 * — Entitlement check BEFORE reserve (403 does not consume credit)
 * — Rate limits BEFORE reserve (429 does not consume credit)
 * — Reserve is server-generated requestId, NOT client-provided
 * — 1 request = 1 credit; failure/refund is idempotent
 *
 * Phase A: 10 text/3h, 6 vision/5h
 * Phase B: per-model (super 5/24h, ultra 3/24h) + per-agent (quiz 8/3h etc) — abstraction آمنة
 * Phase C: Guest 5/24h via anonymous userId
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getModelAccessPolicy } from "./model-access";
import {
  checkAiRateLimit,
  buildRateLimitBody,
  checkModelRateLimit,
  buildModelRateLimitBody,
  checkAgentRateLimit,
  buildAgentRateLimitBody,
  checkGuestRateLimit,
  buildGuestRateLimitBody,
  isKnownAgentLimit,
} from "./rate-limit";

export type GuardResult =
  | { ok: true; refId: string }
  | { ok: false; response: Response };

function serverRequestId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof (crypto as unknown as { randomUUID?: () => string }).randomUUID === "function") {
      return (crypto as unknown as { randomUUID: () => string }).randomUUID!();
    }
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Guard: entitlement (403 before reserve) + all rate limits (429 before reserve) + reserve 1 credit (402 if insufficient)
 */
export async function guardAiAccessAndReserve(
  supabase: SupabaseClient,
  userId: string | null,
  modelId: string,
  opts?: { isVisionOrFile?: boolean; isAnonymous?: boolean; agentId?: string | null }
): Promise<GuardResult> {
  const policy = getModelAccessPolicy(modelId);
  const isAnonymous = Boolean(opts?.isAnonymous);

  // ---- Phase C: Guest Rate Limit (Anonymous 5/24h) ----
  if (isAnonymous && userId) {
    const guestRate = await checkGuestRateLimit(supabase, userId);
    if (!guestRate.allowed) {
      const body = buildGuestRateLimitBody(guestRate);
      return {
        ok: false,
        response: new Response(JSON.stringify(body), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": String(guestRate.retryAfter) },
        }),
      };
    }
  }

  // ---- Phase A: Per-User Rate Limit (BEFORE entitlement/credit) — 429 ----
  if (userId && !isAnonymous) {
    const rate = await checkAiRateLimit(supabase, userId, { isVisionOrFile: opts?.isVisionOrFile ?? false });
    if (!rate.allowed) {
      const body = buildRateLimitBody(rate);
      return {
        ok: false,
        response: new Response(JSON.stringify(body), {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(rate.retryAfter),
          },
        }),
      };
    }
  }

  // ---- Phase B: Per-Model Rate Limit (BEFORE reserve) — 429 ----
  if (userId && !isAnonymous) {
    const modelRate = await checkModelRateLimit(supabase, userId, modelId);
    if (!modelRate.allowed) {
      const body = buildModelRateLimitBody(modelRate);
      return {
        ok: false,
        response: new Response(JSON.stringify(body), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": String(modelRate.retryAfter) },
        }),
      };
    }
  }

  // ---- Phase B: Per-Agent Rate Limit (abstraction آمنة) ----
  const agentId = opts?.agentId ?? null;
  if (agentId && isKnownAgentLimit(agentId) && userId && !isAnonymous) {
    const agentRate = await checkAgentRateLimit(supabase, userId, agentId);
    if (!agentRate.allowed) {
      const body = buildAgentRateLimitBody(agentRate);
      return {
        ok: false,
        response: new Response(JSON.stringify(body), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": String(agentRate.retryAfter) },
        }),
      };
    }
  }

  // ---- Entitlement gate (BEFORE reserve) — 0 credit consumed on 403 ----
  if (policy.access === "entitlement" && policy.entitlement) {
    if (!userId) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({
            ok: false,
            error: "هذا النموذج يتطلب تسجيل دخول وصلاحية. اشترِها من المتجر.",
            code: "MODEL_ACCESS_REQUIRED",
            model: modelId,
            required: policy.entitlement,
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        ),
      };
    }
    // Anonymous cannot have entitlement — already blocked above, but double-check
    if (isAnonymous) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({
            ok: false,
            error: "هذا النموذج يتطلب حساب مسجل وصلاحية. سجّل حسابك أولاً.",
            code: "MODEL_ACCESS_REQUIRED",
            model: modelId,
            required: policy.entitlement,
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        ),
      };
    }
    const { data: has, error } = await supabase.rpc("has_entitlement", {
      p_user_id: userId,
      p_kind: policy.entitlement.kind,
      p_value: policy.entitlement.value,
    });
    if (error) {
      return {
        ok: false,
        response: new Response(JSON.stringify({ ok: false, error: "تعذر التحقق من الصلاحية.", code: "ENTITLEMENT_CHECK_FAILED" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      };
    }
    if (!has) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({
            ok: false,
            error: "هذا النموذج يتطلب صلاحية غير متوفرة لديك. اشترِها من المتجر.",
            code: "MODEL_ACCESS_REQUIRED",
            model: modelId,
            required: policy.entitlement,
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        ),
      };
    }
  }

  // ---- Anonymous with free model: reserve for tracking (Guest 5/24h) or no reserve ----
  if (!userId) {
    // No authenticated user at all (should not happen with Supabase anon enabled, but fallback)
    return { ok: true, refId: "" };
  }
  if (isAnonymous) {
    // Guest: track via ledger for Guest limit counting (best-effort)
    // Use same reserve but Guest limit already checked; failure here maps to GUEST_RATE_LIMIT
    const refId = `ai_req:${serverRequestId()}`;
    const reserveKind = opts?.isVisionOrFile ? "vision" : "text";
    let reserveErr: unknown = null;
    try {
      const res = await supabase.rpc("reserve_ai_credit", {
        p_user_id: userId,
        p_ref_id: refId,
        p_kind: reserveKind,
      } as unknown as { p_user_id: string; p_ref_id: string });
      reserveErr = (res as { error?: unknown }).error ?? null;
      const msg0 = (reserveErr as { message?: string })?.message || "";
      if (msg0.includes("p_kind") || (msg0.includes("function") && msg0.includes("reserve_ai_credit"))) {
        const retry = await supabase.rpc("reserve_ai_credit", {
          p_user_id: userId,
          p_ref_id: refId,
        });
        reserveErr = (retry as { error?: unknown }).error ?? null;
      }
    } catch (e) {
      reserveErr = e;
    }
    if (reserveErr) {
      const msg = (reserveErr as { message?: string })?.message || "";
      if (msg.includes("insufficient credits") || msg.includes("Insufficient")) {
        return {
          ok: false,
          response: new Response(
            JSON.stringify({
              ok: false,
              error: "وصلت للحد الأقصى للتجربة المجانية كزائر (5 طلبات كل 24 ساعة). سجّل حساب مجاني للحصول على حد أكبر!",
              code: "GUEST_RATE_LIMIT",
              retryAfterHours: 24,
              retryAfter: 24 * 3600,
              limit: 5,
            }),
            { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(24 * 3600) } }
          ),
        };
      }
      return {
        ok: false,
        response: new Response(JSON.stringify({ ok: false, error: "تعذر حجز الطلب. حاول مرة أخرى.", code: "RESERVE_FAILED" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      };
    }
    return { ok: true, refId };
  }

  // ---- Reserve 1 credit atomically for authenticated user ----
  const refId = `ai_req:${serverRequestId()}`;
  const reserveKind = opts?.isVisionOrFile ? "vision" : "text";
  let reserveErr: unknown = null;
  const agentForMeta = agentId ?? null;
  try {
    // Attempt Phase B extended RPC (p_model, p_agent) — requires migration
    const resExt = await supabase.rpc("reserve_ai_credit", {
      p_user_id: userId,
      p_ref_id: refId,
      p_kind: reserveKind,
      p_model: modelId,
      p_agent: agentForMeta,
    } as unknown as { p_user_id: string; p_ref_id: string });
    reserveErr = (resExt as { error?: unknown }).error ?? null;
    const msgExt = (reserveErr as { message?: string })?.message || "";
    const needsFallback = msgExt.includes("p_model") || msgExt.includes("p_agent") || (msgExt.includes("function") && msgExt.includes("reserve_ai_credit"));
    if (needsFallback) {
      const res = await supabase.rpc("reserve_ai_credit", {
        p_user_id: userId,
        p_ref_id: refId,
        p_kind: reserveKind,
      } as unknown as { p_user_id: string; p_ref_id: string });
      reserveErr = (res as { error?: unknown }).error ?? null;
      const msg0 = (reserveErr as { message?: string })?.message || "";
      if (msg0.includes("p_kind") || (msg0.includes("function") && msg0.includes("reserve_ai_credit"))) {
        const retry = await supabase.rpc("reserve_ai_credit", {
          p_user_id: userId,
          p_ref_id: refId,
        });
        reserveErr = (retry as { error?: unknown }).error ?? null;
      }
    }
    if (!reserveErr) {
      try {
        if (agentForMeta || modelId) {
          await supabase.rpc("update_ai_ledger_metadata" as unknown as string, {
            p_user_id: userId,
            p_ref_id: refId,
            p_model: modelId,
            p_agent: agentForMeta,
          } as unknown as Record<string, unknown>);
        }
      } catch {
        // ignore — best-effort
      }
    }
  } catch (e) {
    reserveErr = e;
  }
  if (reserveErr) {
    const msg = (reserveErr as { message?: string })?.message || "";
    if (msg.includes("insufficient credits") || msg.includes("Insufficient")) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({ ok: false, error: "رصيد AI Credits لا يكفي. اشترِ حزمة من المتجر.", code: "INSUFFICIENT_CREDITS" }),
          { status: 402, headers: { "Content-Type": "application/json" } }
        ),
      };
    }
    return {
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "تعذر حجز AI Credit. حاول مرة أخرى.", code: "RESERVE_FAILED" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  return { ok: true, refId };
}

export async function refundAiCreditIfNeeded(supabase: SupabaseClient, userId: string | null, refId: string) {
  if (!userId || !refId) return;
  try {
    await supabase.rpc("refund_ai_credit", { p_user_id: userId, p_ref_id: refId });
  } catch (e) {
    console.error("[credit-guard] refund failed", e);
  }
}
