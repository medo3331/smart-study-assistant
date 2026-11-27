// ===========================================================================
// MAGICLY — Group Conversations API
// Phase 1: Messaging Foundation
// ===========================================================================

import { NextResponse } from "next/server";

/**
 * POST /api/conversations/group
 *
 * Create a new group conversation.
 *
 * Body:
 *   {
 *     name: string,
 *     participant_ids: string[], // user IDs to add
 *     owner_id?: string        // defaults to current user
 *   }
 *
 * Returns:
 *   201 { success: true, conversation: {...} }
 *   400 { success: false, error: "..." }
 *   403 { success: false, error: "..." }
 */
export async function POST(req: Request) {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const serverClient = await createClient();

    const { data: { user }, error: authError } = await serverClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
    }

    const { name, participant_ids, owner_id } = body as {
      name: string;
      participant_ids: string[];
      owner_id?: string;
    };

    if (!name || typeof name !== "string" || name.trim().length < 1) {
      return NextResponse.json({ success: false, error: "Conversation name is required." }, { status: 400 });
    }

    if (!participant_ids || !Array.isArray(participant_ids)) {
      return NextResponse.json({ success: false, error: "participant_ids is required." }, { status: 400 });
    }

    // Validate participants exist and are active users
    const validParticipants = [];
    for (const pid of participant_ids) {
      const { data: u, error: e } = await serverClient
        .from("auth.users")
        .select("id")
        .eq("id", pid)
        .single();
      if (e || !u) {
        return NextResponse.json({ success: false, error: `Participant ${pid} not found or inactive.` }, { status: 400 });
      }
      validParticipants.push(pid);
    }

    // Owner must be a valid participant
    const owner = owner_id || user.id;
    if (!validParticipants.includes(owner)) {
      return NextResponse.json({ success: false, error: "Owner must be a participant." }, { status: 400 });
    }

    // Create conversation
    const { data: conversation, error: convError } = await serverClient
      .from("conversations")
      .insert({
        title: name,
        status: "active",
      })
      .select("*")
      .single();

    if (convError) {
      console.error("[conversations/group] Create error:", convError);
      return NextResponse.json({ success: false, error: "Failed to create conversation." }, { status: 500 });
    }

    // Add all participants
    const participants = validParticipants.map((pid) => ({
      conversation_id: conversation.id,
      participant_id: pid,
      role: pid === owner ? "admin" : "member",
    }));

    const { error: partError } = await serverClient
      .from("conversation_participants")
      .insert(participants);

    if (partError) {
      console.error("[conversations/group] Participant insert error:", partError);
      return NextResponse.json({ success: false, error: "Failed to add participants." }, { status: 500 });
    }

    // Set the owner
    const { error: ownerError } = await serverClient
      .from("conversation_participants")
      .update({ role: "owner" })
      .eq("conversation_id", conversation.id)
      .eq("participant_id", owner);

    if (ownerError) {
      console.error("[conversations/group] Owner update error:", ownerError);
      return NextResponse.json({ success: false, error: "Failed to set owner." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      conversation: {
        id: conversation.id,
        title: conversation.title,
        status: conversation.status,
        owner_id: owner,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[conversations/group] POST unexpected error:", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
