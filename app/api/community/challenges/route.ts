// ===========================================================================
// MAGICLY — Community C14: تحديات المجتمع — API
// ---------------------------------------------------------------------------
// GET  /api/community/challenges           → التحديات النشطة + تقدّمي
// POST /api/community/challenges           → { action: "join", challengeId }
//        { action: "leaderboard", challengeId }
// ===========================================================================

import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/community/handlers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await getAuthedClient();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }
    const { data, error } = await auth.client.rpc("active_community_challenges");
    if (error) {
      console.error("[community/challenges] GET", error);
      return NextResponse.json({ success: false, error: "تعذّر تحميل التحديات." }, { status: 500 });
    }
    return NextResponse.json({ success: true, challenges: data ?? [] });
  } catch (e) {
    console.error("[community/challenges] GET", e);
    return NextResponse.json({ success: false, error: "خطأ غير متوقع." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthedClient();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }
    const body = await req.json().catch(() => null);
    const action = body?.action as string;
    const challengeId = body?.challengeId as string | undefined;

    if (!challengeId || !/^[0-9a-f-]{36}$/i.test(challengeId)) {
      return NextResponse.json({ success: false, error: "معرّف التحدي غير صالح." }, { status: 400 });
    }

    if (action === "join") {
      const { data, error } = await auth.client.rpc("join_community_challenge", { p_challenge_id: challengeId });
      if (error) {
        console.error("[community/challenges] join", error);
        return NextResponse.json({ success: false, error: "تعذّر الانضمام للتحدي." }, { status: 500 });
      }
      const result = data as { ok: boolean; code?: string };
      if (!result?.ok) {
        const msg =
          result?.code === "not_active" ? "التحدي ده مش شغال دلوقتي." :
          result?.code === "auth_required" ? "لازم تكون داخل بحسابك." : "اترفض الانضمام.";
        return NextResponse.json({ success: false, error: msg }, { status: 409 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "leaderboard") {
      const { data, error } = await auth.client.rpc("challenge_leaderboard", { p_challenge_id: challengeId, p_limit: 10 });
      if (error) {
        console.error("[community/challenges] leaderboard", error);
        return NextResponse.json({ success: false, error: "تعذّر تحميل لوحة صدارة التحدي." }, { status: 500 });
      }
      return NextResponse.json({ success: true, entries: data ?? [] });
    }

    return NextResponse.json({ success: false, error: "Invalid action." }, { status: 400 });
  } catch (e) {
    console.error("[community/challenges] POST", e);
    return NextResponse.json({ success: false, error: "خطأ غير متوقع." }, { status: 500 });
  }
}
