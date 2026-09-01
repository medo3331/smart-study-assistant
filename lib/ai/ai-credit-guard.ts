/**
 * Phase H — AI Credit Guard (shared helper for all AI routes)
 *
 * القاعدة الذهبية: Client requests an action. Server decides whether it is allowed and what it costs.
 * — Entitlement check BEFORE reserve (403 does not consume credit)
 * — Reserve is server-generated requestId, NOT client-provided
 * — 1 request = 1 credit; failure/refund is idempotent; no negative balance; race-safe via DB lock
 *
 * يستخدم في: /api/unified-ai (fully), /api/ai, /api/agents/generate (AiRouter), وأي مسار AI مستقبلي
 * لا يُستخدم لـ Store/coins — تلك عبر purchase_item مباشرة.
 *
 * Anonymous: يمر فقط للـ free models بدون حجز؛ المغلق يرجع 403 قبل الحجز.
 * Authenticated: يحجز -1 ثم يستهلك عند النجاح أو يسترجع +1 عند الفشل.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getModelAccessPolicy } from "./model-access";
import { checkAiRateLimit, buildRateLimitBody } from "./rate-limit";

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
 * Guard: entitlement (403 before reserve) + reserve 1 credit (402 if insufficient)
 * Returns refId on success for caller to refund on failure, or Response to return immediately.
 */
export async function guardAiAccessAndReserve(
  supabase: SupabaseClient,
  userId: string | null,
  modelId: string,
  opts?: { isVisionOrFile?: boolean }
): Promise<GuardResult> {
  const policy = getModelAccessPolicy(modelId);

  // ---- Rate Limit gate (BEFORE entitlement/credit) — 429, 0 credit consumed ----
  // Free: 10 text / 3h, 6 vision / 5h — windowed sliding
  // Premium: unlimited (bypass)
  if (userId) {
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

  // ---- Anonymous with free model: no reserve needed ----
  if (!userId) {
    // No credit to reserve — anon free for free models only (gated already blocked above)
    return { ok: true, refId: "" };
  }

  // ---- Reserve 1 credit atomically (server requestId) ----
  // Free models: allowed via overdraft up to window limit even if balance 0
  // Gated models: same, but additionally require entitlement (checked above)
  // isVisionOrFile determines vision bucket (6/5h) vs text (10/3h)
  // Store kind in metadata for windowed counting
  const refId = `ai_req:${serverRequestId()}`;
  const reserveKind = opts?.isVisionOrFile ? "vision" : "text";
  // Try new signature with p_kind, fallback to old 2-arg if function not yet migrated
  let reserveErr: unknown = null;
  try {
    const res = await supabase.rpc("reserve_ai_credit", {
      p_user_id: userId,
      p_ref_id: refId,
      p_kind: reserveKind,
    } as unknown as { p_user_id: string; p_ref_id: string });
    reserveErr = (res as { error?: unknown }).error ?? null;
    // If error is "function not found" or missing p_kind, retry without p_kind
    const msg0 = (reserveErr as { message?: string })?.message || "";
    if (msg0.includes("p_kind") || msg0.includes("function") && msg0.includes("reserve_ai_credit")) {
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
