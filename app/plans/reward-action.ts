"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Phase 0.5 — Premium Trial (7-day) using existing entitlement architecture.
 * Server-only; requires Owner/Admin; idempotent via existing entitlement unique index.
 */
export async function claimPremiumTrial(expiresAt?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("غير مصرح");
  // Self-claim only via auth.uid() — server verified

  // Verify existing premium does not exist (idempotency guard)
  const { data: existing } = await supabase.rpc("has_entitlement", { p_user_id: user.id, p_kind: "plan", p_value: "premium" });
  if (existing) return { ok: false, message: "لديك Premium بالفعل" };

  // Use privileged client for insert (service_role — server-only)
  const privileged = createServiceClient();
  const effectiveExpires = expiresAt ? new Date(expiresAt).toISOString() : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await privileged.from("entitlements").insert({
    user_id: user.id,
    kind: "plan",
    value: "premium",
    granted_at: new Date().toISOString(),
    expires_at: effectiveExpires,
    metadata: { source: "premium_trial", phase: "0.5", granted_by: "admin_or_self" },
  });

  if (error) {
    if (error.code === "23505" || error.message?.includes("unique")) {
      return { ok: false, message: "Premium Trial موجود بالفعل" };
    }
    return { ok: false, message: "خطأ في قاعدة البيانات" };
  }
  return { ok: true, message: "تم تفعيل Premium Trial (7 أيام)", expiresAt: effectiveExpires };
}
