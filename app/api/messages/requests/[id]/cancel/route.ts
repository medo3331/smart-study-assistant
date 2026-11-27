// ===========================================================================
// MAGICLY — Message Request Actions (Cancel)
// Phase 1: Messaging Foundation
// ===========================================================================

import { NextResponse } from "next/server";

/**
 * POST /api/messages/requests/[id]/cancel
 *
 * Cancel a pending message request (sender-side only).
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

    // 1. Fetch the pending request
    const { data: request, error: reqError } = await serverClient
      .from("message_requests")
      .select("id, sender_id, receiver_id, status")
      .eq("id", params.id)
      .single();

    if (reqError || !request) {
      return NextResponse.json({ success: false, error: "Request not found." }, { status: 404 });
    }

    // 2. Must be created by the current user
    if (request.sender_id !== user.id) {
      return NextResponse.json({ success: false, error: "Only the sender can cancel this request." }, { status: 403 });
    }

    if (request.status !== "pending") {
      return NextResponse.json({ success: false, error: "Request is no longer pending." }, { status: 400 });
    }

    // 3. Update status to canceled
    const { error: updateError } = await serverClient
      .from("message_requests")
      .update({
        status: "canceled",
        responded_at: new Date().toISOString(),
        responded_by: user.id,
      })
      .eq("id", params.id);

    if (updateError) {
      console.error("[message_requests] Cancel update error:", updateError);
      return NextResponse.json({ success: false, error: "Failed to cancel request." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      request: {
        id: params.id,
        status: "canceled",
        responded_at: new Date().toISOString(),
        responded_by: user.id,
      },
    }, { status: 200 });
  } catch (error) {
    console.error("[message_requests] Cancel unexpected error:", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
