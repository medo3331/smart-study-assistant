import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveServiceTier, SERVICE_REGISTRY, peekServiceQuota } from "@/lib/ai/service-registry";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tier = await resolveServiceTier(supabase, user.id);

  const { data: ledger } = await supabase
    .from("ai_credit_ledger")
    .select("delta")
    .eq("user_id", user.id);
  const credits = (ledger ?? []).reduce((s: number, r: { delta: number }) => s + (r.delta ?? 0), 0);

  const services = Object.keys(SERVICE_REGISTRY) as (keyof typeof SERVICE_REGISTRY)[];
  const usage = await Promise.all(
    services.map(async (id) => {
      const limit = SERVICE_REGISTRY[id].dailyLimits[tier];
      const q = await peekServiceQuota(supabase, user.id, id as any);
      return { id, label: SERVICE_REGISTRY[id].labelAr, limit, used: q.used, remaining: Math.max(0, limit - q.used) };
    })
  );

  return NextResponse.json({ tier, credits, services: usage });
}