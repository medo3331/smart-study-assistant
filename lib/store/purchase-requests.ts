/**
 * مساعدات طلبات الشراء (متجر الكريدت + الاشتراكات) — مشتركة بين الـ API والأدمن.
 *
 * إشعار المالك/الأدمن: `notifications` سياسة القراءة فيها (user_id null أو صاحبها)
 * — إذًا الإشعار الإداري يُدرَج لكل حساب أدمن/م OWNER على حدة (لن يراه المستخدمون).
 */

import { createServiceClient } from "@/lib/supabase/admin";

export type PurchaseRequestRow = {
  id: string;
  user_id: string;
  kind: "credits" | "plan";
  pack_id: string | null;
  credits: number | null;
  plan_key: string | null;
  plan_duration_days: number | null;
  amount: number | null;
  currency: string;
  status: "awaiting_payment" | "payment_submitted" | "approved" | "rejected" | "cancelled";
  payment_method: string | null;
  payment_reference: string | null;
  user_note: string | null;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** يرسل إشعارًا لكل الأدمنز/المالك (best-effort — لا يكسر إنشاء الطلب). */
export async function notifyAdmins(params: {
  title: string;
  message: string;
  type?: "info" | "warning";
}): Promise<void> {
  try {
    const db = createServiceClient();
    const { data: admins } = await db.from("site_admins").select("user_id");
    const ids = ((admins ?? []) as Array<{ user_id?: string | null }>)
      .map((a) => a.user_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (ids.length === 0) return;
    await db.from("notifications").insert(
      ids.map((userId) => ({
        user_id: userId,
        title: params.title,
        message: params.message,
        type: params.type ?? "info",
      }))
    );
  } catch (error) {
    console.warn("[purchase-requests] admin notification failed (non-blocking):", error);
  }
}

/** يرسل إشعارًا لمستخدم واحد (best-effort). */
export async function notifyUser(userId: string, title: string, message: string): Promise<void> {
  try {
    const db = createServiceClient();
    await db.from("notifications").insert({ user_id: userId, title, message, type: "info" });
  } catch (error) {
    console.warn("[purchase-requests] user notification failed (non-blocking):", error);
  }
}
