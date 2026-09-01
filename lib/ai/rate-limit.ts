/**
 * Phase H.2 + Phase B + Phase C — AI Rate Limit Engine
 *
 * Phase A (H.2) — Per-User Windowed Limits (FOUNDATION - لا تغير منطقها):
 *   - Text (chat/tutor/explain...): 10 طلبات / 3 ساعات (sliding window)
 *   - Vision/Files (OCR/Vision/Files): 6 طلبات / 5 ساعات (sliding window)
 *   - Premium: غير محدود (1000) — has_entitlement
 *
 * Phase B — Per-Model + Per-Agent Limits (فوق Phase A):
 *   - Model: super 5/24h, ultra 3/24h — فقط لهذين الموديلين
 *   - Agent: quiz 8/3h, research 6/5h, doc 6/5h, image 4/5h — abstraction آمنة
 *
 * Phase C — Guest/Visitor Limits:
 *   - Anonymous Guest: 5 طلبات / 24 ساعة (منفصل عن User limits)
 *   - المفتاح: Supabase Anonymous User ID (is_anonymous)
 *   - Server-side فقط، لا localStorage، لا refresh farming
 *
 * القاعدة الذهبية:
 *   - Server-side فقط — لا ثقة بالكلاينت
 *   - يفحص قبل reserve_ai_credit — فلو 429 لا يستهلك Credit
 *   - Sliding window: العد من ai_credit_ledger (reason='ai_reserve')
 *   - Fail-open على خطأ DB مؤقت مع log (لا نعطل الخدمة)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── حدود الخطة المجانية — Phase A ──
export const FREE_TEXT_LIMIT = 10;
export const FREE_TEXT_WINDOW_HOURS = 3;
export const FREE_TEXT_WINDOW_SECONDS = FREE_TEXT_WINDOW_HOURS * 3600;

export const FREE_VISION_LIMIT = 6;
export const FREE_VISION_WINDOW_HOURS = 5;
export const FREE_VISION_WINDOW_SECONDS = FREE_VISION_WINDOW_HOURS * 3600;

// ── حدود الخطة المدفوعة (غير محدود عملياً) ──
export const PREMIUM_TEXT_LIMIT = 1000;
export const PREMIUM_VISION_LIMIT = 1000;

// Legacy daily constants (للتوافق — لا تستخدم للفحص الجديد)
export const FREE_DAILY_LIMIT = 20;
export const PREMIUM_DAILY_LIMIT = 100;

// ── Phase B: Per-Model Limits ──
export const MODEL_LIMITS: Record<string, { limit: number; windowHours: number; windowSeconds: number }> = {
  "nvidia/nemotron-3-super-120b-a12b": { limit: 5, windowHours: 24, windowSeconds: 24 * 3600 },
  "nvidia/nemotron-3-ultra-550b-a55b": { limit: 3, windowHours: 24, windowSeconds: 24 * 3600 },
};

// ── Phase B: Per-Agent Limits ──
export const AGENT_LIMITS: Record<string, { limit: number; windowHours: number; windowSeconds: number }> = {
  quiz_generator: { limit: 8, windowHours: 3, windowSeconds: 3 * 3600 },
  research: { limit: 6, windowHours: 5, windowSeconds: 5 * 3600 },
  document_analyzer: { limit: 6, windowHours: 5, windowSeconds: 5 * 3600 },
  image: { limit: 4, windowHours: 5, windowSeconds: 5 * 3600 },
};

// ── Phase C: Guest Limits ──
export const GUEST_LIMIT = 5;
export const GUEST_WINDOW_HOURS = 24;
export const GUEST_WINDOW_SECONDS = GUEST_WINDOW_HOURS * 3600;

export type RateLimitOpts = {
  isVisionOrFile?: boolean;
};

export type RateLimitResult =
  | { allowed: true; limit: number; used: number; remaining: number; windowHours: number; isVision: boolean }
  | { allowed: false; limit: number; used: number; remaining: 0; retryAfter: number; retryAfterHours: number; windowHours: number; isVision: boolean; oldestAt?: string };

export type ModelRateLimitResult =
  | { allowed: true; limit: number; used: number; remaining: number; windowHours: number; modelId: string }
  | { allowed: false; limit: number; used: number; remaining: 0; retryAfter: number; retryAfterHours: number; windowHours: number; modelId: string; oldestAt?: string };

export type AgentRateLimitResult =
  | { allowed: true; limit: number; used: number; remaining: number; windowHours: number; agentId: string }
  | { allowed: false; limit: number; used: number; remaining: 0; retryAfter: number; retryAfterHours: number; windowHours: number; agentId: string; oldestAt?: string };

export type GuestRateLimitResult =
  | { allowed: true; limit: number; used: number; remaining: number; windowHours: number }
  | { allowed: false; limit: number; used: number; remaining: 0; retryAfter: number; retryAfterHours: number; windowHours: number; oldestAt?: string };

export async function isPremiumUser(supabase: SupabaseClient, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data, error } = await supabase.rpc("has_entitlement", {
      p_user_id: userId,
      p_kind: "plan",
      p_value: "premium",
    });
    if (!error && data === true) return true;
    const { data: data2, error: err2 } = await supabase.rpc("has_entitlement", {
      p_user_id: userId,
      p_kind: "feature",
      p_value: "premium-ai",
    });
    if (!err2 && data2 === true) return true;
  } catch {
    // ignore
  }
  return false;
}

export async function resolveAiWindowLimit(
  supabase: SupabaseClient,
  userId: string | null,
  isVisionOrFile: boolean
): Promise<{ limit: number; windowHours: number; windowSeconds: number }> {
  if (!userId) {
    return isVisionOrFile
      ? { limit: FREE_VISION_LIMIT, windowHours: FREE_VISION_WINDOW_HOURS, windowSeconds: FREE_VISION_WINDOW_SECONDS }
      : { limit: FREE_TEXT_LIMIT, windowHours: FREE_TEXT_WINDOW_HOURS, windowSeconds: FREE_TEXT_WINDOW_SECONDS };
  }
  const premium = await isPremiumUser(supabase, userId);
  if (premium) {
    return isVisionOrFile
      ? { limit: PREMIUM_VISION_LIMIT, windowHours: FREE_VISION_WINDOW_HOURS, windowSeconds: FREE_VISION_WINDOW_SECONDS }
      : { limit: PREMIUM_TEXT_LIMIT, windowHours: FREE_TEXT_WINDOW_HOURS, windowSeconds: FREE_TEXT_WINDOW_SECONDS };
  }
  return isVisionOrFile
    ? { limit: FREE_VISION_LIMIT, windowHours: FREE_VISION_WINDOW_HOURS, windowSeconds: FREE_VISION_WINDOW_SECONDS }
    : { limit: FREE_TEXT_LIMIT, windowHours: FREE_TEXT_WINDOW_HOURS, windowSeconds: FREE_TEXT_WINDOW_SECONDS };
}

// Legacy — للتوافق مع كود قديم يستدعيها
export async function resolveAiDailyLimit(supabase: SupabaseClient, userId: string | null): Promise<number> {
  const premium = await isPremiumUser(supabase, userId);
  return premium ? PREMIUM_DAILY_LIMIT : FREE_DAILY_LIMIT;
}

function isVisionKind(kind: unknown): boolean {
  if (typeof kind !== "string") return false;
  return kind === "vision" || kind === "file" || kind === "image" || kind === "ocr";
}

/**
 * فحص هل المستخدم تجاوز الحد الزمني (sliding window) — Phase A
 * العد من ai_credit_ledger حيث reason='ai_reserve' و metadata.kind يطابق النوع
 */
export async function checkAiRateLimit(
  supabase: SupabaseClient,
  userId: string | null,
  opts?: RateLimitOpts
): Promise<RateLimitResult> {
  const isVision = opts?.isVisionOrFile ?? false;

  if (!userId) {
    const cfg = await resolveAiWindowLimit(supabase, null, isVision);
    return { allowed: true, limit: cfg.limit, used: 0, remaining: cfg.limit, windowHours: cfg.windowHours, isVision };
  }

  const cfg = await resolveAiWindowLimit(supabase, userId, isVision);
  const limit = cfg.limit;
  const windowHours = cfg.windowHours;
  const windowSeconds = cfg.windowSeconds;

  if (limit >= 1000) {
    return { allowed: true, limit, used: 0, remaining: limit, windowHours, isVision };
  }

  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

  try {
    const { data, error } = await supabase
      .from("ai_credit_ledger")
      .select("created_at, metadata")
      .eq("user_id", userId)
      .eq("reason", "ai_reserve")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      console.error("[rate-limit] count failed:", error.message);
      return { allowed: true, limit, used: 0, remaining: limit, windowHours, isVision };
    }

    const rows = (data ?? []) as Array<{ created_at: string; metadata: unknown }>;
    const filtered = rows.filter((r) => {
      const meta = r.metadata as Record<string, unknown> | null;
      const kind = meta?.kind as string | undefined;
      if (isVision) return isVisionKind(kind);
      return !isVisionKind(kind);
    });

    const used = filtered.length;

    if (used >= limit) {
      const oldest = filtered[0]?.created_at;
      let retryAfter = windowSeconds;
      if (oldest) {
        const oldestMs = new Date(oldest).getTime();
        const expiresAt = oldestMs + windowSeconds * 1000;
        retryAfter = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
      }
      return {
        allowed: false,
        limit,
        used,
        remaining: 0,
        retryAfter,
        retryAfterHours: windowHours,
        windowHours,
        isVision,
        oldestAt: oldest,
      };
    }

    return { allowed: true, limit, used, remaining: limit - used, windowHours, isVision };
  } catch (e) {
    console.error("[rate-limit] exception:", e instanceof Error ? e.message : String(e));
    return { allowed: true, limit, used: 0, remaining: limit, windowHours, isVision };
  }
}

// ── Phase B: Per-Model Rate Limit ──
export async function checkModelRateLimit(
  supabase: SupabaseClient,
  userId: string | null,
  modelId: string
): Promise<ModelRateLimitResult> {
  const cfg = MODEL_LIMITS[modelId];
  // لا يوجد limit لهذا الموديل → اسمح
  if (!cfg) {
    return { allowed: true, limit: 9999, used: 0, remaining: 9999, windowHours: 24, modelId };
  }
  if (!userId) {
    // Anonymous لا يستخدم موديلات gated أصلاً (entitlement سيمنعه قبل الوصول هنا)
    // لكن نحافظ على fail-open
    return { allowed: true, limit: cfg.limit, used: 0, remaining: cfg.limit, windowHours: cfg.windowHours, modelId };
  }
  // Premium bypass
  const premium = await isPremiumUser(supabase, userId);
  if (premium) {
    return { allowed: true, limit: 1000, used: 0, remaining: 1000, windowHours: cfg.windowHours, modelId };
  }

  const windowSeconds = cfg.windowSeconds;
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

  try {
    const { data, error } = await supabase
      .from("ai_credit_ledger")
      .select("created_at, metadata")
      .eq("user_id", userId)
      .eq("reason", "ai_reserve")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      console.error("[model-rate-limit] count failed:", error.message);
      return { allowed: true, limit: cfg.limit, used: 0, remaining: cfg.limit, windowHours: cfg.windowHours, modelId };
    }

    const rows = (data ?? []) as Array<{ created_at: string; metadata: unknown }>;
    // فلترة حسب metadata.model — الصفوف القديمة بدون model لا تُحتسب (backwards compat)
    const filtered = rows.filter((r) => {
      const meta = r.metadata as Record<string, unknown> | null;
      return meta?.model === modelId;
    });

    const used = filtered.length;
    if (used >= cfg.limit) {
      const oldest = filtered[0]?.created_at;
      let retryAfter = windowSeconds;
      if (oldest) {
        const oldestMs = new Date(oldest).getTime();
        const expiresAt = oldestMs + windowSeconds * 1000;
        retryAfter = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
      }
      return {
        allowed: false,
        limit: cfg.limit,
        used,
        remaining: 0,
        retryAfter,
        retryAfterHours: cfg.windowHours,
        windowHours: cfg.windowHours,
        modelId,
        oldestAt: oldest,
      };
    }
    return { allowed: true, limit: cfg.limit, used, remaining: cfg.limit - used, windowHours: cfg.windowHours, modelId };
  } catch (e) {
    console.error("[model-rate-limit] exception:", e instanceof Error ? e.message : String(e));
    return { allowed: true, limit: cfg.limit, used: 0, remaining: cfg.limit, windowHours: cfg.windowHours, modelId };
  }
}

// ── Phase B: Per-Agent Rate Limit (abstraction آمنة) ──
export function isKnownAgentLimit(agentId: string): boolean {
  return agentId in AGENT_LIMITS;
}

export async function checkAgentRateLimit(
  supabase: SupabaseClient,
  userId: string | null,
  agentId: string
): Promise<AgentRateLimitResult> {
  const cfg = AGENT_LIMITS[agentId];
  if (!cfg) {
    return { allowed: true, limit: 9999, used: 0, remaining: 9999, windowHours: 24, agentId };
  }
  if (!userId) {
    return { allowed: true, limit: cfg.limit, used: 0, remaining: cfg.limit, windowHours: cfg.windowHours, agentId };
  }
  const premium = await isPremiumUser(supabase, userId);
  if (premium) {
    return { allowed: true, limit: 1000, used: 0, remaining: 1000, windowHours: cfg.windowHours, agentId };
  }

  const windowSeconds = cfg.windowSeconds;
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

  try {
    const { data, error } = await supabase
      .from("ai_credit_ledger")
      .select("created_at, metadata")
      .eq("user_id", userId)
      .eq("reason", "ai_reserve")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      console.error("[agent-rate-limit] count failed:", error.message);
      return { allowed: true, limit: cfg.limit, used: 0, remaining: cfg.limit, windowHours: cfg.windowHours, agentId };
    }

    const rows = (data ?? []) as Array<{ created_at: string; metadata: unknown }>;
    const filtered = rows.filter((r) => {
      const meta = r.metadata as Record<string, unknown> | null;
      return meta?.agent === agentId;
    });

    const used = filtered.length;
    if (used >= cfg.limit) {
      const oldest = filtered[0]?.created_at;
      let retryAfter = windowSeconds;
      if (oldest) {
        const oldestMs = new Date(oldest).getTime();
        const expiresAt = oldestMs + windowSeconds * 1000;
        retryAfter = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
      }
      return {
        allowed: false,
        limit: cfg.limit,
        used,
        remaining: 0,
        retryAfter,
        retryAfterHours: cfg.windowHours,
        windowHours: cfg.windowHours,
        agentId,
        oldestAt: oldest,
      };
    }
    return { allowed: true, limit: cfg.limit, used, remaining: cfg.limit - used, windowHours: cfg.windowHours, agentId };
  } catch (e) {
    console.error("[agent-rate-limit] exception:", e instanceof Error ? e.message : String(e));
    return { allowed: true, limit: cfg.limit, used: 0, remaining: cfg.limit, windowHours: cfg.windowHours, agentId };
  }
}

// ── Phase C: Guest Rate Limit ──
export async function checkGuestRateLimit(
  supabase: SupabaseClient,
  guestId: string
): Promise<GuestRateLimitResult> {
  const limit = GUEST_LIMIT;
  const windowHours = GUEST_WINDOW_HOURS;
  const windowSeconds = GUEST_WINDOW_SECONDS;
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

  try {
    const { data, error } = await supabase
      .from("ai_credit_ledger")
      .select("created_at")
      .eq("user_id", guestId)
      .eq("reason", "ai_reserve")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      console.error("[guest-rate-limit] count failed:", error.message);
      return { allowed: true, limit, used: 0, remaining: limit, windowHours };
    }

    const rows = (data ?? []) as Array<{ created_at: string }>;
    const used = rows.length;
    if (used >= limit) {
      const oldest = rows[0]?.created_at;
      let retryAfter = windowSeconds;
      if (oldest) {
        const oldestMs = new Date(oldest).getTime();
        const expiresAt = oldestMs + windowSeconds * 1000;
        retryAfter = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
      }
      return {
        allowed: false,
        limit,
        used,
        remaining: 0,
        retryAfter,
        retryAfterHours: windowHours,
        windowHours,
        oldestAt: oldest,
      };
    }
    return { allowed: true, limit, used, remaining: limit - used, windowHours };
  } catch (e) {
    console.error("[guest-rate-limit] exception:", e instanceof Error ? e.message : String(e));
    return { allowed: true, limit, used: 0, remaining: limit, windowHours };
  }
}

/**
 * بناء رسالة 429 الموحدة (توجيهية + actions) — Phase A
 */
export function buildRateLimitBody(rate: Extract<RateLimitResult, { allowed: false }>) {
  const isVision = rate.isVision;
  return {
    ok: false,
    code: "RATE_LIMIT_EXCEEDED" as const,
    error: isVision
      ? "وصلت للحد الأقصى لرفع الصور والملفات (6 طلبات كل 5 ساعات)."
      : "وصلت للحد الأقصى للرسائل المجانية (10 رسائل كل 3 ساعات).",
    message: "يمكنك الانتظار لحين تجدد الرصيد المجاني، أو الاشتراك في الخطة المدفوعة للحصول على استخدام غير محدود!",
    actions: [
      { label: "الاشتراك في الخطة المدفوعة", href: "/pricing" },
      { label: "شراء حزمة رصيد", href: "/store" },
    ],
    retryAfterHours: isVision ? FREE_VISION_WINDOW_HOURS : FREE_TEXT_WINDOW_HOURS,
    retryAfter: rate.retryAfter,
    limit: rate.limit,
    used: rate.used,
    windowHours: rate.windowHours,
  };
}

export function buildModelRateLimitBody(rate: Extract<ModelRateLimitResult, { allowed: false }>) {
  return {
    ok: false,
    code: "MODEL_RATE_LIMIT" as const,
    error: `وصلت للحد الأقصى لاستخدام هذا النموذج (${rate.modelId}) — ${rate.limit} طلبات كل ${rate.windowHours} ساعة.`,
    message: "يمكنك الانتظار لحين تجدد الرصيد، أو استخدام نموذج آخر مجاني.",
    actions: [
      { label: "تصفح النماذج المتاحة", href: "/pricing" },
      { label: "شراء حزمة رصيد", href: "/store" },
    ],
    retryAfterHours: rate.windowHours,
    retryAfter: rate.retryAfter,
    limit: rate.limit,
    used: rate.used,
    windowHours: rate.windowHours,
    modelId: rate.modelId,
  };
}

export function buildAgentRateLimitBody(rate: Extract<AgentRateLimitResult, { allowed: false }>) {
  return {
    ok: false,
    code: "AGENT_RATE_LIMIT" as const,
    error: `وصلت للحد الأقصى لاستخدام المساعد "${rate.agentId}" — ${rate.limit} طلبات كل ${rate.windowHours} ساعة.`,
    message: "يمكنك الانتظار أو تجربة مساعد آخر.",
    actions: [
      { label: "تصفح المساعدين", href: "/dashboard/agents" },
      { label: "شراء حزمة رصيد", href: "/store" },
    ],
    retryAfterHours: rate.windowHours,
    retryAfter: rate.retryAfter,
    limit: rate.limit,
    used: rate.used,
    windowHours: rate.windowHours,
    agentId: rate.agentId,
  };
}

export function buildGuestRateLimitBody(rate: Extract<GuestRateLimitResult, { allowed: false }>) {
  return {
    ok: false,
    code: "GUEST_RATE_LIMIT" as const,
    error: `وصلت للحد الأقصى للتجربة المجانية كزائر (${rate.limit} طلبات كل ${rate.windowHours} ساعة).`,
    message: "سجّل حساب مجاني الآن للحصول على 10 رسائل كل 3 ساعات + 6 صور كل 5 ساعات، وافتح مزايا إضافية!",
    actions: [
      { label: "إنشاء حساب مجاني", href: "/register" },
      { label: "تسجيل الدخول", href: "/login" },
    ],
    retryAfterHours: rate.windowHours,
    retryAfter: rate.retryAfter,
    limit: rate.limit,
    used: rate.used,
    windowHours: rate.windowHours,
  };
}
