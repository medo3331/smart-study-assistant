// ===========================================================================
// MAGICLY — Messaging Realtime — Typing indicators
// Phase 5: Endpoint for typing indicator management
// ===========================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publishTypingIndicator } from "@/lib/messaging/realtime-publish";

/**
 * GET /api/conversations/[id]/typing
 *
 * Check if any user is currently typing in this conversation.
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
      .select("participant_id")
      .eq("conversation_id", params.id)
      .eq("participant_id", user.id)
      .single();

    if (partError || !participant) {
      return NextResponse.json({ success: false, error: "You are not a participant of this conversation." }, { status: 403 });
    }

    // 3. Get typing users from conversation_participants
    // In production, typing state should be stored in a separate table or using
    // in-memory cache. For now, return empty (no typing users).
    return NextResponse.json({
      success: true,
      typing: {
        conversation_id: params.id,
        is_typing: false,
        users: [],
      },
    });
  } catch (error) {
    console.error("[typing] GET", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}

/**
 * POST /api/conversations/[id]/typing
 *
 * Set or clear the typing indicator for the current user.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { is_typing } = body as { is_typing?: boolean };

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
      .select("participant_id")
      .eq("conversation_id", params.id)
      .eq("participant_id", user.id)
      .single();

    if (partError || !participant) {
      return NextResponse.json({ success: false, error: "You are not a participant of this conversation." }, { status: 403 });
    }

    // 3. Publish typing indicator to Realtime
    await publishTypingIndicator(
      params.id,
      user.id,
      user.id,
      user.id, // username — in production, fetch from user profiles
      is_typing ?? false,
    );

    return NextResponse.json({
      success: true,
      typing: {
        conversation_id: params.id,
        is_typing,
        users: [], // In production, return list of currently typing users
      },
    });
  } catch (error) {
    console.error("[typing] POST", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
