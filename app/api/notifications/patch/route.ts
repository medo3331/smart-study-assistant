// ===========================================================================
// MAGICLY — Unified Notifications — Mark read
// ===========================================================================

import { NextResponse } from "next/server";
import { isNotificationsSchemaMissing } from "@/lib/notifications/schema";

export async function PATCH(req: Request) {
  try {
    const serverClient = await (await import("@/lib/supabase/server")).createClient();
    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
    }

    const { all, id } = body as { all?: boolean; id?: string };

    if (all) {
      // Mark all notifications as read
      const { error } = await serverClient
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("recipient_id", user.id)
        .eq("is_read", false);

      if (error) {
        if (isNotificationsSchemaMissing(error)) {
          return NextResponse.json({ success: false, error: "Notifications not available.", schemaMissing: true }, { status: 503 });
        }
        console.error("[notifications] PATCH all", error);
        return NextResponse.json({ success: false, error: "Failed to update." }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (id) {
      // Mark single notification as read
      const { error } = await serverClient
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", id)
        .eq("recipient_id", user.id)
        .eq("is_read", false);

      if (error) {
        if (isNotificationsSchemaMissing(error)) {
          return NextResponse.json({ success: false, error: "Notifications not available.", schemaMissing: true }, { status: 503 });
        }
        console.error("[notifications] PATCH id", error);
        return NextResponse.json({ success: false, error: "Failed to update." }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  } catch (error) {
    console.error("[notifications] PATCH", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
