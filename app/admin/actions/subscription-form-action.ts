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

    const adminUserId = (formData.get("admin_user_id") as string || "").trim() || "system_owner_placeholder";
    const adminEmail = (formData.get("admin_email") as string || null);

    return await activateSubscription(
      { userCode, planKey, durationDays, note },
      adminUserId,
      adminEmail
    );
  } catch (e: any) {
    return { ok: false, message: "خطأ في التفعيل: " + (e?.message || String(e)), error: String(e) };
  }
}
