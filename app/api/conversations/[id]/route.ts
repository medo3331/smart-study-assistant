// ===========================================================================
// MAGICLY — Messaging Core — Single conversation + messages
// ===========================================================================

import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const serverClient = await (await import("@/lib/supabase/server")).createClient();
    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    // 1. Verify conversation exists
    const { data: conversation, error: convError } = await serverClient
      .from("conversations")
      .select("id, title, status, created_at, updated_at")
      .eq("id", params.id)
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ success: false, error: "Conversation not found." }, { status: 404 });
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

    // 3. Get messages (excluding soft-deleted by sender for other users)
    const { data: messages, error: msgError } = await serverClient
      .from("messages")
      .select("*")
      .eq("conversation_id", params.id)
      .order("created_at", { ascending: true })
      .range(0, 100);

    if (msgError) {
      console.error("[conversations] GET messages", msgError);
      return NextResponse.json({ success: false, error: "Failed to load messages." }, { status: 500 });
    }

    // Filter out messages that the sender has soft-deleted (will be hidden for other users)
    // But keep the record for the sender's own view
    const visibleMessages = messages?.filter((m: any) => !m.is_deleted || m.sender_id === user.id) ?? [];

    return NextResponse.json({
      success: true,
      conversation,
      participants: [],
      messages: visibleMessages,
    });
  } catch (error) {
    console.error("[conversations] GET", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
