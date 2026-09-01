import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAdminRole } from "@/lib/auth-roles";
import { createServiceClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: async (name) => (await cookieStore).get(name)?.value } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const role = await getAdminRole(supabase, user?.id || null, user?.email);

  if (role !== "owner") {
    return NextResponse.json({ error: "غير مصرح — للمالك فقط" }, { status: 403 });
  }

  const formData = await req.formData();
  const action = formData.get("action")?.toString().trim();
  const targetEmail = formData.get("email")?.toString().trim();
  const targetUserId = formData.get("userId")?.toString().trim();

  // سحب صلاحية أدمن (revoke)
  if (action === "revoke" && targetUserId) {
    try {
      const service = createServiceClient();
      const { error } = await service.from("site_admins").delete().eq("user_id", targetUserId).neq("role", "owner");
      if (error) throw error;
    } catch (e) {
      const msg = (e as { message?: string })?.message || "فشل السحب";
      return NextResponse.redirect(new URL(`/admin?error=${encodeURIComponent(msg)}`, req.url));
    }
    return NextResponse.redirect(new URL("/admin?success=1", req.url));
  }

  // منح صلاحية أدمن (grant)
  if (!targetEmail) {
    return NextResponse.redirect(new URL("/admin?error=البريد+مطلوب", req.url));
  }

  const service = createServiceClient();
  const { data: userData } = await supabase.from("profiles").select("id").eq("email", targetEmail).maybeSingle();

  // fallback: try auth.users via service client
  let userId = userData?.id as string | undefined;
  if (!userId) {
    try {
      const { data } = await service.auth.admin.listUsers();
      const found = data.users.find((u) => u.email?.toLowerCase() === targetEmail.toLowerCase());
      userId = found?.id;
    } catch {}
  }

  if (!userId) {
    return NextResponse.redirect(new URL("/admin?error=المستخدم+غير+موجود", req.url));
  }

  try {
    const { error } = await service.from("site_admins").upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id" });
    if (error) throw error;
  } catch (e) {
    const msg = (e as { message?: string })?.message || "فشل المنح";
    return NextResponse.redirect(new URL(`/admin?error=${encodeURIComponent(msg)}`, req.url));
  }

  return NextResponse.redirect(new URL("/admin?success=1", req.url));
}
