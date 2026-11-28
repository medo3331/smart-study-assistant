// ===========================================================================
// MAGICLY — Community C2b: Poll API
// ===========================================================================
// GET  /api/community/posts/[id]/poll — نتائج الاستطلاع (مع صوتك)
// POST /api/community/posts/[id]/poll — تصويت { optionId } (صوت واحد قابل للتغيير)
// ===========================================================================

import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/community/handlers";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthedClient();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ success: false, error: "Invalid id." }, { status: 400 });
    }
    const { data, error } = await auth.client.rpc("get_poll_results", { p_post_id: id });
    if (error) {
      console.error("[community/poll] RPC error:", error);
      return NextResponse.json({ success: false, error: "Failed to load poll." }, { status: 500 });
    }
    return NextResponse.json({ success: true, options: data ?? [] });
  } catch (e) {
    console.error("[community/poll] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthedClient();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ success: false, error: "Invalid id." }, { status: 400 });
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body.optionId !== "string" || !UUID_RE.test(body.optionId)) {
      return NextResponse.json({ success: false, error: "Invalid option." }, { status: 400 });
    }
    const { data, error } = await auth.client.rpc("vote_community_poll", {
      p_post_id: id,
      p_option_id: body.optionId,
    });
    if (error) {
      console.error("[community/poll] vote RPC error:", error);
      return NextResponse.json({ success: false, error: "Failed to vote." }, { status: 500 });
    }
    const result = data as { ok: boolean; code?: string };
    if (!result.ok) {
      return NextResponse.json({ success: false, code: result.code, error: "Rejected." }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[community/poll] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
