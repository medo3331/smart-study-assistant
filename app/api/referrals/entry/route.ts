import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/api-guard";

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

  if (user.is_anonymous) {
    return NextResponse.json({ success: true, tracked: false, rewarded: false });
  }

  const limited = await checkRateLimit(`referral-entry:${user.id}`, 10, 60_000, "success");
  if (limited) return limited;

  try {
    const { data: referral, error: refError } = await supabase
      .from("referrals")
      .select("id, referrer_id, status")
      .eq("referee_id", user.id)
      .in("status", ["pending", "signed_up"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (refError) {
      console.error("[referrals/entry] select failed:", refError.message);
      return NextResponse.json({ success: false, error: "مقدرناش نسجّل الدخول الأول." }, { status: 500 });
    }

    if (!referral) {
      return NextResponse.json({ success: true, tracked: false, rewarded: false });
    }

    const service = createServiceClient();
    const { data: updated, error: updateError } = await service
      .from("referrals")
      .update({ status: "rewarded" })
      .eq("id", referral.id)
      .in("status", ["pending", "signed_up"])
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error("[referrals/entry] update failed:", updateError.message);
      return NextResponse.json({ success: false, error: "مقدرناش نسجّل الدخول الأول." }, { status: 500 });
    }

    if (!updated) {
      return NextResponse.json({ success: true, tracked: true, rewarded: false });
    }

    // 🎁 مكافأة الداعي: كريدت حقيقي في نظام المنح (credit_grants + ledger)
    // عبر grant_credits — مش تحديث مباشر لعمود قديم. انتهاء بعد 90 يومًا،
    // وتاريخ صريح مُمرّر (نسخ قديمة من الدالة بتفشل مع null — المرحلة 25ط).
    const { error: grantError } = await service.rpc("grant_credits", {
      p_user_id: referral.referrer_id,
      p_amount: 100,
      p_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      p_source: "bonus",
      p_notes: "مكافأة دعوة صديق — أول تسجيل",
    });
    if (grantError) {
      // الإحالة نفسها اتسجلت (rewarded) — الفشل في المكافأة يُسجّل بس مش بيفشل الطلب،
      // عشان الدعوة متضيعش بسبب خطأ لحظي في المنح.
      console.error("[referrals/entry] grant_credits failed:", grantError.message);
    }

    return NextResponse.json({ success: true, tracked: true, rewarded: !grantError });
  } catch (error) {
    console.error("[referrals/entry] unexpected:", error);
    return NextResponse.json({ success: false, error: "حصل خطأ غير متوقع." }, { status: 500 });
  }
}
