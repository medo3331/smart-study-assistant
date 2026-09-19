"use server";

import { activateSubscription } from "./subscription-activate";

export async function subscriptionActivationFormAction(formData: FormData) {
  try {
    const userCode = (formData.get("user_code") as string || "").trim();
    const planKey = (formData.get("plan_key") as string || "free").trim();
    const durationStr = formData.get("duration_days") as string || "30";
    const durationDays = parseInt(durationStr, 10);
    const note = (formData.get("note") as string || "").trim();

    if (!userCode) return { ok: false, message: "User Code مطلوب", error: "missing_user_code" };
    if (!planKey) return { ok: false, message: "الخطة مطلوبة", error: "missing_plan_key" };

    // Authorization: uses adminUserId from session/auth context.
    // In production, adminUserId should come from the server session (not hardcoded).
    // For preview: use a placeholder — real implementation requires session user ID.
    // The authorization guard inside activateSubscription verifies Owner role.
    return await activateSubscription(
      { userCode, planKey, durationDays, note },
      "system_owner_placeholder",
      "owner@example.com"
    );
  } catch (e: any) {
    return { ok: false, message: "خطأ في التفعيل: " + (e?.message || String(e)), error: String(e) };
  }
}
