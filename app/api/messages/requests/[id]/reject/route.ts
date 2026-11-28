// ===========================================================================
// MAGICLY — Message Request Actions (Reject, Cancel)
// Phase 1: Messaging Foundation
// ===========================================================================

import { NextResponse } from "next/server";

/**
 * POST /api/messages/requests/[id]/reject
 *
 * Reject an incoming message request.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const serverClient = await createClient();

    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    // 1. Fetch the incoming request
    const { data: request, error: reqError } = await serverClient
      .from("message_requests")
      .select("id, sender_id, status")
      .eq("id", params.id)
      .eq("receiver_id", user.id)
      .single();

    if (reqError || !request) {
      return NextResponse.json({ success: false, error: "Request not found." }, { status: 404 });
    }

    if (request.status !== "pending") {
      return NextResponse.json({ success: false, error: "Request is no longer pending." }, { status: 400 });
    }

    // 2. Update status to rejected
    const { error: updateError } = await serverClient
      .from("message_requests")
      .update({
        status: "rejected",
        responded_at: new Date().toISOString(),
        responded_by: user.id,
      })
      .eq("id", params.id);

    if (updateError) {
      console.error("[message_requests] Reject update error:", updateError);
      return NextResponse.json({ success: false, error: "Failed to update request." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      request: {
        id: params.id,
        status: "rejected",
        responded_at: new Date().toISOString(),
        responded_by: user.id,
      },
    }, { status: 200 });
  } catch (error) {
    console.error("[message_requests] Reject unexpected error:", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
