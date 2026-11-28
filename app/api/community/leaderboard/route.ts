// ===========================================================================
// MAGICLY — Community C2b: Leaderboard + Trending APIs
// ===========================================================================
// GET /api/community/leaderboard — ترتيب الطلاب حسب XP + ترتيبك أنت
// GET /api/community/trending    — الهاشتاجات الأكثر نشاطًا آخر 7 أيام
// ===========================================================================

import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/community/handlers";

export const dynamic = "force-dynamic";

export async function leaderboardHandler() {
  const auth = await getAuthedClient();
  if (!auth) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }
  const [boardRes, rankRes] = await Promise.all([
    auth.client.rpc("get_xp_leaderboard", { p_limit: 10 }),
    auth.client.rpc("get_my_leaderboard_rank"),
  ]);
  if (boardRes.error || rankRes.error) {
    console.error("[community/leaderboard] RPC error:", boardRes.error ?? rankRes.error);
    return NextResponse.json({ success: false, error: "Failed to load leaderboard." }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    leaderboard: boardRes.data ?? [],
    myRank: rankRes.data ?? null,
  });
}

export async function GET() {
  return leaderboardHandler();
}
