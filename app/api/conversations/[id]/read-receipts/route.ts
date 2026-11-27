// ===========================================================================
// MAGICLY — Messaging Realtime — Read receipt state
// Phase 5: Endpoint for read receipts and unread counts
// ===========================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/conversations/[id]/read-receipts
 *
 * Get the read receipts for a conversation:
 * - For each participant, the last message they've read
 * - unread count per user
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const serverClient = await (await import("@/lib/supabase/server")).createClient();
    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    // 1. Verify conversation exists
    const { data: conversation, error: convError } = await serverClient
      .from("conversations")
      .select("id, status")
      .eq("id", params.id)
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ success: false, error: "Conversation not found." }, { status: 404 });
    }

    if (conversation.status === "deleted") {
      return NextResponse.json({ success: false, error: "Conversation deleted." }, { status: 404 });
    }

    // 2. Verify user is a participant
    const { data: participant, error: partError } = await serverClient
      .from("conversation_participants")
      .select("participant_id, last_read_msg_id, last_read_at, is_archived")
      .eq("conversation_id", params.id)
      .eq("participant_id", user.id)
      .single();

    if (partError || !participant) {
      return NextResponse.json({ success: false, error: "You are not a participant of this conversation." }, { status: 403 });
    }

    // 3. Get all participants
    const { data: allParticipants, error: allPartError } = await serverClient
      .from("conversation_participants")
      .select("participant_id, last_read_msg_id, last_read_at, is_archived")
      .eq("conversation_id", params.id);

    if (allPartError) {
      console.error("[read-receipts] get participants", allPartError);
      return NextResponse.json({ success: false, error: "Failed to load participants." }, { status: 500 });
    }

    // 4. Get unread count for the current user
    const { count: unreadCount, error: unreadError } = await serverClient
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", params.id)
      .eq("sender_id", "!=", user.id)
      .gte("created_at", participant.last_read_at || new Date().toISOString())
      .eq("is_deleted", false);

    if (unreadError) {
      console.error("[read-receipts] unread count", unreadError);
      return NextResponse.json({ success: false, error: "Failed to load unread count." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      read_receipts: {
        conversation_id: conversation.id,
        current_user: {
          participant_id: user.id,
          last_read_msg_id: participant.last_read_msg_id,
          last_read_at: participant.last_read_at,
          is_archived: participant.is_archived,
          unread_count: unreadCount || 0,
        },
        participants: allParticipants?.map((p: any) => ({
          participant_id: p.participant_id,
          last_read_msg_id: p.last_read_msg_id,
          last_read_at: p.last_read_at,
          is_archived: p.is_archived,
        })) || [],
      },
    });
  } catch (error) {
    console.error("[read-receipts] GET", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
