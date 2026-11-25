// ===========================================================================
// MAGICLY — Message Request Actions (Accept, Reject, Cancel)
// Phase 1: Messaging Foundation
// ===========================================================================

import { NextResponse } from "next/server";

/**
 * POST /api/messages/requests/[id]/accept
 *
 * Accept an incoming message request.
 * This creates a conversation between the two users.
 *
 * Body: optional { note?: string }
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const serverClient = createClient();

    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    // 1. Fetch the incoming request
    const { data: request, error: reqError } = await serverClient
      .from("message_requests")
      .select("id, sender_id, receiver_id, status, created_at")
      .eq("id", params.id)
      .eq("receiver_id", user.id)
      .single();

    if (reqError || !request) {
      return NextResponse.json({ success: false, error: "Request not found." }, { status: 404 });
    }

    if (request.status !== "pending") {
      return NextResponse.json({ success: false, error: "Request is no longer pending." }, { status: 400 });
    }

    // 2. Check sender exists
    const { data: sender, error: senderError } = await serverClient
      .from("auth.users")
      .select("id")
      .eq("id", request.sender_id)
      .single();

    if (senderError || !sender) {
      return NextResponse.json({ success: false, error: "Sender not found." }, { status: 404 });
    }

    // 3. Create conversation and participants
    // Owner = current user (receiver)
    const { data: conversation, error: convError } = await serverClient
      .from("conversations")
      .insert({
        title: `${sender.full_name || "مستخدم"}: مراسلة مستقبلية`,
        status: "active",
      })
      .select("*")
      .single();

    if (convError) {
      console.error("[message_requests] Accept conversation creation error:", convError);
      return NextResponse.json({ success: false, error: "Failed to create conversation." }, { status: 500 });
    }

    // Add participants
    const participants = [
      { conversation_id: conversation.id, participant_id: user.id, role: "member" },
      { conversation_id: conversation.id, participant_id: request.sender_id, role: "member" },
    ];

    const { error: partError } = await serverClient
      .from("conversation_participants")
      .insert(participants);

    if (partError) {
      console.error("[message_requests] Accept participant insert error:", partError);
      return NextResponse.json({ success: false, error: "Failed to add participants." }, { status: 500 });
    }

    // 4. Mark request as accepted
    const { error: updateError } = await serverClient
      .from("message_requests")
      .update({
        status: "accepted",
        responded_at: new Date().toISOString(),
        responded_by: user.id,
      })
      .eq("id", params.id);

    if (updateError) {
      console.error("[message_requests] Accept update error:", updateError);
      return NextResponse.json({ success: false, error: "Failed to update request." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      request: {
        id: params.id,
        status: "accepted",
        responded_at: new Date().toISOString(),
        responded_by: user.id,
      },
      conversation: {
        id: conversation.id,
        title: conversation.title,
        status: conversation.status,
      },
    }, { status: 200 });
  } catch (error) {
    console.error("[message_requests] Accept unexpected error:", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
