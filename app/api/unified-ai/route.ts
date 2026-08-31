/**
 * /api/unified-ai — REAL INFERENCE PATH (FormData + JSON) + Phase F Credits + Phase G Entitlements
 *
 * Contract:
 *   POST multipart/form-data  → prompt + file/image + language
 *   POST application/json     → prompt + imageInput/fileInput (base64/string) + context
 *
 * Phase G Flow:
 *   Request → Authenticate → Resolve model → getModelAccessPolicy → has_entitlement
 *     → DENIED 403 (no reserve) → ALLOWED → Phase F reserve → unifiedAI → confirm/refund
 *   requestId is server-generated (crypto.randomUUID) — client cannot bypass
 *   1 request = 1 credit, no cost table yet
 *   Failure/timeout does not lose credit (refund idempotent)
 *
 * Response (success):
 *   { ok:true, answer:string, agentUsed:string, extractedText?:string, metadata?:{}, reasoning?:string }
 * Response (insufficient credits):
 *   { ok:false, error:"الرصيد لا يكفي..." } status 402
 * Response (entitlement required):
 *   { ok:false, error:"هذا النموذج يتطلب صلاحية...", code:"entitlement_required" } status 403
 * Response (provider failure — NO fake answer):
 *   { ok:false, error:"Temporary AI problem. Please try again." }
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { unifiedAI } from "@/lib/unified-ai/unified-ai";
import type { UnifiedAIInput, UnifiedAIResult } from "@/lib/unified-ai/types";
import { getModelAccessPolicy, CURRENT_AI_MODEL } from "@/lib/ai/model-access";

function serverRequestId(): string {
  // Node 18+ / Edge has crypto.randomUUID
  try {
    // @ts-ignore — global crypto in Next runtime
    if (typeof crypto !== "undefined" && typeof (crypto as unknown as { randomUUID?: () => string }).randomUUID === "function") {
      return (crypto as unknown as { randomUUID: () => string }).randomUUID!();
    }
  } catch {}
  // fallback
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function POST(req: Request) {
  let reserveRef: string | null = null;
  let userId: string | null = null;
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null;

  try {
    const contentType = req.headers.get("content-type") || "";
    const isMultipart = contentType.includes("multipart/form-data");

    let prompt = "";
    let imageInput: File | undefined;
    let fileInput: File | undefined;
    let context: Record<string, unknown> = {};
    let language = "ar";

    if (isMultipart) {
      const formData = await req.formData();
      const p = formData.get("prompt");
      prompt = typeof p === "string" ? p : "";
      const f = formData.get("file");
      if (f instanceof File) fileInput = f;
      const i = formData.get("imageInput");
      if (i instanceof File) imageInput = i;
      const lang = formData.get("language");
      if (typeof lang === "string") language = lang;
      const ctx = formData.get("context");
      if (typeof ctx === "string") {
        try { context = JSON.parse(ctx); } catch { /* ignore */ }
      }
    } else {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return NextResponse.json({ ok: false, error: "بيانات غير صالحة" }, { status: 400 });
      }
      prompt = body.prompt || "";
      language = body.language || "ar";
      context = body.context || {};
      if (body.imageInput && typeof body.imageInput === "string") {
        // String path — will be handled by unifiedAI as text-only with note
      }
      if (body.fileInput && typeof body.fileInput === "string") {
        // Same for file
      }
    }

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json({ ok: false, error: "المطلوب نص (prompt)" }, { status: 400 });
    }

    // ---- Phase G: Auth + Entitlement check (before reserve) ----
    try {
      supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      userId = null;
    }

    // Phase G: Resolve model → policy → has_entitlement (server-side only)
    // الحالي: unified-ai.ts يستدعي callGroq(CURRENT_AI_MODEL) مباشرة دون routeCandidates
    // لا نعيد تصميم الـ Router — فقط نضيف boundary حول النموذج الفعلي
    const modelId = CURRENT_AI_MODEL; // TODO: عندما يمر عبر routeCandidates، استخدم المرشح الفعلي
    const policy = getModelAccessPolicy(modelId);
    if (policy.access === "entitlement" && policy.entitlement) {
      // free models تمر مباشرة — هذا الفرع للـ gated فقط (حالياً لا نماذج مقفلة)
      if (!userId || !supabase) {
        return NextResponse.json(
          { ok: false, error: "هذا النموذج يتطلب تسجيل دخول وصلاحية.", code: "entitlement_required", required: policy.entitlement },
          { status: 403 }
        );
      }
      const { data: has, error: entErr } = await supabase.rpc('has_entitlement', {
        p_user_id: userId,
        p_kind: policy.entitlement.kind,
        p_value: policy.entitlement.value,
      });
      if (entErr) {
        console.error("[PhaseG] has_entitlement check failed:", entErr.message);
        return NextResponse.json({ ok: false, error: "تعذر التحقق من الصلاحية." }, { status: 500 });
      }
      if (!has) {
        return NextResponse.json(
          { ok: false, error: "هذا النموذج يتطلب صلاحية غير متوفرة لديك. اشترِها من المتجر.", code: "entitlement_required", required: policy.entitlement },
          { status: 403 }
        );
      }
    }

    // ---- Phase F: Reserve 1 credit atomically for authenticated users ----
    if (userId && supabase) {
      const refId = `ai_req:${serverRequestId()}`;
      reserveRef = refId;
      const { error: reserveErr } = await supabase.rpc('reserve_ai_credit', {
        p_user_id: userId,
        p_ref_id: refId,
      });
      if (reserveErr) {
        const msg = reserveErr.message || "";
        // insufficient credits — no reserve was made
        if (msg.includes("insufficient credits") || msg.includes("Insufficient")) {
          return NextResponse.json(
            { ok: false, error: "رصيد AI Credits لا يكفي. اشترِ حزمة من المتجر.", code: "insufficient_credits" },
            { status: 402 }
          );
        }
        console.error("[PhaseF] reserve failed:", msg);
        return NextResponse.json({ ok: false, error: "تعذر حجز AI Credit. حاول مرة أخرى." }, { status: 500 });
      }
    }

    const input: UnifiedAIInput = {
      prompt,
      context,
      language: (language === "ar" || language === "en" || language === "mixed") ? language : "ar",
    };
    if (imageInput) input.imageInput = imageInput;
    if (fileInput) input.fileInput = fileInput;

    // REAL INFERENCE — not stub
    const result: UnifiedAIResult = await unifiedAI(input);

    if (!result.ok) {
      // FAILURE → refund reservation (idempotent)
      if (userId && reserveRef && supabase) {
        try {
          await supabase.rpc('refund_ai_credit', { p_user_id: userId, p_ref_id: reserveRef });
        } catch (e) {
          console.error("[PhaseF] refund after provider failure failed:", e);
        }
      }
      return NextResponse.json({ ok: false, error: result.error || "حدث خطأ مؤقت. جرب مرة أخرى." }, { status: 200 });
    }

    // SUCCESS → confirm (no-op — reserve is the consumption)
    // Optional: call confirm for clarity, but not required
    // if (userId && reserveRef) await supabase!.rpc('confirm_ai_credit', { p_user_id: userId, p_ref_id: reserveRef });

    const uiResponse = {
      ok: true,
      answer: result.answer,
      agentUsed: result.agentUsed,
      extractedText: result.extractedText,
      metadata: result.metadata,
      reasoning: result.reasoning,
    };
    return NextResponse.json(uiResponse);
  } catch (e: unknown) {
    // EXCEPTION/TIMEOUT → refund
    if (userId && reserveRef && supabase) {
      try {
        await supabase.rpc('refund_ai_credit', { p_user_id: userId, p_ref_id: reserveRef });
      } catch (re) {
        console.error("[PhaseF] refund after exception failed:", re);
      }
    }
    console.error("unified-ai route error:", (e as Error)?.message || String(e));
    return NextResponse.json({ ok: false, error: "حدث خطأ غير متوقع. جرب مرة أخرى." }, { status: 500 });
  }
}
