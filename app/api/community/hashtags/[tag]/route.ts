// ===========================================================================
// MAGICLY — Community C2: Hashtag posts API
// ===========================================================================
// GET /api/community/hashtags/[tag] — منشورات هاشتاج (نفس قواعد الفيد)
// ===========================================================================

import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/community/handlers";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ tag: string }> }) {
  try {
    const auth = await getAuthedClient();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }
    const { tag } = await params;
    const cleanTag = decodeURIComponent(tag).replace(/^#/, "").slice(0, 50);
    if (!/^[A-Za-z0-9_\u0600-\u06FF]{1,50}$/.test(cleanTag)) {
      return NextResponse.json({ success: false, error: "Invalid tag." }, { status: 400 });
    }
    const before = new URL(req.url).searchParams.get("before");
    const { data, error } = await auth.client.rpc("get_hashtag_posts", {
      p_tag: cleanTag,
      p_before: before && !Number.isNaN(Date.parse(before)) ? before : null,
      p_limit: 20,
    });
    if (error) {
      console.error("[community/hashtags] RPC error:", error);
      return NextResponse.json({ success: false, error: "Failed to load posts." }, { status: 500 });
    }
    return NextResponse.json({ success: true, tag: cleanTag, posts: data ?? [] });
  } catch (e) {
    console.error("[community/hashtags] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
