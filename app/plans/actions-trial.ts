"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Phase 0.5 — Premium Trial claim using existing DB RPC.
 * Server-authoritative: only auth.uid() is used; no client-controlled params.
 */
export async function claimPremiumTrial() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, code: "unauthorized" as const, message: "غير مصرح" };
  }

  try {
    // Call the atomic DB RPC directly (security definer handles authorization)
    const { data, error } = await supabase.rpc("claim_premium_trial");
    // The RPC returns a single row with columns: ok, code, spent, balance, expires_at, trial_ref
    // Since it's a table-returning function, result is array of rows
    if (error) {
      return { ok: false, code: "error" as const, message: error.message };
    }
    if (!data || data.length === 0) {
      return { ok: false, code: "error" as const, message: "لا توجد نتيجة من الخادم" };
    }
    const row = data[0] as Record<string, unknown>;
    const ok = Boolean(row.ok);
    const code = String(row.code ?? "unknown");
    const spent = typeof row.spent === "number" ? row.spent : 0;
    const balance = typeof row.balance === "number" ? row.balance : 0;
    const expiresAt = row.expires_at ? String(row.expires_at) : null;
    const trialRef = row.trial_ref ? String(row.trial_ref) : null;

    if (!ok) {
      const messageMap: Record<string, string> = {
        unauthorized: "غير مصرح — سجّل دخول أولًا",
        already_claimed: "لقد استخدمت تجربة Premium المجانية من قبل.",
        insufficient_coins: "تحتاج إلى 500 Coins لاستخدام تجربة Premium.",
        error: "حدث خطأ أثناء التفعيل. حاول مرة أخرى.",
      };
      return {
        ok: false,
        code: code as "unauthorized" | "already_claimed" | "insufficient_coins" | "error",
        message: messageMap[code] ?? "حدث خطأ أثناء التفعيل.",
        spent: 0,
        balance,
        expiresAt: null,
        trialRef: null,
      };
    }

    return {
      ok: true,
      code: "success" as const,
      message: "تم تفعيل Premium لمدة 7 أيام 🎉",
      spent,
      balance,
      expiresAt: expiresAt ? String(expiresAt) : null,
      trialRef: trialRef ? String(trialRef) : null,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, code: "error" as const, message: msg, spent: 0, balance: 0, expiresAt: null, trialRef: null };
  }
}
