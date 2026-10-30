import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { createServiceClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const { user, response: authError } = await requireUser("message");
  if (authError) return authError;

  const privileged = createServiceClient();
  const now = new Date().toISOString();

  // quota row
  const { data: q } = await privileged
    .from("subscription_quotas")
    .select("messages_24h, messages_monthly, uploads_today, last_daily_reset_at, last_monthly_reset_at, plan_key")
    .eq("user_id", user.id)
    .maybeSingle();

  // effective plan
  const { data: ent } = await privileged
    .from("entitlements")
    .select("value")
    .eq("user_id", user.id)
    .eq("kind", "plan")
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let planKey = (typeof ent?.value === "string" && ent.value) ? ent.value : (q?.plan_key || "free");

  const { data: plan } = await privileged
    .from("subscription_plans")
    .select("messages_daily, messages_monthly, messages_per_2h")
    .eq("plan_key", planKey)
    .eq("is_active", true)
    .lte("effective_date", now)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const fallback = (plan && plan.messages_per_2h && plan.messages_per_2h > 0) ? plan.messages_per_2h : 20;
  const dailyLimit = (plan && plan.messages_daily && plan.messages_daily > 0) ? plan.messages_daily : fallback;
  const monthlyLimit = (plan && plan.messages_monthly && plan.messages_monthly > 0) ? plan.messages_monthly : (fallback * 30);

  const dailyUsed = q?.messages_24h ?? 0;
  const monthlyUsed = q?.messages_monthly ?? 0;

  return NextResponse.json({
    ok: true,
    planKey,
    daily: {
      used: dailyUsed,
      limit: dailyLimit,
      resetAt: q?.last_daily_reset_at ?? null,
    },
    monthly: {
      used: monthlyUsed,
      limit: monthlyLimit,
      resetAt: q?.last_monthly_reset_at ?? null,
    },
    uploads: {
      used: q?.uploads_today ?? 0,
    },
  });
}
