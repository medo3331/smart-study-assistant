/**
 * /api/unified-ai ‚Äî REAL INFERENCE + Phase H Final Economy+AI Integration
 *
 * Contract:
 *   POST multipart/form-data  ‚Üí prompt + file/image + language + [model] + [task]
 *   POST application/json     ‚Üí prompt + imageInput/fileInput + context + [model] + [task]
 *
 * Phase H Flow (‡§™‡•Ç‡§∞‡•ç‡§£ «· ﬂ«„· «·‰Â«∆Ì):
 *   Request ‚Üí Authenticate ‚Üí Resolve model
 *     ‚îú‚îÄ explicit model? ‚Üí validate exists/enabled ‚Üí getModelAccessPolicy ‚Üí has_entitlement
 *     ‚îÇ         ‚Üí DENIED 403 MODEL_ACCESS_REQUIRED (NO reserve, 0 credit consumed)
 *     ‚îî‚îÄ auto routing? ‚Üí TASK_MODEL_PREFERENCE ‚Üí routeCandidates ‚Üí Health ‚Üí filterAccessibleModels
 *                         ‚Üí first allowed candidate ‚Üí use it (health+entitlement respected)
 *   ‚Üí ALLOWED ‚Üí Phase F reserve (server requestId, NO client bypass) ‚Üí unifiedAI ‚Üí confirm/refund
 *   requestId is server-generated (crypto.randomUUID) ‚Äî client cannot forge
 *   1 request = 1 credit, no pricing table, no new currency
 *
 * Error contract (¬ß16):
 *   400 invalid request (bad prompt / bad model / bad task)
 *   401 not authenticated (reserved for future strict auth; currently anonymous free for free models)
 *   402 insufficient credits (balance < 1, reserve fails)
 *   403 entitlement required (MODEL_ACCESS_REQUIRED, 0 credit consumed)
 *   404 model/task unavailable (unknown model or no candidate after filtering)
 *   429 rate/concurrency (from api-guard if enabled; not invented in H)
 *   500 provider/internal
 *
 * Anonymous: Ì»ﬁÏ „Ã«‰« ··‹ free models ›ﬁÿ (·« Credits Ê·« Entitlements) ‚Äî ·« Ì” Œœ„ —’Ìœ „’«œﬁ ⁄·ÌÂ
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
import { isModelRuntimeEnabled, refreshModelStateCache } from "@/lib/ai/model-state";
import { routeCandidates } from "@/lib/ai/routing";
import { resolveUsageRequestContext } from "@/lib/ai/usage-context";
import { checkSubscriptionQuota } from "@/lib/ai/quota-check";
import { resolveActor } from "@/lib/policy";
import { generateIncidentId, getHttpStatus, sanitizeErrorMessage } from "@/lib/unified-ai/error-taxonomy";
import { logIncident } from "@/lib/unified-ai/incident-log";
import type { AiTaskType } from "@/lib/ai/types";
function serverRequestId(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore ‚Äî global crypto in Next runtime
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

const VALID_LANGUAGES = new Set<string>(["ar", "en", "mixed"]);

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
  let refunded = false;

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
      // ÕÃ„ «·„·›: Õœ √ﬁ’Ï ~4 „ÌÃ« · Ã‰» 413 „‰ Vercel
      const attached = fileInput || imageInput;
      if (attached && attached.size > 4 * 1024 * 1024) {
        return NextResponse.json(
          { ok: false, error: "ÕÃ„ «·„·› ﬂ»Ì— Ãœ«° Ì—ÃÏ —›⁄ „·› √’€— „‰ 4 „ÌÃ«", code: "FILE_TOO_LARGE" },
          { status: 413 }
        );
      }
      const lang = formData.get("language");
      if (lang === null) {
        // keep default
      } else if (typeof lang !== "string") {
        return NextResponse.json({ ok: false, error: "·€… €Ì— „œ⁄Ê„…", code: "INVALID_LANGUAGE" }, { status: 400 });
      } else {
        const trimmed = lang.trim();
        if (trimmed !== "" && !VALID_LANGUAGES.has(trimmed)) {
        return NextResponse.json({ ok: false, error: "·€… €Ì— „œ⁄Ê„…", code: "INVALID_LANGUAGE" }, { status: 400 });
        }
        if (trimmed !== "") language = trimmed;
      }
      const ctx = formData.get("context");
      if (ctx === null) {
        // keep default
      } else if (typeof ctx !== "string") {
        return NextResponse.json({ ok: false, error: "”Ì«ﬁ €Ì— ’«·Õ", code: "INVALID_CONTEXT" }, { status: 400 });
      } else if (ctx.trim() !== "") {
        try {
          const parsed = JSON.parse(ctx);
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("bad");
          context = parsed as Record<string, unknown>;
        } catch {
          return NextResponse.json({ ok: false, error: "”Ì«ﬁ €Ì— ’«·Õ", code: "INVALID_CONTEXT" }, { status: 400 });
        }
      }
      const m = formData.get("model");
      if (m === null) {
        // absent
      } else if (typeof m !== "string") {
        return NextResponse.json({ ok: false, error: "„ÊœÌ· €Ì— ’«·Õ", code: "INVALID_MODEL" }, { status: 400 });
      } else {
        const trimmed = m.trim();
        if (trimmed === "") {
          // absent
        } else if (trimmed.length > 200) {
          return NextResponse.json({ ok: false, error: "„ÊœÌ· €Ì— ’«·Õ", code: "INVALID_MODEL" }, { status: 400 });
        } else {
          requestedModel = trimmed;
        }
      }
      const t = formData.get("task");
      if (t === null) {
        // absent
      } else if (typeof t !== "string") {
        return NextResponse.json({ ok: false, error: "„Â„… €Ì— ’«·Õ…", code: "INVALID_TASK" }, { status: 400 });
      } else {
        const trimmed = t.trim();
        if (trimmed === "") {
          // absent
        } else if (!VALID_TASKS.has(trimmed)) {
          return NextResponse.json({ ok: false, error: "‰Ê⁄ «·„Â„… €Ì— „œ⁄Ê„", code: "UNSUPPORTED_TASK" }, { status: 400 });
        } else {
          requestedTask = trimmed as AiTaskType;
        }
      }
    } else {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ ok: false, error: "»Ì«‰«  €Ì— ’«·Õ…", code: "INVALID_REQUEST" }, { status: 400 });
      }
      const b = body as Record<string, unknown>;
      prompt = typeof b.prompt === "string" ? b.prompt : "";
      if ("language" in b && b.language !== undefined && b.language !== null) {
        if (typeof b.language !== "string") {
        return NextResponse.json({ ok: false, error: "·€… €Ì— „œ⁄Ê„…", code: "INVALID_LANGUAGE" }, { status: 400 });
        }
        const trimmed = b.language.trim();
        if (trimmed !== "" && !VALID_LANGUAGES.has(trimmed)) {
        return NextResponse.json({ ok: false, error: "·€… €Ì— „œ⁄Ê„…", code: "INVALID_LANGUAGE" }, { status: 400 });
        }
        if (trimmed !== "") language = trimmed;
      }
      if ("context" in b && b.context !== undefined && b.context !== null) {
        if (typeof b.context !== "object" || Array.isArray(b.context)) {
          return NextResponse.json({ ok: false, error: "”Ì«ﬁ €Ì— ’«·Õ", code: "INVALID_CONTEXT" }, { status: 400 });
        }
        context = b.context as Record<string, unknown>;
      }
      if ("model" in b && b.model !== undefined && b.model !== null) {
        if (typeof b.model !== "string") {
          return NextResponse.json({ ok: false, error: "„ÊœÌ· €Ì— ’«·Õ", code: "INVALID_MODEL" }, { status: 400 });
        }
        const trimmed = b.model.trim();
        if (trimmed !== "" && trimmed.length > 200) {
          return NextResponse.json({ ok: false, error: "„ÊœÌ· €Ì— ’«·Õ", code: "INVALID_MODEL" }, { status: 400 });
        }
        if (trimmed !== "") requestedModel = trimmed;
      }
      if ("task" in b && b.task !== undefined && b.task !== null) {
        if (typeof b.task !== "string") {
          return NextResponse.json({ ok: false, error: "„Â„… €Ì— ’«·Õ…", code: "INVALID_TASK" }, { status: 400 });
        }
        const trimmed = b.task.trim();
        if (trimmed !== "" && !VALID_TASKS.has(trimmed)) {
          return NextResponse.json({ ok: false, error: "‰Ê⁄ «·„Â„… €Ì— „œ⁄Ê„", code: "UNSUPPORTED_TASK" }, { status: 400 });
        }
        if (trimmed !== "") requestedTask = trimmed as AiTaskType;
      }
    }

    if (fileInput && imageInput) {
      return NextResponse.json({ ok: false, error: "·« Ì„ﬂ‰ ≈—”«· „·› Ê’Ê—… „⁄«", code: "INCONSISTENT_ATTACHMENTS" }, { status: 400 });
    }

    if (!prompt || typeof prompt !== "string" || (prompt.trim().length === 0 && !fileInput && !imageInput)) {
      return NextResponse.json({ ok: false, error: "«·„ÿ·Ê» ‰’ (prompt)", code: "INVALID_REQUEST" }, { status: 400 });
    }
    if (!prompt.trim() && (fileInput || imageInput)) {
      prompt = "·Œ¯’·Ì «·„Õ ÊÏ œÂ Ê«‘—ÕÂ »√”·Ê» Ê«÷Õ Ê„‰Ÿ„.";
    }

    // ---- Auth ----
    let isAnonymous = false;
    let userEmail: string | null = null;
    try {
      supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
      userEmail = user?.email ?? null;
      isAnonymous = Boolean(user?.is_anonymous);
    } catch {
      userId = null;
      userEmail = null;
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

    // Phase 2:  ÕœÌÀ Õ«·… «·„ÊœÌ·«  „‰ «·œ« «»Ì“ ﬁ»· √Ì Õ”„ ‚Äî
    //  »œÌ·«  /admin/models (enabled/priority/daily_limit) » √À— Â‰« ›⁄·Ì«.
    await refreshModelStateCache();

    let modelToUse: string = CURRENT_AI_MODEL;
    let resolvedVia: "explicit" | "auto" | "default" = "default";

    if (requestedModel) {
      // ---- Explicit model request (¬ß4) ----
      const m = findModel(requestedModel);
      if (!m) {
        return NextResponse.json(
          { ok: false, error: `«·„ÊœÌ· €Ì— „ÊÃÊœ: ${requestedModel}`, code: "MODEL_NOT_FOUND", model: requestedModel },
          { status: 404 }
        );
      }
      if (!m.enabled) {
        return NextResponse.json(
          { ok: false, error: `«·„ÊœÌ· €Ì— „ «Õ Õ«·Ì«: ${requestedModel}`, code: "MODEL_UNAVAILABLE", model: requestedModel },
          { status: 404 }
        );
      }
      // Phase 2: Õ«·… «·œ« «»Ì“ ›Êﬁ ﬁÌ„… «·”Ã· ‚Äî „ÊﬁÊ› ≈œ«—Ì« √Ê  Ã«Ê“ ÕœÂ «·ÌÊ„Ì
      if (!isModelRuntimeEnabled(m.id, m.enabled)) {
        return NextResponse.json(
          { ok: false, error: `«·„ÊœÌ· „ÊﬁÊ› ≈œ«—Ì« √Ê  Ã«Ê“ ÕœÂ «·ÌÊ„Ì: ${requestedModel}`, code: "MODEL_UNAVAILABLE", model: requestedModel },
          { status: 404 }
        );
      }
      const policy = getModelAccessPolicy(m.id);
      if (policy.access === "entitlement" && policy.entitlement) {
        if (!userId || !supabase) {
          return NextResponse.json(
            {
              ok: false,
              error: "Â–« «·‰„Ê–Ã Ì ÿ·»  ”ÃÌ· œŒÊ· Ê’·«ÕÌ…. «‘ —ˆÂ« „‰ «·„ Ã—.",
              code: "MODEL_ACCESS_REQUIRED",
              model: m.id,
              required: policy.entitlement,
            },
            { status: 403 }
          );
        }
        const ok = await hasEntitlement(policy.entitlement.kind, policy.entitlement.value);
        if (!ok) {
          // ¬ß4: 403 ﬁ»· «·ÕÃ“ ‚Äî ·« Ì” Â·ﬂ credit
          return NextResponse.json(
            {
              ok: false,
              error: "Â–« «·‰„Ê–Ã Ì ÿ·» ’·«ÕÌ… €Ì— „ Ê›—… ·œÌﬂ. «‘ —ˆÂ« „‰ «·„ Ã—.",
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
      // ---- Automatic routing (¬ß5): task ‚Üí candidates ‚Üí health ‚Üí access ‚Üí first allowed ----
      const candidates = routeCandidates(requestedTask);
      if (candidates.length === 0) {
        return NextResponse.json(
          { ok: false, error: `·« ÌÊÃœ „ÊœÌ· „ «Õ ··„Â„…: ${requestedTask}`, code: "TASK_UNAVAILABLE", task: requestedTask },
          { status: 404 }
        );
      }
      let accessible: typeof candidates = [];
      try {
        accessible = await filterAccessibleModels(candidates, hasEntitlement);
      } catch (e) {
        console.error("[unified-ai] filterAccessibleModels failed, falling back to candidates:", e);
        accessible = candidates;
      }
      if (accessible.length === 0) {
        // ﬂ· «·„—‘ÕÌ‰ „ﬁ›·Ì‰ ‚Äî ·« fallback Ìﬂ”— «·”Ì«”…
        const required =
          candidates[0]?.model ? getModelAccessPolicy(candidates[0].model).entitlement : undefined;
        return NextResponse.json(
          {
            ok: false,
            error: "ﬂ· «·‰„«–Ã «·„ «Õ… ·Â–Â «·„Â„…   ÿ·» ’·«ÕÌ…. «‘ —ˆÂ« „‰ «·„ Ã— √Ê Ã—¯» „Â„… √Œ—Ï.",
            code: "MODEL_ACCESS_REQUIRED",
            task: requestedTask,
            required,
          },
          { status: 403 }
        );
      }
      // √Ê· „—‘Õ „”„ÊÕ ÂÊ «·›«∆“ (ÌÕ —„ «· — Ì» Ê«·‹ health œ«Œ· routeCandidates)
      const winner = accessible[0];
      modelToUse = winner.model ?? CURRENT_AI_MODEL;
      resolvedVia = "auto";
    } else {
      // ---- Default (legacy): CURRENT_AI_MODEL free ‚Üí œ«∆„« „”„ÊÕ ----
      const policy = getModelAccessPolicy(CURRENT_AI_MODEL);
      if (policy.access === "entitlement" && policy.entitlement) {
        // Defensive: ·Ê ›Ì «·„” ﬁ»· √’»Õ default gated° ‰Õ «Ã ›Õ’
        if (!userId || !supabase) {
          return NextResponse.json(
            {
              ok: false,
              error: "Â–« «·‰„Ê–Ã Ì ÿ·»  ”ÃÌ· œŒÊ· Ê’·«ÕÌ….",
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
              error: "Â–« «·‰„Ê–Ã Ì ÿ·» ’·«ÕÌ… €Ì— „ Ê›—… ·œÌﬂ.",
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

    // Determine bucket: vision/file ‚Üí 6/5h, text ‚Üí 10/3h
    const isVisionOrFile = Boolean(imageInput || fileInput);

    // ---- Phase C: Guest Rate Limit (Anonymous 5/24h) ‚Äî BEFORE Phase A, 0 credit ----
    if (isAnonymous && userId && supabase) {
      const guestRate = await checkGuestRateLimit(supabase, userId);
      if (!guestRate.allowed) {
        const body = buildGuestRateLimitBody(guestRate);
        return NextResponse.json(body, { status: 429, headers: { "Retry-After": String(guestRate.retryAfter) } });
      }
    }

    // ---- Phase H.2: Rate Limit gate (BEFORE reserve) ‚Äî 429, 0 credit consumed ----
    if (userId && supabase && !isAnonymous) {
      const rate = await checkAiRateLimit(supabase, userId, { isVisionOrFile });
      if (!rate.allowed) {
        const body = buildRateLimitBody(rate);
        return NextResponse.json(body, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
      }
    }

    // ---- Phase B: Per-Model Rate Limit (BEFORE reserve) ‚Äî 429, 0 credit ----
    if (userId && supabase && !isAnonymous) {
      const modelRate = await checkModelRateLimit(supabase, userId, modelToUse);
      if (!modelRate.allowed) {
        const body = buildModelRateLimitBody(modelRate);
        return NextResponse.json(body, { status: 429, headers: { "Retry-After": String(modelRate.retryAfter) } });
      }
    }

    // ---- Phase B: Per-Agent Rate Limit (abstraction ¬„‰…) ‚Äî 429, 0 credit ----
    // ›ﬁÿ ≈–« ﬂ«‰ Â‰«ﬂ agent identity ÕﬁÌﬁÌ ›Ì «·ÿ·» (context.agentId) Ê„⁄—Ê› ›Ì AGENT_LIMITS
    // ·« ‰Œ —⁄ agent „‰ task ⁄«œÌ ‚Äî Stub = ·« ›Õ’
    const requestedAgentId = (() => {
      const raw = (context as Record<string, unknown>)?.agentId;
      if (typeof raw === "string" && raw.trim().length > 0 && isKnownAgentLimit(raw.trim())) return raw.trim();
      // √Ì÷« ·Ê task === agent Ê context.agentId „ÊÃÊœ ‚Äî ·« ‰” ‰ Ã „‰ prompt
      return null;
    })();
    if (requestedAgentId && userId && supabase && !isAnonymous) {
      const agentRate = await checkAgentRateLimit(supabase, userId, requestedAgentId);
      if (!agentRate.allowed) {
        const body = buildAgentRateLimitBody(agentRate);
        return NextResponse.json(body, { status: 429, headers: { "Retry-After": String(agentRate.retryAfter) } });
      }
    }

    // ---- Phase 1: Subscription message quota (same canonical helper as /api/chat) ----
    // Enforce before reserve so rejected quota does not consume AI credits.
    // Anonymous guests are exempt (no authenticated UUID / plan); owners bypass via resolveActor.
    if (userId && supabase && !isAnonymous) {
      const actor = await resolveActor(supabase, userId, userEmail);
      const quota = await checkSubscriptionQuota(userId, "message", actor.isOwner);
      if (!quota.allowed) {
        return NextResponse.json(
          { ok: false, error: quota.reasonAr ?? " „  Ã«Ê“ Õœ —”«Ì· «·»«ﬁ….", code: "MESSAGE_QUOTA_EXCEEDED" },
          { status: 429 }
        );
      }
    }

    // ---- Phase F: Reserve 1 credit atomically (with free overdraft up to window limit) ----
    // Free models: allowed via overdraft even if balance 0 (windowed)
    // Gated models: same, but additionally require entitlement (checked above)
    // Logged-in users: full reserve with model/agent metadata
    // Anonymous guests: also reserve for tracking (Guest 5/24h) ‚Äî same ledger, same window logic
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
          // Logged-in: Attempt Phase B extended RPC (p_model, p_agent) ‚Äî requires migration db/economy-phase-bc-rate-limits.sql
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
              // ignore ‚Äî metadata enrichment is best-effort
            }
          }
        } else {
          // Anonymous guest: simple reserve for tracking (no model/agent needed, just kind)
          // Reuse same reserve ‚Äî it will overdraft within Guest window (5/24h already checked above)
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
                error: `Ê’·  ··Õœ «·√ﬁ’Ï ·· Ã—»… «·„Ã«‰Ì… ﬂ“«∆— (5 ÿ·»«  ﬂ· 24 ”«⁄…). ”Ã¯· Õ”«» „Ã«‰Ì ··Õ’Ê· ⁄·Ï Õœ √ﬂ»—!`,
                code: "GUEST_RATE_LIMIT",
                retryAfterHours: 24,
                retryAfter: 24 * 3600,
                limit: 5,
              },
              { status: 429, headers: { "Retry-After": String(24 * 3600) } }
            );
          }
          return NextResponse.json(
            { ok: false, error: "—’Ìœ AI Credits ·« Ìﬂ›Ì. «‘ —ˆ Õ“„… „‰ «·„ Ã—.", code: "INSUFFICIENT_CREDITS" },
            { status: 402 }
          );
        }
        console.error("[PhaseF] reserve failed:", msg);
        return NextResponse.json({ ok: false, error: " ⁄–— ÕÃ“ AI Credit. Õ«Ê· „—… √Œ—Ï.", code: "RESERVE_FAILED" }, { status: 400 });
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

    // üßæ Phase 5-C5: ÂÊÌ… «·ÿ·» »  Ê·¯œ Â‰« **„—… Ê«Õœ…** Ê» ‰“· ÃÊÂ
    // `unifiedAI` ·ﬂ· „Õ«Ê·… „“Ê¯œ. «·„”«— œÂ ﬂ«‰ »Ì·›¯ ⁄·Ï
    // `callGroqWithModel` „»«‘—… ›„«»Ì‘Ê› `routing.ts` Œ«·’ ‚Äî ÊœÂ ”»»
    // ≈‰ Chat ﬂ«‰ »Ì—œ ⁄«œÌ ÊEvent = 0.
    //
    // ‚ö†Ô∏è `feature = "chat"`: «·„”«— œÂ **ÂÊ** «·„Õ«œÀ… «·√”«”Ì… (‰›”
    //    «·ÊŸÌ›… » «⁄… `/api/chat`)° ›«· ’‰Ì› «·œ·«·Ì Ê«Õœ „ﬁ’Êœ.
    //    «· „ÌÌ“ »Ì‰ «·„”«—Ì‰ »ÌÕ’· ›Ì `metadata.path` ("unified_ai"
    //    „ﬁ«»· "media"/"chat") ‚Äî ÊœÂ «··Ì »ÌŒ·¯Ì C5 Ì›—¯ﬁ „‰ €Ì— „«
    //    ‰ﬂ»¯— «·‹ taxonomy.
    input.usage = resolveUsageRequestContext(req, userId, {
      feature: "chat",
      diagnostics: { route: "unified_ai" },
    });

    // ---- Unified brain („‰ /api/chat): ‘Œ’Ì… «·ÿ«·» + ”Ì«ﬁÂ «·œ—«”Ì ‚Äî best-effort ----
    // ··„”Ã·Ì‰ ›ﬁÿ∫ «·“Ê«— Ê«·„ÃÂÊ·Ê‰ Ìﬂ„·Ê‰ »œÊ‰Â« Ê·« Ì ⁄ÿ·Ê‰.
    const rawMode = (context as Record<string, unknown>)?.mode;
    const rawConversationId = (context as Record<string, unknown>)?.conversationId;
    let incomingConversationId = "";
    if (typeof rawConversationId === "string" && rawConversationId.trim().length > 0) {
      incomingConversationId = rawConversationId.trim().slice(0, 80);
    }
    if (userId && supabase && !isAnonymous) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "«·ÿ«·»";
        input.system = language === "en"
          ? "You are ´Magiclyª, a study assistant. User: " + displayName + (user?.email ? " (" + user.email + ")" : "") + ". Answer in clear English. Do not assume database data."
          : "√‰  ´„«ÃÌﬂ·Ìª° „”«⁄œ „–«ﬂ—…. «·„” Œœ„: " + displayName + (user?.email ? " (" + user.email + ")" : "") + ". √Ã» »«·⁄—»Ì… «·„›ÂÊ„… Ê«·Ê«÷Õ…. ·«  › —÷ »Ì«‰«  „‰ ﬁ«⁄œ… «·»Ì«‰« .";
      } catch (e) {
        console.warn("[unified-ai] user context build failed, continuing without it:", e);
      }
    }

    // REAL INFERENCE
    const result: UnifiedAIResult = await unifiedAI(input);

    if (!result.ok) {
      if (userId && reserveRef && supabase && !refunded) {
        refunded = true;
        try {
          await supabase.rpc("refund_ai_credit", { p_user_id: userId, p_ref_id: reserveRef } )
        } catch (e) {
          console.error("[PhaseF] refund after provider failure failed:", e);
        }
      }
      const code = result.code || result.errorCode || "AI_PROVIDER_FAILED";
      const incidentId = generateIncidentId();
      console.error("[unified-ai] incident", incidentId, "code", code, "stage", sanitizeErrorMessage(result.error || ""));
      // Best-effort persistent logging (never throws, never blocks on failure).
      try {
        await logIncident({
          incidentId,
          errorCode: code,
          stage: result.error,
          httpStatus: getHttpStatus(code),
        });
      } catch {
        /* best-effort */
      }
      return NextResponse.json(
        {
          ok: false,
          error: result.error || "ÕœÀ Œÿ√ „ƒﬁ . Ã—» „—… √Œ—Ï.",
          code,
          incidentId,
          retryable: true,
        },
        { status: getHttpStatus(code) }
      );
    }

    // SUCCESS ‚Üí consume is implicit (reserve = consume); no extra ledger write
    // Õ›Ÿ «·„Õ«œÀ… best-effort (‰›” ‰„ÿ /api/chat) ‚Äî «·›‘· Â‰« ·« ÌÕ—„ «·ÿ«·» „‰ «·—œ.
    let savedConversationId = incomingConversationId;
    if (userId && supabase && !isAnonymous && result.answer) {
      try {
        if (savedConversationId) {
          const { data: ownedConversation } = await supabase
            .from("chat_conversations")
            .select("id")
            .eq("id", savedConversationId)
            .eq("user_id", userId)
            .maybeSingle();
          if (!ownedConversation) savedConversationId = "";
        }
        if (!savedConversationId) {
          const { data: conversation } = await supabase
            .from("chat_conversations")
            .insert({ user_id: userId, title: prompt.slice(0, 80) || "„Õ«œÀ… ÃœÌœ…" })
            .select("id")
            .single();
          savedConversationId = conversation?.id ?? "";
        }
        if (savedConversationId) {
          await supabase.from("chat_messages").insert([
            { conversation_id: savedConversationId, user_id: userId, role: "user", content: prompt },
            { conversation_id: savedConversationId, user_id: userId, role: "assistant", content: result.answer },
          ]);
          await supabase
            .from("chat_conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", savedConversationId)
            .eq("user_id", userId);
        }
      } catch (saveError) {
        console.warn("[unified-ai] could not save conversation", saveError);
      }
    }
    const uiResponse = {
      ok: true,
      answer: result.answer,
      agentUsed: result.agentUsed,
      extractedText: result.extractedText,
      metadata: { ...result.metadata, modelUsed: modelToUse, resolvedVia },
      reasoning: result.reasoning,
      conversationId: savedConversationId || undefined,
    };
    return NextResponse.json(uiResponse);
  } catch (e: unknown) {
    if (userId && reserveRef && supabase && !refunded) {
      refunded = true;
      try {
        await supabase.rpc("refund_ai_credit", { p_user_id: userId, p_ref_id: reserveRef });
      } catch (re) {
        console.error("[PhaseF] refund after exception failed:", re);
      }
    }
    console.error("unified-ai route error:", sanitizeErrorMessage((e as Error)?.message || String(e)));
    const incidentId = generateIncidentId();
    try {
      await logIncident({
        incidentId,
        errorCode: "UNKNOWN_INTERNAL_ERROR",
        stage: (e as Error)?.message || String(e),
        httpStatus: 500,
      });
    } catch {
      /* best-effort */
    }
    return NextResponse.json({ ok: false, error: "ÕœÀ Œÿ√ €Ì— „ Êﬁ⁄. Ã—» „—… √Œ—Ï.", code: "UNKNOWN_INTERNAL_ERROR", incidentId, retryable: true }, { status: 500 });
  }
}
// export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };


