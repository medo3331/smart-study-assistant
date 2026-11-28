import { NextResponse } from "next/server";

import { requireUser } from "@/lib/api-guard";
import { createServiceClient } from "@/lib/supabase/admin";
import { normalizeTier } from "@/lib/upsell/credit-status";
import {
  buildCreditsSummary,
  type EntitlementRow,
  type LedgerRow,
  type PlanInfo,
} from "@/lib/credits/credits-summary";

/**
 * GET /api/me/credits — رصيد الكريديت والاستهلاك بالتفصيل.
 *
 * المصادر:
 *   - `ai_credit_ledger` و`entitlements`: سياسات RLS تسمح بالقراءة للمالك
 *     ⇒ عميل الجلسة (نفس نمط `/api/me/credit-status`).
 *   - `subscription_plans`: لا سياسة قراءة للعميل ⇒ service_role لبيانات
 *     تسعير عامة فقط (credits_monthly / الأسماء).
 *
 * الرصيد يُحسب من الـ ledger نفسه (نفس معادلة `ai_credit_balance`)،
 * وفشل أي جزء اختياري لا يسقط الاستجابة كلها.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const { user, supabase } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  const [ledgerRes, entRes] = await Promise.all([
    supabase
      .from("ai_credit_ledger")
      .select("delta, reason, ref_id, metadata, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("entitlements")
      .select("value, expires_at")
      .eq("user_id", user.id)
      .eq("kind", "plan")
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (ledgerRes.error) {
    return NextResponse.json({ error: "ledger_unavailable" }, { status: 503 });
  }

  const entitlement: EntitlementRow | null = (entRes.data as EntitlementRow | null) ?? null;
  const tier = (entitlement?.value ?? "free").trim() || "free";

  let plan: PlanInfo | null = null;
  try {
    const service = createServiceClient();
    const { data } = await service
      .from("subscription_plans")
      .select("plan_key, name, display_name_ar, credits_monthly")
      .eq("plan_key", normalizeTier(tier))
      .eq("is_active", true)
      .maybeSingle();
    plan = (data as PlanInfo | null) ?? null;
  } catch {
    // بيانات الباقة اختيارية للعرض — فشلها لا يسقط الرصيد والاستهلاك.
  }

  const summary = buildCreditsSummary({
    ledger: (ledgerRes.data ?? []) as LedgerRow[],
    entitlement,
    plan,
    now,
  });

  return NextResponse.json(
    { ok: true, ...summary },
    { headers: { "Cache-Control": "no-store" } }
  );
}
