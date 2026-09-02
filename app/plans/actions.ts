"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

const FREE_KEY = "billing_free_period_enabled";
const PAY_KEY = "billing_payments_enabled";

function safeBool(raw: unknown): boolean {
  if (raw === null || raw === undefined) return false;
  const s = String(raw).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

export async function readBillingSettings() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("app_settings").select("key,value").in("key", [FREE_KEY, PAY_KEY]);
    if (error || !data || data.length === 0) {
      return { freePeriodEnabled: true, paymentsEnabled: false, source: "default" };
    }
    const byKey = new Map((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
    const freeRaw = byKey.get(FREE_KEY) ?? null;
    const freeExplicit = freeRaw !== null;
    return {
      freePeriodEnabled: freeExplicit ? safeBool(freeRaw) : true,
      paymentsEnabled: safeBool(byKey.get(PAY_KEY) ?? null),
      source: "db",
    };
  } catch {
    return { freePeriodEnabled: true, paymentsEnabled: false, source: "fallback-safe" };
  }
}

export async function updateBillingSettings(
  input: { freePeriodEnabled?: boolean; paymentsEnabled?: boolean }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("غير مصرح");

  // Reuse existing admin authorization from admin/page pattern
  const ownerEmail = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
  const { data: profileRes } = await supabase.from("profiles").select("email").eq("id", user.id).single().catch(() => ({ data: null }));
  const isOwner = (profileRes as any)?.email?.trim().toLowerCase() === ownerEmail;
  if (!isOwner) {
    // Fallback to existing admin check
    const { data: entData } = await supabase.rpc("has_entitlement", { p_user_id: user.id, p_kind: "plan", p_value: "premium" }).catch(() => ({ data: false }));
    if (!entData) throw new Error("غير مصرح — فقط Admin/Owner");
  }

  const freeVal = input.freePeriodEnabled === undefined ? true : Boolean(input.freePeriodEnabled);
  const payVal = input.paymentsEnabled === undefined ? false : Boolean(input.paymentsEnabled);

  try {
    // PRIVILEGED server-only client — bypasses RLS, server-only, never exported to browser
    const privileged = createServiceClient();
    for (const [key, value] of [[FREE_KEY, String(freeVal)], [PAY_KEY, String(payVal)]]) {
      const { error } = await privileged.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() }).select();
      if (error) throw new Error("فشل الحفظ: " + error.message);
    }
    return { ok: true, freePeriodEnabled: freeVal, paymentsEnabled: payVal };
  } catch (e: any) {
    throw new Error("خطأ في حفظ الإعدادات: " + (e?.message || String(e)));
  }
}
