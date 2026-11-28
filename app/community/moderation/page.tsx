// ===========================================================================
// MAGICLY — Community C9: لوحة إشراف المجتمع داخل المجتمع
// ---------------------------------------------------------------------------
// نفس لوحة الإشراف لكن على مسار /community/moderation — للمشرفين
// (صلاحية community.moderate) بدون المرور على لوحة الأدمن.
// الوصول مرفوض سيرفر سايد لغير المخوّلين — نفس guard الـAPI.
// ===========================================================================

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { resolveActor, actorHasPermission } from "@/lib/policy";
import AdminModerationClient from "@/app/admin/community/moderation/ModerationClient";

export const dynamic = "force-dynamic";

export default async function CommunityModerationPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) redirect("/login?next=/community/moderation");

  const actor = await resolveActor(supabase, user.id, user.email ?? null);
  if (!actorHasPermission(actor, "community.moderate")) {
    redirect("/community?error=الصفحة_للمشرفين_فقط");
  }

  return <AdminModerationClient />;
}
