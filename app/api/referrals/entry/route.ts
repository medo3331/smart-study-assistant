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

  const limited = checkRateLimit(`referral-entry:${user.id}`, 10, 60_000, "success");
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

    const { data: refProfile } = await service
      .from("profiles")
      .select("credits")
      .eq("id", referral.referrer_id)
      .maybeSingle();
    const newCredits = (refProfile?.credits ?? 0) + 100;
    await service.from("profiles").update({ credits: newCredits }).eq("id", referral.referrer_id);

    return NextResponse.json({ success: true, tracked: true, rewarded: true });
  } catch (error) {
    console.error("[referrals/entry] unexpected:", error);
    return NextResponse.json({ success: false, error: "حصل خطأ غير متوقع." }, { status: 500 });
  }
}
