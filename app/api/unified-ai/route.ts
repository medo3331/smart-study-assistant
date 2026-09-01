/**
 * /api/unified-ai — REAL INFERENCE + Phase H Final Economy+AI Integration
 *
 * Contract:
 *   POST multipart/form-data  → prompt + file/image + language + [model] + [task]
 *   POST application/json     → prompt + imageInput/fileInput + context + [model] + [task]
 *
 * Phase H Flow (पूर्ण التكامل النهائي):
 *   Request → Authenticate → Resolve model
 *     ├─ explicit model? → validate exists/enabled → getModelAccessPolicy → has_entitlement
 *     │         → DENIED 403 MODEL_ACCESS_REQUIRED (NO reserve, 0 credit consumed)
 *     └─ auto routing? → TASK_MODEL_PREFERENCE → routeCandidates → Health → filterAccessibleModels
 *                         → first allowed candidate → use it (health+entitlement respected)
 *   → ALLOWED → Phase F reserve (server requestId, NO client bypass) → unifiedAI → confirm/refund
 *   requestId is server-generated (crypto.randomUUID) — client cannot forge
 *   1 request = 1 credit, no pricing table, no new currency
 *
 * Error contract (§16):
 *   400 invalid request (bad prompt / bad model / bad task)
 *   401 not authenticated (reserved for future strict auth; currently anonymous free for free models)
 *   402 insufficient credits (balance < 1, reserve fails)
 *   403 entitlement required (MODEL_ACCESS_REQUIRED, 0 credit consumed)
 *   404 model/task unavailable (unknown model or no candidate after filtering)
 *   429 rate/concurrency (from api-guard if enabled; not invented in H)
 *   500 provider/internal
 *
 * Anonymous: يبقى مجانًا للـ free models فقط (لا Credits ولا Entitlements) — لا يستخدم رصيد مصادق عليه
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { unifiedAI } from "@/lib/unified-ai/unified-ai";
import type { UnifiedAIInput, UnifiedAIResult } from "@/lib/unified-ai/types";
import { getModelAccessPolicy, CURRENT_AI_MODEL, filterAccessibleModels } from "@/lib/ai/model-access";
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
} from "@/lib/ai/rate-limit";
import { findModel } from "@/lib/ai/models";
import { routeCandidates } from "@/lib/ai/routing";
import type { AiTaskType } from "@/lib/ai/types";

function serverRequestId(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — global crypto in Next runtime
    if (typeof crypto !== "undefined" && typeof (crypto as unknown as { randomUUID?: () => string }).randomUUID === "function") {
      return (crypto as unknown as { randomUUID: () => string }).randomUUID!();
    }
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const VALID_TASKS = new Set<string>([
  "chat",
  "explain",
  "summarize",
  "content",
  "marketing_copy",
  "tutor",
  "agent",
  "coding",
  "quiz",
  "flashcards",
  "study_plan",
  "lesson_analysis",
  "mind_map",
  "file_analysis",
  "image_analysis",
  "data_analysis",
  "planning",
  "business_plan",
  "marketing_plan",
  "roadmap",
  "image_generation",
  "image_edit",
  "video_generation",
  "rag_embeddings",
]);

function clampModel(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const s = input.trim();
  if (!s || s.length > 200) return undefined;
  return s;
}
function clampTask(input: unknown): AiTaskType | undefined {
  if (typeof input !== "string") return undefined;
  const t = input.trim() as AiTaskType;
  if (VALID_TASKS.has(t)) return t;
  return undefined;
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
    let requestedModel: string | undefined;
    let requestedTask: AiTaskType | undefined;

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
        try {
          context = JSON.parse(ctx);
        } catch {
          /* ignore */
        }
      }
      const m = formData.get("model");
      requestedModel = clampModel(m);
      const t = formData.get("task");
      requestedTask = clampTask(t);
    } else {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return NextResponse.json({ ok: false, error: "بيانات غير صالحة", code: "INVALID_REQUEST" }, { status: 400 });
      }
      prompt = (body as Record<string, unknown>).prompt as string || "";
      language = ((body as Record<string, unknown>).language as string) || "ar";
      context = ((body as Record<string, unknown>).context as Record<string, unknown>) || {};
      requestedModel = clampModel((body as Record<string, unknown>).model);
      requestedTask = clampTask((body as Record<string, unknown>).task);
      // Legacy: body.model as X handled above
    }

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json({ ok: false, error: "المطلوب نص (prompt)", code: "INVALID_REQUEST" }, { status: 400 });
    }

    // ---- Auth ----
    let isAnonymous = false;
    try {
      supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
      isAnonymous = Boolean(user?.is_anonymous);
    } catch {
      userId = null;
      isAnonymous = false;
    }

    // ---- Phase H: Model resolution + Access Policy (BEFORE reserve) ----
    // Helper to check entitlement (server-side only via has_entitlement RPC)
    const hasEntitlement = async (kind: string, value: string): Promise<boolean> => {
      if (!userId || !supabase) return false;
      const { data, error } = await supabase.rpc("has_entitlement", {
        p_user_id: userId,
        p_kind: kind,
        p_value: value,
      });
      if (error) {
        console.error("[PhaseH] has_entitlement failed:", error.message);
        return false;
      }
      return Boolean(data);
    };

    let modelToUse: string = CURRENT_AI_MODEL;
    let resolvedVia: "explicit" | "auto" | "default" = "default";

    if (requestedModel) {
      // ---- Explicit model request (§4) ----
      const m = findModel(requestedModel);
      if (!m) {
        return NextResponse.json(
          { ok: false, error: `الموديل غير موجود: ${requestedModel}`, code: "MODEL_NOT_FOUND", model: requestedModel },
          { status: 404 }
        );
      }
      if (!m.enabled) {
        return NextResponse.json(
          { ok: false, error: `الموديل غير متاح حاليًا: ${requestedModel}`, code: "MODEL_UNAVAILABLE", model: requestedModel },
          { status: 404 }
        );
      }
      const policy = getModelAccessPolicy(m.id);
      if (policy.access === "entitlement" && policy.entitlement) {
        if (!userId || !supabase) {
          return NextResponse.json(
            {
              ok: false,
              error: "هذا النموذج يتطلب تسجيل دخول وصلاحية. اشترِها من المتجر.",
              code: "MODEL_ACCESS_REQUIRED",
              model: m.id,
              required: policy.entitlement,
            },
            { status: 403 }
          );
        }
        const ok = await hasEntitlement(policy.entitlement.kind, policy.entitlement.value);
        if (!ok) {
          // §4: 403 قبل الحجز — لا يستهلك credit
          return NextResponse.json(
            {
              ok: false,
              error: "هذا النموذج يتطلب صلاحية غير متوفرة لديك. اشترِها من المتجر.",
              code: "MODEL_ACCESS_REQUIRED",
              model: m.id,
              required: policy.entitlement,
            },
            { status: 403 }
          );
        }
      }
      modelToUse = m.id;
      resolvedVia = "explicit";
    } else if (requestedTask) {
      // ---- Automatic routing (§5): task → candidates → health → access → first allowed ----
      const candidates = routeCandidates(requestedTask);
      if (candidates.length === 0) {
        return NextResponse.json(
          { ok: false, error: `لا يوجد موديل متاح للمهمة: ${requestedTask}`, code: "TASK_UNAVAILABLE", task: requestedTask },
          { status: 404 }
        );
      }
      const accessible = await filterAccessibleModels(candidates, hasEntitlement);
      if (accessible.length === 0) {
        // كل المرشحين مقفلين — لا fallback يكسر السياسة
        const required =
          candidates[0]?.model ? getModelAccessPolicy(candidates[0].model).entitlement : undefined;
        return NextResponse.json(
          {
            ok: false,
            error: "كل النماذج المتاحة لهذه المهمة تتطلب صلاحية. اشترِها من المتجر أو جرّب مهمة أخرى.",
            code: "MODEL_ACCESS_REQUIRED",
            task: requestedTask,
            required,
          },
          { status: 403 }
        );
      }
      // أول مرشح مسموح هو الفائز (يحترم الترتيب والـ health داخل routeCandidates)
      const winner = accessible[0];
      modelToUse = winner.model ?? CURRENT_AI_MODEL;
      resolvedVia = "auto";
    } else {
      // ---- Default (legacy): CURRENT_AI_MODEL free → دائمًا مسموح ----
      const policy = getModelAccessPolicy(CURRENT_AI_MODEL);
      if (policy.access === "entitlement" && policy.entitlement) {
        // Defensive: لو في المستقبل أصبح default gated، نحتاج فحص
        if (!userId || !supabase) {
          return NextResponse.json(
            {
              ok: false,
              error: "هذا النموذج يتطلب تسجيل دخول وصلاحية.",
              code: "MODEL_ACCESS_REQUIRED",
              model: CURRENT_AI_MODEL,
              required: policy.entitlement,
            },
            { status: 403 }
          );
        }
        const ok = await hasEntitlement(policy.entitlement.kind, policy.entitlement.value);
        if (!ok) {
          return NextResponse.json(
            {
              ok: false,
              error: "هذا النموذج يتطلب صلاحية غير متوفرة لديك.",
              code: "MODEL_ACCESS_REQUIRED",
              model: CURRENT_AI_MODEL,
              required: policy.entitlement,
            },
            { status: 403 }
          );
        }
      }
      modelToUse = CURRENT_AI_MODEL;
      resolvedVia = "default";
    }

    // Log routing decision server-side only (never expose to UI)
    console.log(`[PhaseH unified-ai] resolved=${resolvedVia} model=${modelToUse} task=${requestedTask ?? "chat"} user=${userId ? "auth" : "anon"}`);

    // Determine bucket: vision/file → 6/5h, text → 10/3h
    const isVisionOrFile = Boolean(imageInput || fileInput);

    // ---- Phase C: Guest Rate Limit (Anonymous 5/24h) — BEFORE Phase A, 0 credit ----
    if (isAnonymous && userId && supabase) {
      const guestRate = await checkGuestRateLimit(supabase, userId);
      if (!guestRate.allowed) {
        const body = buildGuestRateLimitBody(guestRate);
        return NextResponse.json(body, { status: 429, headers: { "Retry-After": String(guestRate.retryAfter) } });
      }
    }

    // ---- Phase H.2: Rate Limit gate (BEFORE reserve) — 429, 0 credit consumed ----
    if (userId && supabase && !isAnonymous) {
      const rate = await checkAiRateLimit(supabase, userId, { isVisionOrFile });
      if (!rate.allowed) {
        const body = buildRateLimitBody(rate);
        return NextResponse.json(body, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
      }
    }

    // ---- Phase B: Per-Model Rate Limit (BEFORE reserve) — 429, 0 credit ----
    if (userId && supabase && !isAnonymous) {
      const modelRate = await checkModelRateLimit(supabase, userId, modelToUse);
      if (!modelRate.allowed) {
        const body = buildModelRateLimitBody(modelRate);
        return NextResponse.json(body, { status: 429, headers: { "Retry-After": String(modelRate.retryAfter) } });
      }
    }

    // ---- Phase B: Per-Agent Rate Limit (abstraction آمنة) — 429, 0 credit ----
    // فقط إذا كان هناك agent identity حقيقي في الطلب (context.agentId) ومعروف في AGENT_LIMITS
    // لا نخترع agent من task عادي — Stub = لا فحص
    const requestedAgentId = (() => {
      const raw = (context as Record<string, unknown>)?.agentId;
      if (typeof raw === "string" && raw.trim().length > 0 && isKnownAgentLimit(raw.trim())) return raw.trim();
      // أيضاً لو task === agent و context.agentId موجود — لا نستنتج من prompt
      return null;
    })();
    if (requestedAgentId && userId && supabase && !isAnonymous) {
      const agentRate = await checkAgentRateLimit(supabase, userId, requestedAgentId);
      if (!agentRate.allowed) {
        const body = buildAgentRateLimitBody(agentRate);
        return NextResponse.json(body, { status: 429, headers: { "Retry-After": String(agentRate.retryAfter) } });
      }
    }

    // ---- Phase F: Reserve 1 credit atomically (with free overdraft up to window limit) ----
    // Free models: allowed via overdraft even if balance 0 (windowed)
    // Gated models: same, but additionally require entitlement (checked above)
    // Logged-in users: full reserve with model/agent metadata
    // Anonymous guests: also reserve for tracking (Guest 5/24h) — same ledger, same window logic
    let guestReserveDone = false;
    if (userId && supabase) {
      // For anon: we already checked Guest limit above, now track usage via same ledger
      // For logged-in: full Phase B enriched reserve
      const isTrackingGuest = isAnonymous;
      const refId = `ai_req:${serverRequestId()}`;
      reserveRef = refId;
      const reserveKind = isVisionOrFile ? "vision" : "text";
      let reserveErr: { message?: string } | null = null;
      const agentForMeta = (() => {
        const raw = (context as Record<string, unknown>)?.agentId;
        if (typeof raw === "string" && raw.trim().length > 0) return raw.trim().slice(0, 80);
        return null;
      })();
      try {
        if (!isTrackingGuest) {
          // Logged-in: Attempt Phase B extended RPC (p_model, p_agent) — requires migration db/economy-phase-bc-rate-limits.sql
          const resExt = await supabase.rpc("reserve_ai_credit", {
            p_user_id: userId,
            p_ref_id: refId,
            p_kind: reserveKind,
            p_model: modelToUse,
            p_agent: agentForMeta,
          } as unknown as { p_user_id: string; p_ref_id: string });
          reserveErr = (resExt as { error?: { message?: string } }).error ?? null;
          const msgExt = reserveErr?.message || "";
          const needsFallback = msgExt.includes("p_model") || msgExt.includes("p_agent") || (msgExt.includes("function") && msgExt.includes("reserve_ai_credit"));
          if (needsFallback) {
            const res = await supabase.rpc("reserve_ai_credit", {
              p_user_id: userId,
              p_ref_id: refId,
              p_kind: reserveKind,
            } as unknown as { p_user_id: string; p_ref_id: string });
            reserveErr = (res as { error?: { message?: string } }).error ?? null;
            const msg0 = reserveErr?.message || "";
            if (msg0.includes("p_kind") || (msg0.includes("function") && msg0.includes("reserve_ai_credit"))) {
              const retry = await supabase.rpc("reserve_ai_credit", {
                p_user_id: userId,
                p_ref_id: refId,
              });
              reserveErr = (retry as { error?: { message?: string } }).error ?? null;
            }
          }
          if (!reserveErr) {
            try {
              if (agentForMeta || modelToUse) {
                await supabase.rpc("update_ai_ledger_metadata" as unknown as string, {
                  p_user_id: userId,
                  p_ref_id: refId,
                  p_model: modelToUse,
                  p_agent: agentForMeta,
                } as unknown as Record<string, unknown>);
              }
            } catch {
              // ignore — metadata enrichment is best-effort
            }
          }
        } else {
          // Anonymous guest: simple reserve for tracking (no model/agent needed, just kind)
          // Reuse same reserve — it will overdraft within Guest window (5/24h already checked above)
          // and also within text/vision window (10/3h or 6/5h). If it fails, map to GUEST limit.
          const res = await supabase.rpc("reserve_ai_credit", {
            p_user_id: userId,
            p_ref_id: refId,
            p_kind: reserveKind,
          } as unknown as { p_user_id: string; p_ref_id: string });
          reserveErr = (res as { error?: { message?: string } }).error ?? null;
          const msg0 = reserveErr?.message || "";
          if (msg0.includes("p_kind") || (msg0.includes("function") && msg0.includes("reserve_ai_credit"))) {
            const retry = await supabase.rpc("reserve_ai_credit", {
              p_user_id: userId,
              p_ref_id: refId,
            });
            reserveErr = (retry as { error?: { message?: string } }).error ?? null;
          }
          if (!reserveErr) guestReserveDone = true;
        }
      } catch (e) {
        reserveErr = e as { message?: string };
      }
      if (reserveErr) {
        const msg = reserveErr.message || "";
        if (msg.includes("insufficient credits") || msg.includes("Insufficient")) {
          // For guest: map to GUEST_RATE_LIMIT (429), for logged-in: check if it's window limit vs true insufficient
          if (isTrackingGuest) {
            // Guest already checked via checkGuestRateLimit, but reserve window check may also trigger
            // Return GUEST_RATE_LIMIT to keep UX consistent
            return NextResponse.json(
              {
                ok: false,
                error: `وصلت للحد الأقصى للتجربة المجانية كزائر (5 طلبات كل 24 ساعة). سجّل حساب مجاني للحصول على حد أكبر!`,
                code: "GUEST_RATE_LIMIT",
                retryAfterHours: 24,
                retryAfter: 24 * 3600,
                limit: 5,
              },
              { status: 429, headers: { "Retry-After": String(24 * 3600) } }
            );
          }
          return NextResponse.json(
            { ok: false, error: "رصيد AI Credits لا يكفي. اشترِ حزمة من المتجر.", code: "INSUFFICIENT_CREDITS" },
            { status: 402 }
          );
        }
        console.error("[PhaseF] reserve failed:", msg);
        return NextResponse.json({ ok: false, error: "تعذر حجز AI Credit. حاول مرة أخرى.", code: "RESERVE_FAILED" }, { status: 500 });
      }
    }

    const input: UnifiedAIInput = {
      prompt,
      context,
      language: (language === "ar" || language === "en" || language === "mixed" ? language : "ar") as UnifiedAIInput["language"],
      model: modelToUse,
      task: requestedTask,
    };
    if (imageInput) input.imageInput = imageInput;
    if (fileInput) input.fileInput = fileInput;

    // REAL INFERENCE
    const result: UnifiedAIResult = await unifiedAI(input);

    if (!result.ok) {
      // FAILURE → refund reservation (idempotent) — لا يستهلك credit
      if (userId && reserveRef && supabase) {
        try {
          await supabase.rpc("refund_ai_credit", { p_user_id: userId, p_ref_id: reserveRef });
        } catch (e) {
          console.error("[PhaseF] refund after provider failure failed:", e);
        }
      }
      // Provider failure: spec §16 → 500 but we keep 200 for client resilience with ok:false
      // To honor §16, return 502 for provider errors; client already handles both.
      return NextResponse.json({ ok: false, error: result.error || "حدث خطأ مؤقت. جرب مرة أخرى.", code: "PROVIDER_ERROR" }, { status: 502 });
    }

    // SUCCESS → consume is implicit (reserve = consume); no extra ledger write
    const uiResponse = {
      ok: true,
      answer: result.answer,
      agentUsed: result.agentUsed,
      extractedText: result.extractedText,
      metadata: { ...result.metadata, modelUsed: modelToUse, resolvedVia },
      reasoning: result.reasoning,
    };
    return NextResponse.json(uiResponse);
  } catch (e: unknown) {
    if (userId && reserveRef && supabase) {
      try {
        await supabase.rpc("refund_ai_credit", { p_user_id: userId, p_ref_id: reserveRef });
      } catch (re) {
        console.error("[PhaseF] refund after exception failed:", re);
      }
    }
    console.error("unified-ai route error:", (e as Error)?.message || String(e));
    return NextResponse.json({ ok: false, error: "حدث خطأ غير متوقع. جرب مرة أخرى.", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
