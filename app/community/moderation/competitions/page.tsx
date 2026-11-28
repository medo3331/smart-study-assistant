// ===========================================================================
// MAGICLY — Community C16: بانى المسابقات داخل المجتمع
// /community/moderation/competitions — للمشرفين (صلاحية community.moderate)
// ===========================================================================

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { resolveActor, actorHasPermission } from "@/lib/policy";
import QuizBuilderClient from "@/app/admin/community/moderation/QuizBuilderClient";

export const dynamic = "force-dynamic";

export default async function CommunityCompetitionsAdminPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) redirect("/login?next=/community/moderation/competitions");

  const actor = await resolveActor(supabase, user.id, user.email ?? null);
  if (!actorHasPermission(actor, "community.moderate")) {
    redirect("/community?error=الصفحة_للمشرفين_فقط");
  }

  return <QuizBuilderClient />;
}
