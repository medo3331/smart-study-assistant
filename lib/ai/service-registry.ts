/**
 * lib/ai/service-registry.ts — سجل خدمات الـ AI الجديدة (صور/مخططات/ملفات)
 *
 * تعريف كل خدمة + حدود الباقات (Free / Pro / Ultra) + عدّاد يومي
 * للاستهلاك. الباقة بتتحل من جدول entitlements الحالي:
 *   - plan:ultra                     → Ultra
 *   - plan:pro / plan:premium /
 *     feature:premium-ai             → Pro
 *   - غير كده                        → Free
 *
 * العدّادات في الذاكرة (نفس أسلوب lib/api-guard.ts) — كافية للحجم الحالي،
 * ولو الموقع كبر بيتبدل لحل مركزي (Redis/Upstash) من غير تغيير الواجهة.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImageModel } from "./image-generator";

export type ServiceTier = "free" | "pro" | "ultra";

export type AiServiceId =
  | "image"
  | "diagram"
  | "file_pdf"
  | "file_docx"
  | "file_xlsx"
  | "file_pptx";

export interface ServiceDefinition {
  id: AiServiceId;
  labelAr: string;
  /** الحد اليومي لكل باقة — Infinity = غير محدود عمليًا. */
  dailyLimits: Record<ServiceTier, number>;
  /** رسائل مساعدة للواجهة. */
  upgradeHintAr?: string;
}

/** عمليًا "غير محدود" = سقف كبير يمنع إساءة الاستخدام. */
const UNLIMITED = 1000;

export const SERVICE_REGISTRY: Record<AiServiceId, ServiceDefinition> = {
  image: {
    id: "image",
    labelAr: "توليد الصور التعليمية",
    // الصور بقت متاحة مجانًا عبر مزوّد Pollinations المجاني؛ الباقات
    // المدفوعة بتزوّد الحد وتفتح الموديلات الأعلى جودة.
    dailyLimits: { free: 3, pro: 5, ultra: UNLIMITED },
    upgradeHintAr:
      "باقة Pro بتديك 5 صور يوميًا بموديلات أعلى، وباقة Ultra بلا حدود.",
  },
  diagram: {
    id: "diagram",
    labelAr: "توليد المخططات والخرائط الذهنية",
    dailyLimits: { free: 3, pro: 20, ultra: UNLIMITED },
    upgradeHintAr: "ترقية الباقة تزود عدد المخططات المتاحة يوميًا.",
  },
  file_pdf: {
    id: "file_pdf",
    labelAr: "تحميل ملفات PDF",
    dailyLimits: { free: 5, pro: 50, ultra: UNLIMITED },
  },
  file_docx: {
    id: "file_docx",
    labelAr: "تحميل ملفات Word",
    dailyLimits: { free: 0, pro: 20, ultra: UNLIMITED },
    upgradeHintAr: "تصدير Word متاح في باقة Pro وباقة Ultra.",
  },
  file_xlsx: {
    id: "file_xlsx",
    labelAr: "تحميل ملفات Excel",
    dailyLimits: { free: 0, pro: 20, ultra: UNLIMITED },
    upgradeHintAr: "تصدير Excel متاح في باقة Pro وباقة Ultra.",
  },
  file_pptx: {
    id: "file_pptx",
    labelAr: "تحميل عروض PowerPoint",
    dailyLimits: { free: 0, pro: 10, ultra: UNLIMITED },
    upgradeHintAr: "تصدير PowerPoint متاح في باقة Pro وباقة Ultra.",
  },
};

/**
 * موديلات الصور المتاحة لكل باقة — حسب مصفوفة الخطة.
 * الترتيب = الأولوية: المجاني (Pollinations) متاح للكل، والمدفوعين
 * بيتفتحوا حسب الباقة.
 */
export const IMAGE_MODELS_BY_TIER: Record<ServiceTier, ImageModel[]> = {
  free: ["pollinations"],
  pro: ["pollinations", "stable-diffusion-xl"],
  ultra: ["dall-e-3", "flux-pro", "pollinations", "stable-diffusion-xl"],
};

// ============================================
// تحديد الباقة من الـ entitlements
// ============================================
async function rpcHasEntitlement(
  supabase: SupabaseClient,
  userId: string,
  kind: string,
  value: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("has_entitlement", {
      p_user_id: userId,
      p_kind: kind,
      p_value: value,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function resolveServiceTier(
  supabase: SupabaseClient,
  userId: string | null
): Promise<ServiceTier> {
  if (!userId) return "free";
  try {
    if (await rpcHasEntitlement(supabase, userId, "plan", "ultra")) return "ultra";
    if (await rpcHasEntitlement(supabase, userId, "plan", "pro")) return "pro";
    // توافق مع نظام الباقات الحالي (premium)
    if (await rpcHasEntitlement(supabase, userId, "plan", "premium")) return "pro";
    if (await rpcHasEntitlement(supabase, userId, "feature", "premium-ai")) return "pro";
  } catch (err) {
    // fail-open على باقة Free لو الـ DB واقع — لا نعطّل الخدمة
    console.warn("[Service Registry] tier resolution failed:", (err as Error).message);
  }
  return "free";
}

// ============================================
// عدّادات الاستهلاك اليومية (في الذاكرة)
// ============================================
const usage = new Map<string, number>();
const MAX_TRACKED_KEYS = 5000;

function dayKeyUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextResetUtc(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}

function trimUsageMap() {
  if (usage.size <= MAX_TRACKED_KEYS) return;
  // أمسح أقدم المفاتيح تقريبيًا (الترتيب في الـ Map = ترتيب الإدخال)
  const overflow = usage.size - MAX_TRACKED_KEYS;
  let removed = 0;
  for (const key of usage.keys()) {
    if (removed >= overflow) break;
    usage.delete(key);
    removed++;
  }
}

export type ServiceQuotaResult =
  | { allowed: true; remaining: number; limit: number; tier: ServiceTier; resetAtUtc: string }
  | { allowed: false; remaining: 0; limit: number; tier: ServiceTier; resetAtUtc: string; reasonAr: string };

/**
 * فحص + خصم في نفس الخطوة — بيستدعيها الراوت بعد نجاح التحقق من المستخدم.
 * الخصم بيحصل قبل التنفيذ الفعلي للخدمة (نفس فلسفة حجز الرصيد في
 * ai-credit-guard)، والخدمة الغالية (الصور) بتتحسب حتى لو المزوّد فشل،
 * وده متعمد عشان نمنع إعادة المحاولة اللانهائية على حساب المزوّد.
 */
export async function consumeServiceQuota(
  supabase: SupabaseClient,
  userId: string | null,
  service: AiServiceId
): Promise<ServiceQuotaResult> {
  const def = SERVICE_REGISTRY[service];
  const tier = await resolveServiceTier(supabase, userId);
  const limit = def.dailyLimits[tier];
  const resetAtUtc = nextResetUtc();

  if (limit <= 0) {
    return {
      allowed: false,
      remaining: 0,
      limit,
      tier,
      resetAtUtc,
      reasonAr:
        def.upgradeHintAr ?? "الخدمة دي غير متاحة في باقتك الحالية — راجع صفحة الباقات.",
    };
  }

  const key = `${userId ?? "anon"}:${service}:${dayKeyUtc()}`;
  const used = usage.get(key) ?? 0;

  if (used >= limit) {
    return {
      allowed: false,
      remaining: 0,
      limit,
      tier,
      resetAtUtc,
      reasonAr: `وصلت للحد اليومي من ${def.labelAr} (${limit}). بيتجدد الحد يوميًا بتوقيت UTC.`,
    };
  }

  usage.set(key, used + 1);
  trimUsageMap();

  return { allowed: true, remaining: limit - used - 1, limit, tier, resetAtUtc };
}

/**
 * استرجاع خصم واحد لو الخدمة فشلت قبل ما تتنفذ فعليًا
 * (مثلًا: حجز الكريدت اتقبل لكن الموديل وقع). الخدمات الغالية
 * (الصور) ما بنعملهاش استرجاع عن قصد — راجع تعليق الاستهلاك.
 */
export function refundServiceQuota(
  userId: string | null,
  service: AiServiceId
): void {
  const key = `${userId ?? "anon"}:${service}:${dayKeyUtc()}`;
  const used = usage.get(key) ?? 0;
  if (used > 0) usage.set(key, used - 1);
}

/** استعلام بدون خصم — للواجهات اللي عايزة تعرض الرصيد المتبقي. */
export async function peekServiceQuota(
  supabase: SupabaseClient,
  userId: string | null,
  service: AiServiceId
): Promise<{ used: number; limit: number; tier: ServiceTier }> {
  const tier = await resolveServiceTier(supabase, userId);
  const limit = SERVICE_REGISTRY[service].dailyLimits[tier];
  const used = usage.get(`${userId ?? "anon"}:${service}:${dayKeyUtc()}`) ?? 0;
  return { used: Math.min(used, limit), limit, tier };
}
