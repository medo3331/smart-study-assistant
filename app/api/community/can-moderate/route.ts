// ===========================================================================
// MAGICLY — Community C9: هل المستخدم الحالي مشرف مجتمع؟
// يستخدمها صفحة المجتمع لإظهار رابط لوحة الإشراف للمخوّلين فقط.
// ===========================================================================

import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/community/handlers";
import { resolveActor, actorHasPermission } from "@/lib/policy";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await getAuthedClient();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }
    const actor = await resolveActor(auth.client, auth.user.id, auth.user.email ?? null);
    return NextResponse.json({ success: true, canModerate: actorHasPermission(actor, "community.moderate") });
  } catch (e) {
    console.error("[community/can-moderate]", e instanceof Error ? e.message : e);
    return NextResponse.json({ success: false, canModerate: false }, { status: 500 });
  }
}
