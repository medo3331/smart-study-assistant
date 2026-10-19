import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/api-guard";

/* ==========================================================================
   بيانات صفحة الدعوات: كودي + رابطي + دعواتي

   ملاحظة الأمان: user_metadata.marketing_consent بيتحط وقت التسجيل —
   حتى لو حالته الحالية "موافق"، صفحة الدعوات نفسها بتشتغل عادي؛
   الـbadge بس هو اللي بيتأثر (شوف صفحة الدعوات).
   ========================================================================== */

export async function GET() {
  return NextResponse.json({ error: "Not found." }, { status: 404 });
}

type ReferralRow = {
  id: string;
  created_at: string;
  status: string;
};

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const limited = checkRateLimit(`referrals:mine:${user.id}`, 30, 60_000, "success");
  if (limited) return limited;

  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("referral_code")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[referrals/mine] profile failed:", profileError.message);
      return NextResponse.json(
        { success: false, error: "مقدرناش نجيب بيانات الدعوات. حاول تاني." },
        { status: 500 }
      );
    }

    const { data: rows, error: rowsError } = await supabase
      .from("referrals")
      .select("id, created_at, status")
      .eq("referrer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (rowsError) {
      console.error("[referrals/mine] rows failed:", rowsError.message);
      return NextResponse.json(
        { success: false, error: "مقدرناش نجيب بيانات الدعوات. حاول تاني." },
        { status: 500 }
      );
    }

    const referrals = ((rows ?? []) as ReferralRow[]).map((row) => {
      const status = row.status === "rewarded" ? "rewarded" : "pending";
      return { id: row.id, created_at: row.created_at, status };
    });

    return NextResponse.json({
      success: true,
      code: (profile?.referral_code as string | null) ?? null,
      referrals,
    });
  } catch (error) {
    console.error("[referrals/mine] unexpected:", error);
    return NextResponse.json(
      { success: false, error: "حصل خطأ غير متوقع. حاول تاني." },
      { status: 500 }
    );
  }
}
