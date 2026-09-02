"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export async function grantPremiumEntitlement(userId: string, expiresAt?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("غير مصرح");

  // Authorize: owner-only or admin entitlement
  const ownerEmail = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
  const { data: profileRes } = await supabase.from("profiles").select("email").eq("id", user.id).single().catch(() => ({ data: null }));
  const isOwner = (profileRes as any)?.email?.trim().toLowerCase() === ownerEmail;
  if (!isOwner) {
    const { data: entData } = await supabase.rpc("has_entitlement", { p_user_id: user.id, p_kind: "plan", p_value: "premium" }).catch(() => ({ data: false }));
    if (!entData) throw new Error("غير مصرح — فقط Admin/Owner");
  }

  if (!userId) throw new Error("معرّف المستخدم مطلوب");

  // PRIVILEGED server-only — service_role bypasses RLS; never exported to browser
  const privileged = createServiceClient();
  const { error } = await privileged.from("entitlements").insert({
    user_id: userId,
    kind: "plan",
    value: "premium",
    granted_at: new Date().toISOString(),
    expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    metadata: { source: "admin_manual_grant", granted_by: user.id, phase: "4.10" },
  }).select();

  if (error) throw new Error("فشل منح الصلاحية: " + error.message);
  return { ok: true, userId, kind: "plan", value: "premium" };
}
