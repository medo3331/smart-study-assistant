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
  modelId: string
): Promise<GuardResult> {
  const policy = getModelAccessPolicy(modelId);

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
  const refId = `ai_req:${serverRequestId()}`;
  const { error: reserveErr } = await supabase.rpc("reserve_ai_credit", {
    p_user_id: userId,
    p_ref_id: refId,
  });
  if (reserveErr) {
    const msg = reserveErr.message || "";
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
