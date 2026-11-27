// ===========================================================================
// MAGICLY — Community C2b: Trending hashtags API
// ===========================================================================
// GET /api/community/trending — الهاشتاجات الأكثر نشاطًا آخر 7 أيام
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
    const { data, error } = await auth.client.rpc("get_trending_hashtags", { p_limit: 8 });
    if (error) {
      console.error("[community/trending] RPC error:", error);
      return NextResponse.json({ success: false, error: "Failed to load trending." }, { status: 500 });
    }
    return NextResponse.json({ success: true, trending: data ?? [] });
  } catch (e) {
    console.error("[community/trending] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
