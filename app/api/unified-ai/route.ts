/**
 * /api/unified-ai â€” REAL INFERENCE + Phase H Final Economy+AI Integration
 *
 * Contract:
 *   POST multipart/form-data  â†’ prompt + file/image + language + [model] + [task]
 *   POST application/json     â†’ prompt + imageInput/fileInput + context + [model] + [task]
 *
 * Phase H Flow (à¤ھà¥‚à¤°à¥چà¤£ ط§ظ„طھظƒط§ظ…ظ„ ط§ظ„ظ†ظ‡ط§ط¦ظٹ):
 *   Request â†’ Authenticate â†’ Resolve model
 *     â”œâ”€ explicit model? â†’ validate exists/enabled â†’ getModelAccessPolicy â†’ has_entitlement
 *     â”‚         â†’ DENIED 403 MODEL_ACCESS_REQUIRED (NO reserve, 0 credit consumed)
 *     â””â”€ auto routing? â†’ TASK_MODEL_PREFERENCE â†’ routeCandidates â†’ Health â†’ filterAccessibleModels
 *                         â†’ first allowed candidate â†’ use it (health+entitlement respected)
 *   â†’ ALLOWED â†’ Phase F reserve (server requestId, NO client bypass) â†’ unifiedAI â†’ confirm/refund
 *   requestId is server-generated (crypto.randomUUID) â€” client cannot forge
 *   1 request = 1 credit, no pricing table, no new currency
 *
 * Error contract (آ§16):
 *   400 invalid request (bad prompt / bad model / bad task)
 *   401 not authenticated (reserved for future strict auth; currently anonymous free for free models)
 *   402 insufficient credits (balance < 1, reserve fails)
 *   403 entitlement required (MODEL_ACCESS_REQUIRED, 0 credit consumed)
 *   404 model/task unavailable (unknown model or no candidate after filtering)
 *   429 rate/concurrency (from api-guard if enabled; not invented in H)
 *   500 provider/internal
 *
 * Anonymous: ظٹط¨ظ‚ظ‰ ظ…ط¬ط§ظ†ظ‹ط§ ظ„ظ„ظ€ free models ظپظ‚ط· (ظ„ط§ Credits ظˆظ„ط§ Entitlements) â€” ظ„ط§ ظٹط³طھط®ط¯ظ… ط±طµظٹط¯ ظ…طµط§ط¯ظ‚ ط¹ظ„ظٹظ‡
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
import { generateIncidentId, getHttpStatus, sanitizeErrorMessage } from "@/lib/unified-ai/error-taxonomy";
import { logIncident } from "@/lib/unified-ai/incident-log";
import type { AiTaskType } from "@/lib/ai/types";
function serverRequestId(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore â€” global crypto in Next runtime
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
      // ط­ط¬ظ… ط§ظ„ظ…ظ„ظپ: ط­ط¯ ط£ظ‚طµظ‰ ~4 ظ…ظٹط¬ط§ ظ„طھط¬ظ†ط¨ 413 ظ…ظ† Vercel
      const attached = fileInput || imageInput;
      if (attached && attached.size > 4 * 1024 * 1024) {
        return NextResponse.json(
          { ok: false, error: "ط­ط¬ظ… ط§ظ„ظ…ظ„ظپ ظƒط¨ظٹط± ط¬ط¯ط§ظ‹طŒ ظٹط±ط¬ظ‰ ط±ظپط¹ ظ…ظ„ظپ ط£طµط؛ط± ظ…ظ† 4 ظ…ظٹط¬ط§", code: "FILE_TOO_LARGE" },
          { status: 413 }
        );
      }
      const lang = formData.get("language");
      if (lang === null) {
        // keep default
      } else if (typeof lang !== "string") {
        return NextResponse.json({ ok: false, error: "لغة غير مدعومة", code: "INVALID_LANGUAGE" }, { status: 400 });
      } else {
        const trimmed = lang.trim();
        if (trimmed !== "" && !VALID_LANGUAGES.has(trimmed)) {
        return NextResponse.json({ ok: false, error: "لغة غير مدعومة", code: "INVALID_LANGUAGE" }, { status: 400 });
        }
        if (trimmed !== "") language = trimmed;
      }
      const ctx = formData.get("context");
      if (ctx === null) {
        // keep default
      } else if (typeof ctx !== "string") {
        return NextResponse.json({ ok: false, error: "سياق غير صالح", code: "INVALID_CONTEXT" }, { status: 400 });
      } else if (ctx.trim() !== "") {
        try {
          const parsed = JSON.parse(ctx);
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("bad");
          context = parsed as Record<string, unknown>;
        } catch {
          return NextResponse.json({ ok: false, error: "سياق غير صالح", code: "INVALID_CONTEXT" }, { status: 400 });
        }
      }
      const m = formData.get("model");
      if (m === null) {
        // absent
      } else if (typeof m !== "string") {
        return NextResponse.json({ ok: false, error: "موديل غير صالح", code: "INVALID_MODEL" }, { status: 400 });
      } else {
        const trimmed = m.trim();
        if (trimmed === "") {
          // absent
        } else if (trimmed.length > 200) {
          return NextResponse.json({ ok: false, error: "موديل غير صالح", code: "INVALID_MODEL" }, { status: 400 });
        } else {
          requestedModel = trimmed;
        }
      }
      const t = formData.get("task");
      if (t === null) {
        // absent
      } else if (typeof t !== "string") {
        return NextResponse.json({ ok: false, error: "مهمة غير صالحة", code: "INVALID_TASK" }, { status: 400 });
      } else {
        const trimmed = t.trim();
        if (trimmed === "") {
          // absent
        } else if (!VALID_TASKS.has(trimmed)) {
          return NextResponse.json({ ok: false, error: "نوع المهمة غير مدعوم", code: "UNSUPPORTED_TASK" }, { status: 400 });
        } else {
          requestedTask = trimmed as AiTaskType;
        }
      }
    } else {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ ok: false, error: "بيانات غير صالحة", code: "INVALID_REQUEST" }, { status: 400 });
      }
      const b = body as Record<string, unknown>;
      prompt = typeof b.prompt === "string" ? b.prompt : "";
      if ("language" in b && b.language !== undefined && b.language !== null) {
        if (typeof b.language !== "string") {
        return NextResponse.json({ ok: false, error: "لغة غير مدعومة", code: "INVALID_LANGUAGE" }, { status: 400 });
        }
        const trimmed = b.language.trim();
        if (trimmed !== "" && !VALID_LANGUAGES.has(trimmed)) {
        return NextResponse.json({ ok: false, error: "لغة غير مدعومة", code: "INVALID_LANGUAGE" }, { status: 400 });
        }
        if (trimmed !== "") language = trimmed;
      }
      if ("context" in b && b.context !== undefined && b.context !== null) {
        if (typeof b.context !== "object" || Array.isArray(b.context)) {
          return NextResponse.json({ ok: false, error: "سياق غير صالح", code: "INVALID_CONTEXT" }, { status: 400 });
        }
        context = b.context as Record<string, unknown>;
      }
      if ("model" in b && b.model !== undefined && b.model !== null) {
        if (typeof b.model !== "string") {
          return NextResponse.json({ ok: false, error: "موديل غير صالح", code: "INVALID_MODEL" }, { status: 400 });
        }
        const trimmed = b.model.trim();
        if (trimmed !== "" && trimmed.length > 200) {
          return NextResponse.json({ ok: false, error: "موديل غير صالح", code: "INVALID_MODEL" }, { status: 400 });
        }
        if (trimmed !== "") requestedModel = trimmed;
      }
      if ("task" in b && b.task !== undefined && b.task !== null) {
        if (typeof b.task !== "string") {
          return NextResponse.json({ ok: false, error: "مهمة غير صالحة", code: "INVALID_TASK" }, { status: 400 });
        }
        const trimmed = b.task.trim();
        if (trimmed !== "" && !VALID_TASKS.has(trimmed)) {
          return NextResponse.json({ ok: false, error: "نوع المهمة غير مدعوم", code: "UNSUPPORTED_TASK" }, { status: 400 });
        }
        if (trimmed !== "") requestedTask = trimmed as AiTaskType;
      }
    }

    if (fileInput && imageInput) {
      return NextResponse.json({ ok: false, error: "لا يمكن إرسال ملف وصورة معاً", code: "INCONSISTENT_ATTACHMENTS" }, { status: 400 });
    }

    if (!prompt || typeof prompt !== "string" || (prompt.trim().length === 0 && !fileInput && !imageInput)) {
      return NextResponse.json({ ok: false, error: "ط§ظ„ظ…ط·ظ„ظˆط¨ ظ†طµ (prompt)", code: "INVALID_REQUEST" }, { status: 400 });
    }
    if (!prompt.trim() && (fileInput || imageInput)) {
      prompt = "ظ„ط®ظ‘طµظ„ظٹ ط§ظ„ظ…ط­طھظˆظ‰ ط¯ظ‡ ظˆط§ط´ط±ط­ظ‡ ط¨ط£ط³ظ„ظˆط¨ ظˆط§ط¶ط­ ظˆظ…ظ†ط¸ظ….";
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

    // Phase 2: طھط­ط¯ظٹط« ط­ط§ظ„ط© ط§ظ„ظ…ظˆط¯ظٹظ„ط§طھ ظ…ظ† ط§ظ„ط¯ط§طھط§ط¨ظٹط² ظ‚ط¨ظ„ ط£ظٹ ط­ط³ظ… â€”
    // طھط¨ط¯ظٹظ„ط§طھ /admin/models (enabled/priority/daily_limit) ط¨طھط£ط«ط± ظ‡ظ†ط§ ظپط¹ظ„ظٹظ‹ط§.
    await refreshModelStateCache();

    let modelToUse: string = CURRENT_AI_MODEL;
    let resolvedVia: "explicit" | "auto" | "default" = "default";

    if (requestedModel) {
      // ---- Explicit model request (آ§4) ----
      const m = findModel(requestedModel);
      if (!m) {
        return NextResponse.json(
          { ok: false, error: `ط§ظ„ظ…ظˆط¯ظٹظ„ ط؛ظٹط± ظ…ظˆط¬ظˆط¯: ${requestedModel}`, code: "MODEL_NOT_FOUND", model: requestedModel },
          { status: 404 }
        );
      }
      if (!m.enabled) {
        return NextResponse.json(
          { ok: false, error: `ط§ظ„ظ…ظˆط¯ظٹظ„ ط؛ظٹط± ظ…طھط§ط­ ط­ط§ظ„ظٹظ‹ط§: ${requestedModel}`, code: "MODEL_UNAVAILABLE", model: requestedModel },
          { status: 404 }
        );
      }
      // Phase 2: ط­ط§ظ„ط© ط§ظ„ط¯ط§طھط§ط¨ظٹط² ظپظˆظ‚ ظ‚ظٹظ…ط© ط§ظ„ط³ط¬ظ„ â€” ظ…ظˆظ‚ظˆظپ ط¥ط¯ط§ط±ظٹظ‹ط§ ط£ظˆ طھط¬ط§ظˆط² ط­ط¯ظ‡ ط§ظ„ظٹظˆظ…ظٹ
      if (!isModelRuntimeEnabled(m.id, m.enabled)) {
        return NextResponse.json(
          { ok: false, error: `ط§ظ„ظ…ظˆط¯ظٹظ„ ظ…ظˆظ‚ظˆظپ ط¥ط¯ط§ط±ظٹظ‹ط§ ط£ظˆ طھط¬ط§ظˆط² ط­ط¯ظ‡ ط§ظ„ظٹظˆظ…ظٹ: ${requestedModel}`, code: "MODEL_UNAVAILABLE", model: requestedModel },
          { status: 404 }
        );
      }
      const policy = getModelAccessPolicy(m.id);
      if (policy.access === "entitlement" && policy.entitlement) {
        if (!userId || !supabase) {
          return NextResponse.json(
            {
              ok: false,
              error: "ظ‡ط°ط§ ط§ظ„ظ†ظ…ظˆط°ط¬ ظٹطھط·ظ„ط¨ طھط³ط¬ظٹظ„ ط¯ط®ظˆظ„ ظˆطµظ„ط§ط­ظٹط©. ط§ط´طھط±ظگظ‡ط§ ظ…ظ† ط§ظ„ظ…طھط¬ط±.",
              code: "MODEL_ACCESS_REQUIRED",
              model: m.id,
              required: policy.entitlement,
            },
            { status: 403 }
          );
        }
        const ok = await hasEntitlement(policy.entitlement.kind, policy.entitlement.value);
        if (!ok) {
          // آ§4: 403 ظ‚ط¨ظ„ ط§ظ„ط­ط¬ط² â€” ظ„ط§ ظٹط³طھظ‡ظ„ظƒ credit
          return NextResponse.json(
            {
              ok: false,
              error: "ظ‡ط°ط§ ط§ظ„ظ†ظ…ظˆط°ط¬ ظٹطھط·ظ„ط¨ طµظ„ط§ط­ظٹط© ط؛ظٹط± ظ…طھظˆظپط±ط© ظ„ط¯ظٹظƒ. ط§ط´طھط±ظگظ‡ط§ ظ…ظ† ط§ظ„ظ…طھط¬ط±.",
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
      // ---- Automatic routing (آ§5): task â†’ candidates â†’ health â†’ access â†’ first allowed ----
      const candidates = routeCandidates(requestedTask);
      if (candidates.length === 0) {
        return NextResponse.json(
          { ok: false, error: `ظ„ط§ ظٹظˆط¬ط¯ ظ…ظˆط¯ظٹظ„ ظ…طھط§ط­ ظ„ظ„ظ…ظ‡ظ…ط©: ${requestedTask}`, code: "TASK_UNAVAILABLE", task: requestedTask },
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
        // ظƒظ„ ط§ظ„ظ…ط±ط´ط­ظٹظ† ظ…ظ‚ظپظ„ظٹظ† â€” ظ„ط§ fallback ظٹظƒط³ط± ط§ظ„ط³ظٹط§ط³ط©
        const required =
          candidates[0]?.model ? getModelAccessPolicy(candidates[0].model).entitlement : undefined;
        return NextResponse.json(
          {
            ok: false,
            error: "ظƒظ„ ط§ظ„ظ†ظ…ط§ط°ط¬ ط§ظ„ظ…طھط§ط­ط© ظ„ظ‡ط°ظ‡ ط§ظ„ظ…ظ‡ظ…ط© طھطھط·ظ„ط¨ طµظ„ط§ط­ظٹط©. ط§ط´طھط±ظگظ‡ط§ ظ…ظ† ط§ظ„ظ…طھط¬ط± ط£ظˆ ط¬ط±ظ‘ط¨ ظ…ظ‡ظ…ط© ط£ط®ط±ظ‰.",
            code: "MODEL_ACCESS_REQUIRED",
            task: requestedTask,
            required,
          },
          { status: 403 }
        );
      }
      // ط£ظˆظ„ ظ…ط±ط´ط­ ظ…ط³ظ…ظˆط­ ظ‡ظˆ ط§ظ„ظپط§ط¦ط² (ظٹط­طھط±ظ… ط§ظ„طھط±طھظٹط¨ ظˆط§ظ„ظ€ health ط¯ط§ط®ظ„ routeCandidates)
      const winner = accessible[0];
      modelToUse = winner.model ?? CURRENT_AI_MODEL;
      resolvedVia = "auto";
    } else {
      // ---- Default (legacy): CURRENT_AI_MODEL free â†’ ط¯ط§ط¦ظ…ظ‹ط§ ظ…ط³ظ…ظˆط­ ----
      const policy = getModelAccessPolicy(CURRENT_AI_MODEL);
      if (policy.access === "entitlement" && policy.entitlement) {
        // Defensive: ظ„ظˆ ظپظٹ ط§ظ„ظ…ط³طھظ‚ط¨ظ„ ط£طµط¨ط­ default gatedطŒ ظ†ط­طھط§ط¬ ظپط­طµ
        if (!userId || !supabase) {
          return NextResponse.json(
            {
              ok: false,
              error: "ظ‡ط°ط§ ط§ظ„ظ†ظ…ظˆط°ط¬ ظٹطھط·ظ„ط¨ طھط³ط¬ظٹظ„ ط¯ط®ظˆظ„ ظˆطµظ„ط§ط­ظٹط©.",
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
              error: "ظ‡ط°ط§ ط§ظ„ظ†ظ…ظˆط°ط¬ ظٹطھط·ظ„ط¨ طµظ„ط§ط­ظٹط© ط؛ظٹط± ظ…طھظˆظپط±ط© ظ„ط¯ظٹظƒ.",
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

    // Determine bucket: vision/file â†’ 6/5h, text â†’ 10/3h
    const isVisionOrFile = Boolean(imageInput || fileInput);

    // ---- Phase C: Guest Rate Limit (Anonymous 5/24h) â€” BEFORE Phase A, 0 credit ----
    if (isAnonymous && userId && supabase) {
      const guestRate = await checkGuestRateLimit(supabase, userId);
      if (!guestRate.allowed) {
        const body = buildGuestRateLimitBody(guestRate);
        return NextResponse.json(body, { status: 429, headers: { "Retry-After": String(guestRate.retryAfter) } });
      }
    }

    // ---- Phase H.2: Rate Limit gate (BEFORE reserve) â€” 429, 0 credit consumed ----
    if (userId && supabase && !isAnonymous) {
      const rate = await checkAiRateLimit(supabase, userId, { isVisionOrFile });
      if (!rate.allowed) {
        const body = buildRateLimitBody(rate);
        return NextResponse.json(body, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
      }
    }

    // ---- Phase B: Per-Model Rate Limit (BEFORE reserve) â€” 429, 0 credit ----
    if (userId && supabase && !isAnonymous) {
      const modelRate = await checkModelRateLimit(supabase, userId, modelToUse);
      if (!modelRate.allowed) {
        const body = buildModelRateLimitBody(modelRate);
        return NextResponse.json(body, { status: 429, headers: { "Retry-After": String(modelRate.retryAfter) } });
      }
    }

    // ---- Phase B: Per-Agent Rate Limit (abstraction ط¢ظ…ظ†ط©) â€” 429, 0 credit ----
    // ظپظ‚ط· ط¥ط°ط§ ظƒط§ظ† ظ‡ظ†ط§ظƒ agent identity ط­ظ‚ظٹظ‚ظٹ ظپظٹ ط§ظ„ط·ظ„ط¨ (context.agentId) ظˆظ…ط¹ط±ظˆظپ ظپظٹ AGENT_LIMITS
    // ظ„ط§ ظ†ط®طھط±ط¹ agent ظ…ظ† task ط¹ط§ط¯ظٹ â€” Stub = ظ„ط§ ظپط­طµ
    const requestedAgentId = (() => {
      const raw = (context as Record<string, unknown>)?.agentId;
      if (typeof raw === "string" && raw.trim().length > 0 && isKnownAgentLimit(raw.trim())) return raw.trim();
      // ط£ظٹط¶ط§ظ‹ ظ„ظˆ task === agent ظˆ context.agentId ظ…ظˆط¬ظˆط¯ â€” ظ„ط§ ظ†ط³طھظ†طھط¬ ظ…ظ† prompt
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
    // Anonymous guests: also reserve for tracking (Guest 5/24h) â€” same ledger, same window logic
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
          // Logged-in: Attempt Phase B extended RPC (p_model, p_agent) â€” requires migration db/economy-phase-bc-rate-limits.sql
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
              // ignore â€” metadata enrichment is best-effort
            }
          }
        } else {
          // Anonymous guest: simple reserve for tracking (no model/agent needed, just kind)
          // Reuse same reserve â€” it will overdraft within Guest window (5/24h already checked above)
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
                error: `ظˆطµظ„طھ ظ„ظ„ط­ط¯ ط§ظ„ط£ظ‚طµظ‰ ظ„ظ„طھط¬ط±ط¨ط© ط§ظ„ظ…ط¬ط§ظ†ظٹط© ظƒط²ط§ط¦ط± (5 ط·ظ„ط¨ط§طھ ظƒظ„ 24 ط³ط§ط¹ط©). ط³ط¬ظ‘ظ„ ط­ط³ط§ط¨ ظ…ط¬ط§ظ†ظٹ ظ„ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ط­ط¯ ط£ظƒط¨ط±!`,
                code: "GUEST_RATE_LIMIT",
                retryAfterHours: 24,
                retryAfter: 24 * 3600,
                limit: 5,
              },
              { status: 429, headers: { "Retry-After": String(24 * 3600) } }
            );
          }
          return NextResponse.json(
            { ok: false, error: "ط±طµظٹط¯ AI Credits ظ„ط§ ظٹظƒظپظٹ. ط§ط´طھط±ظگ ط­ط²ظ…ط© ظ…ظ† ط§ظ„ظ…طھط¬ط±.", code: "INSUFFICIENT_CREDITS" },
            { status: 402 }
          );
        }
        console.error("[PhaseF] reserve failed:", msg);
        return NextResponse.json({ ok: false, error: "طھط¹ط°ط± ط­ط¬ط² AI Credit. ط­ط§ظˆظ„ ظ…ط±ط© ط£ط®ط±ظ‰.", code: "RESERVE_FAILED" }, { status: 400 });
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

    // ًں§¾ Phase 5-C5: ظ‡ظˆظٹط© ط§ظ„ط·ظ„ط¨ ط¨طھطھظˆظ„ظ‘ط¯ ظ‡ظ†ط§ **ظ…ط±ط© ظˆط§ط­ط¯ط©** ظˆط¨طھظ†ط²ظ„ ط¬ظˆظ‡
    // `unifiedAI` ظ„ظƒظ„ ظ…ط­ط§ظˆظ„ط© ظ…ط²ظˆظ‘ط¯. ط§ظ„ظ…ط³ط§ط± ط¯ظ‡ ظƒط§ظ† ط¨ظٹظ„ظپظ‘ ط¹ظ„ظ‰
    // `callGroqWithModel` ظ…ط¨ط§ط´ط±ط©ظ‹ ظپظ…ط§ط¨ظٹط´ظˆظپ `routing.ts` ط®ط§ظ„طµ â€” ظˆط¯ظ‡ ط³ط¨ط¨
    // ط¥ظ† Chat ظƒط§ظ† ط¨ظٹط±ط¯ ط¹ط§ط¯ظٹ ظˆEvent = 0.
    //
    // âڑ ï¸ڈ `feature = "chat"`: ط§ظ„ظ…ط³ط§ط± ط¯ظ‡ **ظ‡ظˆ** ط§ظ„ظ…ط­ط§ط¯ط«ط© ط§ظ„ط£ط³ط§ط³ظٹط© (ظ†ظپط³
    //    ط§ظ„ظˆط¸ظٹظپط© ط¨طھط§ط¹ط© `/api/chat`)طŒ ظپط§ظ„طھطµظ†ظٹظپ ط§ظ„ط¯ظ„ط§ظ„ظٹ ظˆط§ط­ط¯ ظ…ظ‚طµظˆط¯.
    //    ط§ظ„طھظ…ظٹظٹط² ط¨ظٹظ† ط§ظ„ظ…ط³ط§ط±ظٹظ† ط¨ظٹط­طµظ„ ظپظٹ `metadata.path` ("unified_ai"
    //    ظ…ظ‚ط§ط¨ظ„ "media"/"chat") â€” ظˆط¯ظ‡ ط§ظ„ظ„ظٹ ط¨ظٹط®ظ„ظ‘ظٹ C5 ظٹظپط±ظ‘ظ‚ ظ…ظ† ط؛ظٹط± ظ…ط§
    //    ظ†ظƒط¨ظ‘ط± ط§ظ„ظ€ taxonomy.
    input.usage = resolveUsageRequestContext(req, userId, {
      feature: "chat",
      diagnostics: { route: "unified_ai" },
    });

    // ---- Unified brain (ظ…ظ† /api/chat): ط´ط®طµظٹط© ط§ظ„ط·ط§ظ„ط¨ + ط³ظٹط§ظ‚ظ‡ ط§ظ„ط¯ط±ط§ط³ظٹ â€” best-effort ----
    // ظ„ظ„ظ…ط³ط¬ظ„ظٹظ† ظپظ‚ط·ط› ط§ظ„ط²ظˆط§ط± ظˆط§ظ„ظ…ط¬ظ‡ظˆظ„ظˆظ† ظٹظƒظ…ظ„ظˆظ† ط¨ط¯ظˆظ†ظ‡ط§ ظˆظ„ط§ ظٹطھط¹ط·ظ„ظˆظ†.
    const rawMode = (context as Record<string, unknown>)?.mode;
    const rawConversationId = (context as Record<string, unknown>)?.conversationId;
    let incomingConversationId = "";
    if (typeof rawConversationId === "string" && rawConversationId.trim().length > 0) {
      incomingConversationId = rawConversationId.trim().slice(0, 80);
    }
    if (userId && supabase && !isAnonymous) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "الطالب";
        input.system = "أنت «ماجيكلي»، مساعد مذاكرة. المستخدم: " + displayName + (user?.email ? " (" + user.email + ")" : "") + ". أجب بالعربية المفهومة والواضحة. لا تفترض بيانات من قاعدة البيانات.";
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
          error: result.error || "حدث خطأ مؤقت. جرب مرة أخرى.",
          code,
          incidentId,
          retryable: true,
        },
        { status: getHttpStatus(code) }
      );
    }

    // SUCCESS â†’ consume is implicit (reserve = consume); no extra ledger write
    // ط­ظپط¸ ط§ظ„ظ…ط­ط§ط¯ط«ط© best-effort (ظ†ظپط³ ظ†ظ…ط· /api/chat) â€” ط§ظ„ظپط´ظ„ ظ‡ظ†ط§ ظ„ط§ ظٹط­ط±ظ… ط§ظ„ط·ط§ظ„ط¨ ظ…ظ† ط§ظ„ط±ط¯.
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
            .insert({ user_id: userId, title: prompt.slice(0, 80) || "ظ…ط­ط§ط¯ط«ط© ط¬ط¯ظٹط¯ط©" })
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
    return NextResponse.json({ ok: false, error: "حدث خطأ غير متوقع. جرب مرة أخرى.", code: "UNKNOWN_INTERNAL_ERROR", incidentId, retryable: true }, { status: 500 });
  }
}
// export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };


