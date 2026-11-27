// ===========================================================================
// MAGICLY — Community C2: Saved posts API
// ===========================================================================
// GET /api/community/saved-posts — المنشورات المحفوظة (خصوصية بالـRPC)
// ===========================================================================

import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/community/handlers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await getAuthedClient();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }
    const before = new URL(req.url).searchParams.get("before");
    const { data, error } = await auth.client.rpc("get_saved_posts", {
      p_before: before && !Number.isNaN(Date.parse(before)) ? before : null,
      p_limit: 20,
    });
    if (error) {
      console.error("[community/saved] RPC error:", error);
      return NextResponse.json({ success: false, error: "Failed to load saved posts." }, { status: 500 });
    }
    return NextResponse.json({ success: true, posts: data ?? [] });
  } catch (e) {
    console.error("[community/saved] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
