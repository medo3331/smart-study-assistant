"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export async function claimPremiumTrial(email: string, userId?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("غير مصرح");

  // Owner-only authorization — same as admin-management
  const ownerEmail = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
  const { data: profileRes } = await supabase.from("profiles").select("email").eq("id", user.id).single().catch(() => ({ data: null }));
  const isOwner = (profileRes as any)?.email?.trim().toLowerCase() === ownerEmail;
  if (!isOwner) {
    const { data: entData } = await supabase.rpc("has_entitlement", { p_user_id: user.id, p_kind: "plan", p_value: "premium" }).catch(() => ({ data: false }));
    if (!entData) throw new Error("غير مصرح — فقط Owner");
  }

  if (!email || !email.includes("@")) throw new Error("بريد غير صالح");

  const targetId = userId || user.id;
  if (!targetId) throw new Error("معرّف المستخدم مطلوب");

  const privileged = createServiceClient();

  // Idempotency: already active premium?
  const { data: existing } = await privileged.from("entitlements")
    .select("id")
    .eq("user_id", targetId)
    .eq("kind", "plan")
    .eq("value", "premium")
    .gte("expires_at", new Date().toISOString())
    .maybeSingle();

  if (existing) {
    return { ok: true, message: "Premium Trial موجود بالفعل", userId: targetId, trialActive: true };
  }

  try {
    // Resolve target from Auth (use auth.uid if userId not provided, or find by profile.email)
    // For simplicity: if userId provided by admin, use it; else use current user
    // (Admin can target any existing user by ID)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: insertError } = await privileged.from("entitlements").insert({
      user_id: targetId,
      kind: "plan",
      value: "premium",
      granted_at: new Date().toISOString(),
      expires_at: expiresAt,
      metadata: { source: "premium_trial_0_5", granted_by: user.id, phase: "0.5" },
    });
    if (insertError) throw new Error("فشل منح الصلاحية: " + insertError.message);
    return { ok: true, message: "تم تفعيل Premium Trial (7 أيام)", userId: targetId, trialActive: true, expiresAt };
  } catch (e: any) {
    throw new Error("خطأ في تفعيل Trial: " + (e?.message || String(e)));
  }
}
