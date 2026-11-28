// ===========================================================================
// MAGICLY — Community C2: User posts API
// ===========================================================================
// GET /api/community/users/[id]/posts — منشورات طالب بالخصوصية المفروضة:
//   نفسه → كل حاجة · صديق → public+friends · غير كده → public · محظور → ولا حاجة
// ===========================================================================

import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/community/handlers";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthedClient();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ success: false, error: "Invalid id." }, { status: 400 });
    }
    const before = new URL(req.url).searchParams.get("before");
    const { data, error } = await auth.client.rpc("get_user_posts", {
      p_user: id,
      p_before: before && !Number.isNaN(Date.parse(before)) ? before : null,
      p_limit: 20,
    });
    if (error) {
      console.error("[community/user-posts] RPC error:", error);
      return NextResponse.json({ success: false, error: "Failed to load posts." }, { status: 500 });
    }
    return NextResponse.json({ success: true, posts: data ?? [] });
  } catch (e) {
    console.error("[community/user-posts] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
