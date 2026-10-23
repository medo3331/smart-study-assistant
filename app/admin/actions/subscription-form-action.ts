"use server";

import { activateSubscription } from "./subscription-activate";
import { createClient } from "@/lib/supabase/server";

/**
 * 🔒 غلاف الـform action لتفعيل الاشتراك.
 *
 * ⚠️ تحصين (المرحلة 1): كان بياخد `admin_user_id`/`admin_email` من الـFormData
 * (وقيم افتراضية زي "system_owner_placeholder") — أي قيم يتحكم فيها المتصفح
 * تقدر تعدّي فحص الدور بالتزوير. دلوقتي الهوية بتتقرأ من الجلسة على السيرفر.
 */
export async function subscriptionActivationFormAction(formData: FormData) {
  try {
    const recipientEmail = ((formData.get("email") as string) || "").trim();
    const userCode = ((formData.get("user_code") as string) || "").trim();
    const planKey = ((formData.get("plan_key") as string) || "free").trim();
    const durationStr = (formData.get("duration_days") as string) || "30";
    const durationDays = parseInt(durationStr, 10);
    const note = ((formData.get("note") as string) || "").trim();

    if (!recipientEmail && !userCode) return { ok: false, message: "البريد الإلكتروني أو كود المستخدم مطلوب", error: "missing_recipient" };
    if (!planKey) return { ok: false, message: "الخطة مطلوبة", error: "missing_plan_key" };

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) {
      return { ok: false, message: "غير مصرح: لازم تسجيل دخول", error: "unauthenticated" };
    }

    return await activateSubscription(
      { email: recipientEmail || undefined, userCode: userCode || undefined, planKey, durationDays, note },
      user.id,
      user.email ?? null
    );
  } catch (e: any) {
    return { ok: false, message: "خطأ في التفعيل: " + (e?.message || String(e)), error: String(e) };
  }
}

