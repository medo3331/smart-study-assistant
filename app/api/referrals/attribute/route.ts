import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/api-guard";

export async function GET() {
  return NextResponse.json({ error: "Not found." }, { status: 404 });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code) {
    return NextResponse.json({ success: false, error: "Missing code." }, { status: 400 });
  }

  const limited = checkRateLimit(`referrals:attribute:${user.id}`, 20, 60_000, "success");
  if (limited) return limited;

  try {
    // Anti-cheat: منع الإحالة الذاتية
    const { data: me } = await supabase
      .from("profiles")
      .select("referral_code")
      .eq("id", user.id)
      .maybeSingle();
    if (me?.referral_code && String(me.referral_code).toUpperCase() === code) {
      return NextResponse.json({ success: false, error: "Self-referral not allowed." }, { status: 400 });
    }

    const { data: tracked, error: trackError } = await supabase.rpc("attribute_referral", {
      p_code: code,
    });
    if (trackError) {
      console.error("[referrals/attribute] rpc failed:", trackError.message);
      return NextResponse.json({ success: false, error: "تعذّر تسجيل الإحالة." }, { status: 500 });
    }

    // حفظ referred_by في ملف المستخدم (إذا لم يكن م задан)
    await supabase
      .from("profiles")
      .update({ referred_by: code })
      .eq("id", user.id)
      .is("referred_by", null);

    return NextResponse.json({ success: true, tracked: tracked === true });
  } catch (error) {
    console.error("[referrals/attribute] unexpected:", error);
    return NextResponse.json({ success: false, error: "حصل خطأ غير متوقع." }, { status: 500 });
  }
}