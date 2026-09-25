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
    const planKey = typeof ent?.value === "string" && ent.value ? ent.value : "free";

    // 3) الحدود من subscription_plans، مع fallback مطابق للـseeds لو الجدول مش متاح
    const { data: planRow } = await privileged
      .from("subscription_plans")
      .select("messages_per_2h, uploads_daily")
      .eq("plan_key", planKey)
      .maybeSingle();

    let limit: number;
    if (kind === "message") {
      const per2h = typeof planRow?.messages_per_2h === "number"
        ? planRow.messages_per_2h
        : (FALLBACK_MESSAGES_PER_2H[planKey] ?? FALLBACK_MESSAGES_PER_2H.free);
      limit = per2h * WINDOWS_PER_DAY; // حد يومي مكافئ — قرار موثق أعلى الملف
    } else {
      limit = typeof planRow?.uploads_daily === "number"
        ? planRow.uploads_daily
        : (FALLBACK_UPLOADS_DAILY[planKey] ?? FALLBACK_UPLOADS_DAILY.free);
    }

    // 4) فرض الحد
    if (used >= limit) {
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

    // 5) استهلاك 1 من الكوتا (upsert على user_id)
    const nextMessages = kind === "message" ? used + 1 : (quotaRow?.messages_24h ?? 0);
    const nextUploads = kind === "upload" ? used + 1 : (quotaRow?.uploads_today ?? 0);
    await privileged.from("subscription_quotas").upsert({
      user_id: userId,
      plan_key: planKey,
      messages_24h: nextMessages,
      uploads_today: nextUploads,
      last_reset_at: resetAt ?? now.toISOString(),
      updated_at: now.toISOString(),
    }, { onConflict: "user_id" });

    return { allowed: true, kind, planKey, used: used + 1, limit, resetAt };
  } catch (e) {
    // fail-open موثق: لو جداول الكوتا مش متنفذة بعد، الشات/الرفع ميقعوش.
    console.warn("[quota-check] subscription quota unavailable — allowing (fail-open, documented):", e);
    return { allowed: true, kind, planKey: "unknown", used: 0, limit: -1, resetAt: null };
  }
}
