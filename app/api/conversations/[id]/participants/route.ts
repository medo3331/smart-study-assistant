// ===========================================================================
// MAGICLY — Messaging Core — Manage conversation participants
// ===========================================================================

import { NextResponse } from "next/server";

export async function POST(
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

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
    }

    const { new_participant_ids, user_id, role } = body as {
      new_participant_ids?: string[];
      user_id?: string;
      role?: string;
    };

    // Support for group conversation participant management
    const { action, participant_ids } = body as {
      action?: "add" | "remove";
      participant_ids?: string[];
    };

    if (!new_participant_ids || !Array.isArray(new_participant_ids)) {
      return NextResponse.json({ success: false, error: "new_participant_ids is required." }, { status: 400 });
    }

    // Verify conversation exists
    const { data: conversation, error: convError } = await serverClient
      .from("conversations")
      .select("id, status")
      .eq("id", params.id)
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ success: false, error: "Conversation not found." }, { status: 404 });
    }

    if (conversation.status !== "active") {
      return NextResponse.json({ success: false, error: "Cannot modify participants in non-active conversation." }, { status: 400 });
    }

    // Verify current user is owner, admin, or moderator
    const { data: selfParticipant, error: partError } = await serverClient
      .from("conversation_participants")
      .select("role")
      .eq("conversation_id", params.id)
      .eq("participant_id", user.id)
      .single();

    if (partError || !selfParticipant) {
      return NextResponse.json({ success: false, error: "You are not a participant." }, { status: 403 });
    }

    if (!["owner", "admin", "moderator"].includes(selfParticipant.role)) {
      return NextResponse.json({ success: false, error: "Only owner, admin, or moderator can manage participants." }, { status: 403 });
    }

    // If action is specified, handle group participant management
    if (action === "add" && participant_ids) {
      // Add participants to group conversation
      const validParticipants = [];
      for (const pid of participant_ids) {
        const { data: u, error: e } = await serverClient
          .from("auth.users")
          .select("id")
          .eq("id", pid)
          .single();
        if (e || !u) {
          return NextResponse.json({ success: false, error: `User ${pid} not found or inactive.` }, { status: 400 });
        }
        validParticipants.push(pid);
      }

      const inserts = validParticipants.map((pid) => ({
        conversation_id: params.id,
        participant_id: pid,
        role: "member",
        is_archived: false,
        is_muted: false,
        joined_at: new Date().toISOString(),
      }));

      const { error: partError } = await serverClient
        .from("conversation_participants")
        .insert(inserts);

      if (partError) {
        console.error("[conversations] POST participants add", partError);
        return NextResponse.json({ success: false, error: "Failed to add participants." }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        action: "add",
        added: validParticipants,
      });
    }

    if (action === "remove" && participant_ids) {
      // Remove participants from group conversation
      for (const pid of participant_ids) {
        const { error: delError } = await serverClient
          .from("conversation_participants")
          .delete()
          .eq("conversation_id", params.id)
          .eq("participant_id", pid);

        if (delError) {
          console.error("[conversations] POST participants remove", delError);
          return NextResponse.json({ success: false, error: `Failed to remove user ${pid}.` }, { status: 500 });
        }
      }

      return NextResponse.json({
        success: true,
        action: "remove",
        removed: participant_ids,
      });
    }
  } catch (error) {
    console.error("[conversations] POST participants", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
