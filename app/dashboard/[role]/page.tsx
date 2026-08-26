import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { personaToRole, roleHome, safeNext } from "@/lib/auth-roles";

/** الأدوار المعروفة فقط — أي segment تاني تحت /dashboard يرجع 404
    زي ما كان قبل وجود المسار الديناميكي ده (بدون regression). */
const KNOWN_ROLES = new Set(["student", "graduate", "freelancer"]);

/**
 * 🎯 داشبورد الدور — صفحة خادم صغيرة بتقرا الحقيقة من profiles.role
 *    (العمود المولَّد من persona) وبتحوّل للمسار الصحيح.
 *
 * ليه server-side؟ عشان القرار ياخد مكان حتى لو الـproxy استرشده غلط
 * (metadata قديمة/ناقصة): الداتابيز هي المصدر النهائي، زي باقي التطبيق.
 *
 * الترتيب:
 *   ?next= آمن داخلي → الأونبوردنج لو لسه → داشبورد الدور → /dashboard fallback
 */
export default async function DashboardRolePage({
  params,
  searchParams,
}: {
  params: Promise<{ role: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { role: roleParam } = await params;
  const sp = await searchParams;

  // دور وهمي في الرابط؟ 404 — نفس سلوك المسار المجهول قبل المرحلة دي.
  if (!KNOWN_ROLES.has(roleParam)) notFound();

  // الدور في الرابط لازم يطابق دور المستخدم الفعلي — غير كده fallback عام.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) redirect("/welcome");

  const { data: profile } = await supabase
    .from("profiles")
    .select("persona, onboarded_at")
    .eq("id", user.id)
    .maybeSingle();

  const actualRole = personaToRole(profile?.persona);

  const nextParam = typeof sp.next === "string" ? safeNext(sp.next, "") : "";

  if (!profile?.onboarded_at) redirect(nextParam ? `/onboarding?next=${encodeURIComponent(nextParam)}` : "/onboarding");

  if (actualRole && actualRole !== roleParam) redirect(roleHome(actualRole));
  if (!actualRole && roleParam !== "student") redirect("/dashboard");

  redirect(nextParam || roleHome(actualRole ?? "student"));
}
