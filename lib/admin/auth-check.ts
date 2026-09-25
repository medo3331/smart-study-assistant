"use server";
import { redirect } from "next/navigation";
import { getAdminRole, getAdminPermissions, hasPermission, isOwnerEmail } from "@/lib/auth-roles";
import type { AdminPermissionKey } from "@/lib/auth-roles";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * 🔐 حرّاس لوحة الأدمن — كلهم Server-side وبيقرأوا الدور من الداتابيز
 * (env allowlist للـOwner + جدول site_admins للأدمنز/الدعم).
 *
 * ⚠️ التغيير في المرحلة 1: كانت الصفحة الموحّدة بتحجب أي حد بريده مش في
 * OWNER_EMAIL/ADMIN_EMAILS (يعني Admin/Support المسجّلين في site_admins
 * مايقدروش يدخلوا خالص، وكل اللي يدخل بيتعامل كـ owner). دلوقتي:
 *   - الدخول مطلوب دائمًا (زائر مرفوض).
 *   - المصرّح له: Owner (env) أو أي دور صالح من site_admins.
 *   - كل صفحة فرعية بتتحقق من صلاحيتها هي بمفتاح من ADMIN_PERMISSION_MAP.
 * ده بنا فوق getAdminRole/hasPermission الموجودين — مفيش منطق RBAC جديد.
 */

function buildSupabase(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
  );
}

/** قراءة الجلسة + الدور بدون فرض أي صلاحية (للصفحة الرئيسية وحسابات القائمة). */
export async function getAdminContext() {
  const cookieStore = await cookies();
  const supabase = buildSupabase(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) redirect("/login");
  const role = await getAdminRole(supabase, user.id, user.email ?? null);
  if (role === null) redirect("/dashboard");
  const permissions = await getAdminPermissions(supabase, user.id, role);
  return { user, role, isOwner: role === "owner", permissions, supabase };
}

/**
 * فرض صلاحية معيّنة على مستوى السيرفر — بيوجّه لـ/dashboard لو مرفوض.
 * مستخدم في كل صفحة من صفحات /admin/* (بما فيها الوصول المباشر بالرابط).
 */
export async function requireAdminPermission(permission: AdminPermissionKey) {
  const ctx = await getAdminContext();
  const allowed = await hasPermission(ctx.supabase, ctx.user.id, ctx.user.email ?? null, permission);
  if (!allowed) redirect("/dashboard?admin=forbidden");
  return { ...ctx, permission };
}

/**
 * @removed Phase 1.5 — requireAdminAuth اتشالت نهائيًا (0 callers).
 * استخدم getAdminContext أو requireAdminPermission.
 */

/** هل الـOwner حسب env فقط (بدون داتابيز) — للفحوص السريعة في السيرفر. */
export { isOwnerEmail };
