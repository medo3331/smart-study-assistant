import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/api-guard";

/* ==========================================================================
   تتبع الإحالة — أول دخول حقيقي بعد التسجيل بالكود

   ليه POST + session مش RPC مباشر من الكلاينت؟ عشان عايزين (١) rate limit
   ضد السبام، و(٢) خطوة واحدة تشغّل التتبع ثم الترقية ثم المكافأة — والتلاتة
   RPCs ذرية كل واحدة لوحدها، فالمسار الكلي idempotent وآمن للتكرار.
   ========================================================================== */

export async function GET() {
  return NextResponse.json({ error: "Not found." }, { status: 404 });
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // الزائر المجهول مالوش إحالات — زي signup_bonus بالظبط
  if (user.is_anonymous) {
    return NextResponse.json({ success: true, tracked: false, rewarded: false });
  }

  // سبام السبام: أول دخول بيحصل مرة واحدة، والحد ده مجرد شبكة أمان
  const limited = checkRateLimit(`referral-entry:${user.id}`, 10, 60_000, "success");
  if (limited) return limited;

  try {
    const { data: tracked, error: trackError } = await supabase.rpc("track_referral_entry");
    if (trackError) {
      console.error("[referrals/entry] rpc failed:", trackError.message);
      return NextResponse.json(
        { success: false, error: "مقدرناش نسجّل الدخول الأول. حاول تاني." },
        { status: 500 }
      );
    }

    let rewarded = false;
    if (tracked === true) {
      const { data: promoted } = await supabase.rpc("promote_referral_and_reward");
      rewarded = promoted === true;
    }

    return NextResponse.json({ success: true, tracked: tracked === true, rewarded });
  } catch (error) {
    console.error("[referrals/entry] unexpected:", error);
    return NextResponse.json(
      { success: false, error: "حصل خطأ غير متوقع. حاول تاني." },
      { status: 500 }
    );
  }
}
