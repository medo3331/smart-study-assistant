// ===========================================================================
// MAGICLY — Community C3: Group details API
// ===========================================================================
// GET /api/community/groups/[id] — تفاصيل المجموعة (الخصوصية مفروضة بالـRPC:
// المجموعة الخاصة لغير الأعضاء → بيانات مختصرة فقط)
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
    const { data, error } = await auth.client.rpc("get_group_details", { p_group_id: id });
    if (error) {
      console.error("[community/groups/[id]] RPC error:", error);
      return NextResponse.json({ success: false, error: "Failed to load group." }, { status: 500 });
    }
    const group = data as { found: boolean } | null;
    if (!group?.found) {
      return NextResponse.json({ success: false, error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true, group });
  } catch (e) {
    console.error("[community/groups/[id]] Unexpected:", e);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
