// ===========================================================================
// MAGICLY — Community C2: Comment delete API
// ===========================================================================
// DELETE /api/community/posts/[id]/comments/[commentId]
// صاحب التعليق أو صاحب المنشور فقط — مفروض في الـRPC
// ===========================================================================

import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/community/handlers";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  try {
    const auth = await getAuthedClient();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }
    const { commentId } = await params;
    if (!UUID_RE.test(commentId)) {
      return NextResponse.json({ success: false, error: "Invalid id." }, { status: 400 });
    }
    const { data, error } = await auth.client.rpc("delete_post_comment", { p_comment_id: commentId });
    if (error) {
      console.error("[community/comments] delete RPC error:", error);
      return NextResponse.json({ success: false, error: "Failed to delete comment." }, { status: 500 });
    }
    const result = data as { ok: boolean; code?: string };
    if (!result.ok) {
      return NextResponse.json({ success: false, code: result.code, error: "Rejected." }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[community/comments] delete Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
