"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export interface QuotaCheckResult {
  ok: boolean;
  allowed: boolean;
  messages_24h: number;
  uploads_today: number;
  plan_key: string;
  last_reset_at: string | null;
  error?: string;
}

/** Lazy reset + subscription quota check (EPIC-2/3 enforcement). */
export async function checkSubscriptionQuota(userId: string): Promise<QuotaCheckResult> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
    );

    // 1) Read current quota
    const { data: quotaRow } = await supabase
      .from("subscription_quotas")
      .select("messages_24h, uploads_today, last_reset_at")
      .eq("user_id", userId)
      .maybeSingle();

    const now = new Date();
    let messages_24h = (quotaRow as any)?.messages_24h || 0;
    let uploads_today = (quotaRow as any)?.uploads_today || 0;
    let lastResetStr = (quotaRow as any)?.last_reset_at || null;

    // 2) Lazy reset (no external cron)
    if (lastResetStr) {
      const lastReset = new Date(lastResetStr);
      if (now.getTime() - lastReset.getTime() > 24 * 3600 * 1000) {
        messages_24h = 0;
        uploads_today = 0;
        lastResetStr = now.toISOString();
        // Update DB silently
        await supabase.from("subscription_quotas").upsert({
          user_id: userId,
          plan_key: (await supabase.from("entitlements").select("value").eq("user_id", userId).eq("kind", "plan").order("created_at", { ascending: false }).limit(1).maybeSingle()).data?.value || "free",
          messages_24h: 0,
          uploads_today: 0,
          last_reset_at: now.toISOString(),
          updated_at: now.toISOString(),
        }, { onConflict: "user_id" });
      }
    }

    // 3) Plan limits
    const { data: ent } = await supabase
      .from("entitlements")
      .select("value")
      .eq("user_id", userId)
      .eq("kind", "plan")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const planKey = ent?.value || "free";

    const limits: Record<string, number> = { free: 20, pro: 100, ultra: 500 };
    const msgLimit = limits[planKey] || 20;

    const allowed = messages_24h < msgLimit;

    return {
      ok: true,
      allowed,
      messages_24h,
      uploads_today,
      plan_key: planKey,
      last_reset_at: lastResetStr,
    };
  } catch (e: any) {
    return { ok: false, allowed: false, messages_24h: 0, uploads_today: 0, plan_key: "free", last_reset_at: null, error: e?.message || String(e) };
  }
}
