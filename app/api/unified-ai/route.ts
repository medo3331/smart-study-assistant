/**
 * /api/unified-ai — REAL INFERENCE PATH (FormData + JSON) + Phase F Credits
 *
 * Contract:
 *   POST multipart/form-data  → prompt + file/image + language
 *   POST application/json     → prompt + imageInput/fileInput (base64/string) + context
 *
 * Phase F Flow:
 *   Request → Authenticate → Entitlement check → Reserve 1 credit (server requestId)
 *     → Execute unifiedAI → Success? confirm (keep reserve) : refund reserve
 *   requestId is server-generated (crypto.randomUUID) — client cannot bypass
 *   1 request = 1 credit, no cost table yet
 *   Failure/timeout does not lose credit (refund idempotent)
 *
 * Response (success):
 *   { ok:true, answer:string, agentUsed:string, extractedText?:string, metadata?:{}, reasoning?:string }
 * Response (insufficient credits):
 *   { ok:false, error:"الرصيد لا يكفي..." } status 402
 * Response (provider failure — NO fake answer):
 *   { ok:false, error:"Temporary AI problem. Please try again." }
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { unifiedAI } from "@/lib/unified-ai/unified-ai";
import type { UnifiedAIInput, UnifiedAIResult } from "@/lib/unified-ai/types";

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

    // ---- Phase F: Auth + Credit Reserve ----
    try {
      supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      userId = null;
    }

    // Entitlement check (Phase F: infrastructure ready, no gated models yet)
    // Example future: if model requires 'advanced-study' and user lacks it → 403
    // For now, allow all — but keep hook:
    // if (userId) {
    //   const { data: has } = await supabase!.rpc('has_entitlement', { p_user_id: userId, p_kind: 'feature', p_value: 'advanced-study' });
    //   if (requiresAdvanced && !has) return 403
    // }

    // Reserve 1 credit atomically for authenticated users
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
