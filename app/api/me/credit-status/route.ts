import { NextResponse } from "next/server";

import { requireUser } from "@/lib/api-guard";
import { createServiceClient } from "@/lib/supabase/admin";
import { buildCreditStatusPayload, normalizeTier } from "@/lib/upsell/credit-status";

/**
 * GET /api/me/credit-status — حالة رصيد الكريدت للـ upsell (Phase B3c).
 *
 * ⚠️ لماذا عميلان:
 *   - `entitlements` و`ai_credit_ledger`: عليهما سياسة قراءة للمالك ⇒
 *     نستخدم عميل الجلسة (لا نتجاوز RLS بلا داعٍ).
 *   - `subscription_plans`: RLS مفعّلة **بلا أي سياسة** ⇒ عميل الجلسة
 *     لا يقرأها (نفس سبب إصلاح صفحة الأدمن). نقرأ `credits_monthly`
 *     بـ service_role — بيانات تسعير عامة وليست خاصة بمستخدم.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const { user, supabase } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();
  let tier = "free";
  try {
    const { data } = await supabase
      .from("entitlements")
      .select("value")
      .eq("user_id", user.id)
      .eq("kind", "plan")
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (typeof data?.value === "string" && data.value) tier = data.value;
  } catch {
    // تعذّر القراءة → free (أسوأ حالة عرض فقط، لا تصحيح بيانات).
  }

  let creditsRemaining = 0;
  try {
    const { data } = await supabase
      .from("ai_credit_ledger")
      .select("delta")
      .eq("user_id", user.id);
    creditsRemaining = (data ?? []).reduce(
      (sum: number, row: { delta?: number | string | null }) => sum + Number(row.delta ?? 0),
      0
    );
  } catch {
    // 0 = exhausted: لا نُظهر ميزة مدفوعة بلا دليل على رصيد.
  }

  let creditsMonthly = 0;
  try {
    const service = createServiceClient();
    const { data } = await service
      .from("subscription_plans")
      .select("credits_monthly")
      .eq("plan_key", normalizeTier(tier))
      .eq("is_active", true)
      .maybeSingle();
    creditsMonthly = Number((data as { credits_monthly?: number } | null)?.credits_monthly ?? 0);
  } catch {
    // صفر يعني "لا نعرف الحد" → الحالة ok بدل إنذار كاذب.
  }

  return NextResponse.json(
    buildCreditStatusPayload({ tier, creditsRemaining, creditsMonthly }),
    { headers: { "Cache-Control": "no-store" } }
  );
}
