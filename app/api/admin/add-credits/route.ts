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

  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "غير مصرح — للأدمن والمالك فقط" }, { status: 403 });
  }

  const formData = await req.formData();
  const targetUserId = formData.get("targetUserId")?.toString().trim();
  const amountRaw = formData.get("amount")?.toString().trim();

  if (!targetUserId || !amountRaw) {
    return NextResponse.redirect(new URL("/admin?error=البيانات+ناقصة", req.url));
  }

  const amount = parseInt(amountRaw, 10);
  if (!amount || amount <= 0 || amount > 10000) {
    return NextResponse.redirect(new URL("/admin?error=العدد+غير+صالح", req.url));
  }

  try {
    const service = createServiceClient();
    const refId = `admin-grant:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { error } = await service.rpc("grant_ai_credits", {
      p_user_id: targetUserId,
      p_delta: amount,
      p_reason: "admin_grant",
      p_ref_id: refId,
      p_metadata: { granted_by: user?.id, role },
    } as unknown as { p_user_id: string; p_delta: number; p_reason: string; p_ref_id: string });

    if (error) throw error;
  } catch (e) {
    const msg = (e as { message?: string })?.message || "فشل شحن الرصيد";
    return NextResponse.redirect(new URL(`/admin?error=${encodeURIComponent(msg)}`, req.url));
  }

  return NextResponse.redirect(new URL("/admin?success=1", req.url));
}
