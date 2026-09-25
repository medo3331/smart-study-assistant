"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { regenerateUserPublicCode } from "./user-code";

/**
 * 🔒 غلاف form action لزر توليد/إعادة توليد الكود في /admin/users/[id].
 *
 * نفس تحصين المرحلة 1/2 (ai-models-form-action.ts): هوية المنفّذ بتتقرأ من
 * الجلسة على السيرفر — مفيش أي حقل admin_* بيتقبل من الفورم، فمستحيل تزوير
 * الهوية من المتصفح. والفحص الفعلي للصلاحية جوه regenerateUserPublicCode.
 */
export async function regenerateUserCodeFormAction(formData: FormData): Promise<void> {
  const targetUserId = String(formData.get("target_user_id") ?? "").trim();

  if (!targetUserId) {
    redirect(`/admin/users?error=${encodeURIComponent("معرّف المستخدم مطلوب")}`);
  }
  const backHref = `/admin/users/${targetUserId}`;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    redirect("/login");
  }

  const res = await regenerateUserPublicCode(targetUserId, user.id, user.email ?? null);
  const param = res.ok
    ? `success=${encodeURIComponent(res.message)}`
    : `error=${encodeURIComponent(res.message)}`;
  redirect(`${backHref}?${param}`);
}
