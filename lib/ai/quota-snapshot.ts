// lib/ai/quota-snapshot.ts
//
// 📊 قراءة رصيد الكوتة **بدون استهلاك** — للعرض في الواجهة (شريط
// الاستهلاك). دي مختلفة عن consume_subscription_quota اللي بتحسب
// استهلاك فعلي.
//
// سيرفر بس — بتقرا من entitlements و subscription_plans و
// subscription_quotas بالمفتاح المميز. منطق الـ reset اليومي مطابق
// للـ RPC: لو last_reset_at قبل بداية النهارده، العدّاد يبقى 0.

import { createServiceClient } from "@/lib/supabase/admin";
import type { QuotaKind } from "@/lib/ai/quota-check";

export interface QuotaSnapshot {
  /** الاستخدام الحالي اليومي — بعد احتساب الـ reset. */
  used: number;
  /** -1 = بلا حد (مشتركون / مالك / خطة مش محددة لها حد). */
  limit: number;
  /** وقت تجديد الكوتة (بداية اليوم التالي UTC) أو null. */
  resetAt: string | null;
  planKey: string;
}

const DAILY_COLUMN: Record<QuotaKind, "messages_24h" | "uploads_today" | "pages_24h"> = {
  message: "messages_24h",
  upload: "uploads_today",
  page: "pages_24h",
};

const PLAN_COLUMN: Record<QuotaKind, "messages_daily" | "uploads_daily" | "pages_daily"> = {
  message: "messages_daily",
  upload: "uploads_daily",
  page: "pages_daily",
};

/** يقرا الرصيد الحالي بدون استهلاك — fail-safe: أي خطأ = بلا حد مخفي. */
export async function readQuotaSnapshot(
  userId: string,
  kind: QuotaKind,
): Promise<QuotaSnapshot> {
  const privileged = createServiceClient();
  const now = new Date();
  const dayStartIso = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();

  // ١) خطة المستخدم (أحدث entitlement من نوع plan).
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
    // plan stays "free"
  }

  // ٢) حد الخطة (null = بلا حد).
  let limit = -1;
  try {
    const { data: plan } = await privileged
      .from("subscription_plans")
      .select(`${PLAN_COLUMN[kind]}, is_active, version`)
      .eq("plan_key", planKey)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const planLimit = (plan as Record<string, unknown> | null)?.[PLAN_COLUMN[kind]];
    if (typeof planLimit === "number") limit = planLimit;
  } catch {
    // limit stays -1 (بلا حد) — fail-safe للعرض.
  }

  // ٣) الاستخدام اليومي — مع الـ lazy reset (زي منطق الـ RPC).
  let used = 0;
  try {
    const { data: row } = await privileged
      .from("subscription_quotas")
      .select("messages_24h, uploads_today, pages_24h, last_reset_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (row) {
      const lastReset = row.last_reset_at ? new Date(row.last_reset_at) : null;
      const reset = !lastReset || lastReset.toISOString() < dayStartIso;
      used = reset ? 0 : ((row[DAILY_COLUMN[kind]] as number | null) ?? 0);
    }
  } catch {
    // used stays 0
  }

  const tomorrowIso = new Date(Date.parse(dayStartIso) + 24 * 3600 * 1000).toISOString();
  return { used, limit, resetAt: limit >= 0 ? tomorrowIso : null, planKey };
}
