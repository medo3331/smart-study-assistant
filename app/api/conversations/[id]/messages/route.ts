// ===========================================================================
// MAGICLY — Messaging Core — Messages with search and pagination
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

    // Parse query params
    const url = new URL(req.url);
    const cursor = url.searchParams.get("cursor");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 100);
    const search = url.searchParams.get("search") || "";

    // 1. Load conversation
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

    // 2. Verify user is a participant (skip archived conversations for participants)
    const { data: participant, error: partError } = await serverClient
      .from("conversation_participants")
      .select("participant_id")
      .eq("conversation_id", params.id)
      .eq("participant_id", user.id)
      .single();

    if (partError || !participant) {
      return NextResponse.json({ success: false, error: "You are not a participant of this conversation." }, { status: 403 });
    }

    // 3. Build query
    const query = serverClient
      .from("messages")
      .select("*")
      .eq("conversation_id", params.id)
      .order("created_at", { ascending: true });

    // Apply cursor (pagination)
    if (cursor) {
      query.gt("created_at", new Date(parseInt(cursor)).toISOString());
    }

    const { data: messages, error: msgError } = await query.limit(limit + 1); // Fetch 1 extra to detect more pages

    if (msgError) {
      console.error("[messages] GET", msgError);
      return NextResponse.json({ success: false, error: "Failed to load messages." }, { status: 500 });
    }

    // 4. Filter out messages that the sender has soft-deleted (only the sender sees them)
    const visibleMessages = messages?.filter((m: any) => !m.is_deleted || m.sender_id === user.id) ?? [];

    // 5. Check if there are more messages (1 extra fetched)
    const hasMore = visibleMessages.length > limit;
    const actualMessages = hasMore ? visibleMessages.slice(0, limit) : visibleMessages;

    // 6. Get next cursor
    const nextCursor = actualMessages.length > 0 ? actualMessages[actualMessages.length - 1].created_at : null;

    // 7. C19 — تعليم القراءة: تحديث آخر قراءة ليا + آخر قراءة الطرف التاني (لعلامات ✓✓)
    const nowIso = new Date().toISOString();
    await serverClient
      .from("conversation_participants")
      .update({ last_read_at: nowIso })
      .eq("conversation_id", params.id)
      .eq("participant_id", user.id);
    const { data: peerRows } = await serverClient
      .from("conversation_participants")
      .select("last_read_at")
      .eq("conversation_id", params.id)
      .neq("participant_id", user.id);
    const peerLastReadAt = ((peerRows ?? []) as { last_read_at: string | null }[])
      .map((r) => r.last_read_at)
      .filter((t): t is string => !!t)
      .sort()
      .pop() ?? null;

    return NextResponse.json({
      success: true,
      messages: actualMessages,
      hasMore,
      nextCursor,
      peer_last_read_at: peerLastReadAt,
      pagination: { limit, hasMore, nextCursor },
    });
  } catch (error) {
    console.error("[messages] GET", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
