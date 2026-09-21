// ============================================================
// EPIC-3 — Subscription Management (View / Extend / Revoke)
// ============================================================

"use server";

import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "./audit-log-record";
import { getAdminRole, isOwnerEmail } from "@/lib/auth-roles";

export interface SubscriptionStatus {
  user_id: string;
  user_email: string | null;
  user_display_name: string | null;
  user_code: string | null;
  public_user_code: string | null;
  current_plan_key: string | null;
  current_plan_name: string | null;
  activation_id: string | null;
  activation_created_at: string | null;
  activation_duration_days: number | null;
  activation_note: string | null;
  activation_activated_by: string | null;
  entitlement_expires_at: string | null;
  entitlement_kind: string | null;
  entitlement_value: string | null;
  messages_24h: number;
  uploads_today: number;
  quota_updated_at: string | null;
}

export async function getSubscriptionStatus(userIdOrCode: string): Promise<SubscriptionStatus | null> {
  const supabase = createServiceClient();
  try {
    // Try by UUID first
    let userRow: any = null;
    try {
      const { data } = await supabase.from("profiles").select("id, email, display_name, public_user_code").eq("id", userIdOrCode.trim()).maybeSingle();
      if (data) userRow = data;
    } catch {}

    // If not found, try by user_code (MAG-XXXXXX)
    if (!userRow) {
      const { data: codeRow } = await supabase.from("user_codes").select("user_id, code, is_active").eq("code", userIdOrCode.trim()).maybeSingle();
      if (codeRow) {
        const { data: profileData } = await supabase.from("profiles").select("id, email, display_name, public_user_code").eq("id", (codeRow as any).user_id).maybeSingle();
        if (profileData) userRow = { ...profileData, user_code: (codeRow as any).code };
      }
    }

    if (!userRow) return null;

    const userId = userRow.id;
    const userEmail = userRow.email;
    const userName = userRow.display_name;

    // Get current entitlement (plan)
    const { data: entitlementRow } = await supabase
      .from("entitlements")
      .select("kind, value, expires_at, metadata")
      .eq("user_id", userId)
      .eq("kind", "plan")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get latest activation
    const { data: activationRow } = await supabase
      .from("subscription_activations")
      .select("id, user_code, user_id, plan_key, duration_days, activated_by, note, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get plan info
    let planName = "Free";
    const planKey = (entitlementRow as any)?.value || (activationRow as any)?.plan_key || "free";
    const { data: planData } = await supabase.from("subscription_plans").select("name, display_name_ar").eq("plan_key", planKey).maybeSingle();
    if (planData) planName = (planData as any).display_name_ar || (planData as any).name || planKey;

    // Get quota usage (simplified — real quota tracking requires additional logic)
    const { data: quotaRow } = await supabase.from("subscription_quotas").select("messages_24h, uploads_today, updated_at").eq("user_id", userId).maybeSingle();

    return {
      user_id: userId,
      user_email: userEmail,
      user_display_name: userName,
      user_code: (userRow as any).user_code || null,
      public_user_code: (userRow as any).public_user_code || null,
      current_plan_key: planKey,
      current_plan_name: planName,
      activation_id: (activationRow as any)?.id || null,
      activation_created_at: (activationRow as any)?.created_at || null,
      activation_duration_days: (activationRow as any)?.duration_days || null,
      activation_note: (activationRow as any)?.note || null,
      activation_activated_by: (activationRow as any)?.activated_by || null,
      entitlement_expires_at: (entitlementRow as any)?.expires_at || null,
      entitlement_kind: (entitlementRow as any)?.kind || null,
      entitlement_value: (entitlementRow as any)?.value || null,
      messages_24h: (quotaRow as any)?.messages_24h || 0,
      uploads_today: (quotaRow as any)?.uploads_today || 0,
      quota_updated_at: (quotaRow as any)?.updated_at || null,
    };
  } catch (e: any) {
    console.error("[subscription-manage] Error:", e?.message || e);
    return null;
  }
}
