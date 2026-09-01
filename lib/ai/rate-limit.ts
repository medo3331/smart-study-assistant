/**
 * Phase H.2 — Per-User AI Rate Limit Engine (Windowed)
 *
 * Free Tier Rules (مواصفات 2 سبتمبر 2026):
 *   - Text (chat/tutor/explain...): 10 طلبات / 3 ساعات (sliding window)
 *   - Vision/Files (OCR/Vision/Files): 6 طلبات / 5 ساعات (sliding window)
 * Premium: غير محدود (أو حد عالي جداً) — يوحّد مع has_entitlement
 *
 * القاعدة الذهبية:
 *   - Server-side فقط — لا ثقة بالكلاينت
 *   - يفحص قبل reserve_ai_credit — فلو 429 لا يستهلك Credit
 *   - Sliding window: العد من ai_credit_ledger (reason='ai_reserve') حسب metadata.kind
 *   - Fail-open على خطأ DB مؤقت مع log (لا نعطل الخدمة)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── حدود الخطة المجانية ──
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

export type RateLimitOpts = {
  isVisionOrFile?: boolean;
};

export type RateLimitResult =
  | { allowed: true; limit: number; used: number; remaining: number; windowHours: number; isVision: boolean }
  | { allowed: false; limit: number; used: number; remaining: 0; retryAfter: number; retryAfterHours: number; windowHours: number; isVision: boolean; oldestAt?: string };

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
    // Anonymous: نطبق نفس حدود Free (لكن caller يقرر هل يسمح لـ anon أصلاً)
    return isVisionOrFile
      ? { limit: FREE_VISION_LIMIT, windowHours: FREE_VISION_WINDOW_HOURS, windowSeconds: FREE_VISION_WINDOW_SECONDS }
      : { limit: FREE_TEXT_LIMIT, windowHours: FREE_TEXT_WINDOW_HOURS, windowSeconds: FREE_TEXT_WINDOW_SECONDS };
  }
  const premium = await isPremiumUser(supabase, userId);
  if (premium) {
    // غير محدود — نرجع حد عالي جداً ولا نمنع
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
 * فحص هل المستخدم تجاوز الحد الزمني (sliding window)
 * العد من ai_credit_ledger حيث reason='ai_reserve' و metadata.kind يطابق النوع
 * المرتجعات (ai_refund) لا تُحسب — لأن refund يعني الطلب فشل
 */
export async function checkAiRateLimit(
  supabase: SupabaseClient,
  userId: string | null,
  opts?: RateLimitOpts
): Promise<RateLimitResult> {
  const isVision = opts?.isVisionOrFile ?? false;

  if (!userId) {
    // Anonymous: لا حد window في هذه المرحلة — يبقى free models مجانًا
    const cfg = await resolveAiWindowLimit(supabase, null, isVision);
    return { allowed: true, limit: cfg.limit, used: 0, remaining: cfg.limit, windowHours: cfg.windowHours, isVision };
  }

  const cfg = await resolveAiWindowLimit(supabase, userId, isVision);
  const limit = cfg.limit;
  const windowHours = cfg.windowHours;
  const windowSeconds = cfg.windowSeconds;

  // Premium unlimited — اسمح دائماً
  if (limit >= 1000) {
    return { allowed: true, limit, used: 0, remaining: limit, windowHours, isVision };
  }

  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

  try {
    // نجلب الصفوف داخل النافذة ثم نفلتر حسب النوع (metadata.kind)
    // النافذة صغيرة (3-5 ساعات) → عدد الصفوف قليل (≤ limit) → آمن
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
      // Fail-open مع log — لا نعطل الخدمة بسبب عطل DB مؤقت
      return { allowed: true, limit, used: 0, remaining: limit, windowHours, isVision };
    }

    const rows = (data ?? []) as Array<{ created_at: string; metadata: unknown }>;
    // فلترة حسب النوع: vision bucket يعد vision/file/image فقط، text bucket يعد text أو بدون kind
    const filtered = rows.filter((r) => {
      const meta = r.metadata as Record<string, unknown> | null;
      const kind = meta?.kind as string | undefined;
      if (isVision) return isVisionKind(kind);
      // text: كل ما ليس vision
      return !isVisionKind(kind);
    });

    const used = filtered.length;

    if (used >= limit) {
      // حساب Retry-After من أقدم طلب في النافذة
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

/**
 * بناء رسالة 429 الموحدة (توجيهية + actions)
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
