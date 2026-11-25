// ===========================================================================
// MAGICLY — Messaging Core — Manage conversation participants
// ===========================================================================

import { NextResponse } from "next/server";

export async function POST(
  req: Request,
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

    const { new_participant_ids, user_id, role } = body as {
      new_participant_ids?: string[];
      user_id?: string;
      role?: string;
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
      return NextResponse.json({ success: false, error: "Cannot add participants to archived/closed conversation." }, { status: 400 });
    }

    // User must be owner/administrator to add participants
    const { data: currentParticipant, error: curPartError } = await serverClient
      .from("conversation_participants")
      .select("role")
      .eq("conversation_id", params.id)
      .eq("participant_id", user.id)
      .single();

    if (curPartError || !currentParticipant) {
      return NextResponse.json({ success: false, error: "You are not a participant of this conversation." }, { status: 403 });
    }

    const allowedRoles = ["owner", "admin", "moderator"];
    if (currentParticipant.role !== "owner" && allowedRoles.includes(currentParticipant.role)) {
      // moderators and admins can add participants
    } else {
      return NextResponse.json({ success: false, error: "Only conversation owner or admins can add participants." }, { status: 403 });
    }

    // Validate new participants exist
    if (new_participant_ids.length > 0) {
      const { data: existingUsers, error: userErr } = await serverClient
        .from("auth.users")
        .select("id")
        .in("id", new_participant_ids);

      if (userErr) {
        console.error("[conversations] POST participants validate", userErr);
        return NextResponse.json({ success: false, error: "Failed to validate participants." }, { status: 500 });
      }

      const validIds = existingUsers?.map((u: any) => u.id) ?? [];
      const invalidIds = new_participant_ids.filter((id) => !validIds.includes(id));
      if (invalidIds.length > 0) {
        // Only return first invalid for security (avoid user enumeration)
        return NextResponse.json({ success: false, error: "One or more recipients do not exist." }, { status: 400 });
      }
    }

    // Add participants
    const participantsToAdd = new_participant_ids.map((id) => ({
      conversation_id: params.id,
      participant_id: id,
      role: role || "member",
      is_archived: false,
      is_muted: false,
      joined_at: new Date().toISOString(),
    }));

    const { error: partError } = await serverClient
      .from("conversation_participants")
      .insert(participantsToAdd);

    if (partError) {
      console.error("[conversations] POST participants", partError);
      return NextResponse.json({ success: false, error: "Failed to add participants." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[conversations] POST participants", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
