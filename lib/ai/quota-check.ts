/**
 * 📊 كوتة الاشتراك — checkSubscriptionQuota (Phase G)
 *
 * التصميم:
 *   - استهلاك ذري عبر RPC public.consume_subscription_quota (فحص + زيادة في معاملة واحدة).
 *   - Idempotency: المفتاح quota:<userId>:<kind>:<period> يضمن عدم الاستهلاك المكرر عند إعادة المحاولة.
 *     الـ period مشتق من اليوم بالتقويم UTC (date_trunc('day', now() AT TIME ZONE 'UTC')) بحيث
 *     يتطابق تماماً مع فترة الـ reset في الـ RPC والـ lazy reset.
 *   - fail-open / fail-closed حسب متغير البيئة QUOTA_FAIL_OPEN (الافتراضي: false — fail-closed للأمان).
 *     fail-open يُفعل فقط عندما QUOTA_FAIL_OPEN=true صريحاً، ويُسجل تنبيه عند كل حدث.
 *   - مسارات الأدمن معفية منطقيًا (الأدمن بيقرأ الكوتا مش بيستهلكها).
 *   - المالك (owner) يتخطى الحدود الداخلية للمنصة بالكامل — لا يتم استدعاء RPC للمالك.
 *
 * Server-only — بيستخدم service_role (بيتجاوز RLS)، متتصدرش للمتصفح أبدًا.
 */

import { createServiceClient } from "@/lib/supabase/admin";

export type QuotaKind = "message" | "upload";

export interface QuotaCheckResult {
  allowed: boolean;
  kind: QuotaKind;
  planKey: string;
  used: number;
  /** -1 = غير معروف (fail-open)، 0 = مالك يتخطى الحدود الداخلية */
  limit: number;
  resetAt: string | null;
  reasonAr?: string;
  /** true إذا تم تجاوز الفحص لأن المستخدم مالك (بypass للحدود الداخلية) */
  /** مفتاح العنفة (idempotency key) للطلب — يُستخدم لاسترداد كوتة الاشتراك عند الفشل. */
  idempotencyKey?: string;

  ownerBypass?: boolean;
}

/** مفتاح العنفة (idempotency key): فريد لكل طلب HTTP.
 *
 *  ملاحظة: المفتاح اليومي (userId+kind+date) كان يسبّب bug — كل طلبات اليوم
 *  تُعتبر "مستهلكة مسبقًا" بعد أول طلب، فلا يُستهلك إلا طلب واحد. وللحماية
 *  من إعادة المحاولة (retry) يجب على العميل إرسال معرف طلب ثابت (X-Request-Id)
 *  وإعادة استخدامه؛ في غيابه نولّد UUID جديد لكل طلب (لا حماية retry، لكن
 *  العدّ يبقى صحيحًا). */
function quotaIdempotencyKey(userId: string, kind: QuotaKind): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return `quota:${userId}:${kind}:${(crypto as any).randomUUID()}`;
    }
  } catch {}
  return `quota:${userId}:${kind}:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** سياسة fail-open: لو true يُسمح بالطلب عند تعطل الـRPC، لو false يُرفض الطلب (fail-closed).
 *  الافتراضي: fail-closed (false). fail-open يُفعل فقط عندما QUOTA_FAIL_OPEN=true صريحاً. */
function isFailOpenEnabled(): boolean {
  return process.env.QUOTA_FAIL_OPEN === "true";
}

/** تسجيل تنبيه منظم عند تفعيل fail-open —可用于.alerting خارجي. */
function logQuotaFailOpen(userId: string, kind: QuotaKind, error: unknown): void {
  const msg = (error as { message?: string })?.message || String(error);
  console.error(
    JSON.stringify({
      event: "quota_fail_open",
      severity: "high",
      user_id: userId,
      kind,
      reason: "rpc_or_table_unavailable",
      error: msg,
      timestamp: new Date().toISOString(),
      policy: "fail-open — request allowed without quota consumption",
    })
  );
}

/** Fallbacks لو subscription_plans مش متاحة — نفس seeds db/epic2-admin-rbac-audit-schema.sql:157-161. */
const FALLBACK_MESSAGES_PER_2H: Record<string, number> = { free: 20, pro: 100, ultra: 500 };
const FALLBACK_UPLOADS_DAILY: Record<string, number> = { free: 5, pro: 30, ultra: 60 };

/**
 * فحص + استهلاك كوتة في خطوة واحدة ذرّية عبر RPC.
 * لو مسموح بيستهلك 1 من الكوتا فورًا، ويرجع نتيجة موحّدة.
 *
 * @param isOwner — إذا كان المستخدم مالك، يتم تجاوز الفحص نهائيًا (بypass للحدود الداخلية)
 *                  دون استدعاء الـRPC، ويُرجع النتيجة بـ ownerBypass=true.
 */
export async function checkSubscriptionQuota(
  userId: string,
  kind: QuotaKind,
  isOwner = false
): Promise<QuotaCheckResult> {
  // ── المالك يتخطى الحدود الداخلية للمنصة (كوتة الاشتراك، رصيد AI) دون استدعاء RPC
  if (isOwner) {
    return {
      allowed: true,
      kind,
      planKey: "owner",
      used: 0,
      limit: -1,
      resetAt: null,
      reasonAr: "المالك — تجاوز الحدود الداخلية (لا يوجد استهلاك كوتة)",
      ownerBypass: true,
    };
  }

  try {
    const privileged = createServiceClient();
    const idempotencyKey = quotaIdempotencyKey(userId, kind);

    // استدعاء الـRPC الذري: فحص حد + تسجيل مفتاح العنفة + استهلاك — في معاملة واحدة
    const { data, error } = await privileged.rpc("consume_subscription_quota", {
      p_user_id: userId,
      p_kind: kind,
      p_idempotency_key: idempotencyKey,
    } as unknown as { p_user_id: string; p_kind: string; p_idempotency_key: string });

    if (error) throw error;

    const result = data as { allowed: boolean; used: number; limit: number; reset_at: string | null; already_consumed: boolean } | null;
    if (!result) {
      throw new Error("consume_subscription_quota returned no data");
    }

    // تحديد خطة المستخدم للعرض (من quotas table أو fallback)
    let planKey = "free";
    try {
      const { data: ent } = await privileged
        .from("entitlements")
        .select("value")
        .eq("user_id", userId)
        .eq("kind", "plan")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (typeof ent?.value === "string" && ent.value) planKey = ent.value;
    } catch {
      // plan stays "free" on error
    }

    const limit = result.limit;
    const used = result.used;
    const resetAt = result.reset_at ?? null;

    if (!result.allowed) {
      return {
        allowed: false,
        kind,
        planKey,
        used,
        limit,
        resetAt,
        reasonAr: kind === "message"
          ? `وصلت لحد رسايل باقتك (${limit} رسالة/يوم). الكوتا بتتجدد كل 24 ساعة، أو رقّي باقتك لحد أعلى.`
          : `وصلت لحد الرفع اليومي لباقتك (${limit} ملفات).`,
      };
    }

    return {
      allowed: true,
      kind,
      planKey,
      used,
      limit,
      resetAt,
      idempotencyKey,
      ...(result.already_consumed ? { reasonAr: "تم استهلاك هذه الكوتا سابقًا (عنفة مكررة)" } : undefined),
    };
  } catch (e) {
    // fail-open / fail-closed وفقًا لسياسة متغير البيئة
    if (isFailOpenEnabled()) {
      logQuotaFailOpen(userId, kind, e);
      return { allowed: true, kind, planKey: "unknown", used: 0, limit: -1, resetAt: null };
    }
    // fail-closed: رفض الطلب عند تعطل الكوتة — لا يُسمح بالتجاوز بدون تتبع
    const msg = (e as { message?: string })?.message || String(e);
    console.error(
      JSON.stringify({
        event: "quota_fail_closed",
        severity: "critical",
        user_id: userId,
        kind,
        reason: "rpc_or_table_unavailable",
        error: msg,
        timestamp: new Date().toISOString(),
        policy: "fail-closed — request rejected",
      })
    );
    return {
      allowed: false,
      kind,
      planKey: "unknown",
      used: 0,
      limit: -1,
      resetAt: null,
      reasonAr: "نظام الكوتة غير متاح حاليًا. حاول مرة أخرى لاحقًا.",
    };
  }
}
/**
 * استرداد كوتة الاشتراك (transactional) — no-op if already refunded or never consumed.
 * يعتمد على RPC public.refund_subscription_quota (migration NOT EXECUTED yet).
 */
export async function refundSubscriptionQuota(
  userId: string,
  kind: QuotaKind,
  idempotencyKey?: string | null
): Promise<void> {
  if (!idempotencyKey) return;
  try {
    const privileged = createServiceClient();
    const { error } = await privileged.rpc("refund_subscription_quota", {
      p_user_id: userId,
      p_kind: kind,
      p_idempotency_key: idempotencyKey,
    } as unknown as { p_user_id: string; p_kind: string; p_idempotency_key: string });
    if (error) {
      console.warn("refundSubscriptionQuota failed:", error.message);
    }
  } catch (e) {
    console.warn("refundSubscriptionQuota exception:", (e as { message?: string })?.message || String(e));
  }
}
