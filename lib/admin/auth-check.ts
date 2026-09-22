"use server";
import { redirect } from "next/navigation";
import { getAdminRole, isOwnerEmail } from "@/lib/auth-roles";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function requireAdminAuth() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) redirect("/login");
  if (!isOwnerEmail(user.email ?? null)) redirect("/dashboard");
  const role = await getAdminRole(supabase, user?.id || null, user?.email);
  const isOwner = role === "owner";
  return { user, isOwner, role, supabase };
}
