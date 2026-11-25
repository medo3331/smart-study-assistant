// ===========================================================================
// MAGICLY — Messaging Core — Archive, mute, unmute conversation
// ===========================================================================

import { NextResponse } from "next/server";

type AdminAction = "archive" | "unarchive" | "mute" | "unmute";

function getAction(req: Request): AdminAction {
  const url = new URL(req.url);
  return url.searchParams.get("action") as AdminAction || "archive";
}

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

    const action = getAction(req);
    const { id } = { id: params.id }; // will be injected below

    // Verify conversation exists
    const { data: conversation, error: convError } = await serverClient
      .from("conversations")
      .select("id, status")
      .eq("id", params.id)
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ success: false, error: "Conversation not found." }, { status: 404 });
    }

    if (conversation.status === "deleted") {
      return NextResponse.json({ success: false, error: "Cannot modify a deleted conversation." }, { status: 400 });
    }

    // User must be a participant
    const { data: participant, error: partError } = await serverClient
      .from("conversation_participants")
      .select("role, is_archived, is_muted")
      .eq("conversation_id", params.id)
      .eq("participant_id", user.id)
      .single();

    if (partError || !participant) {
      return NextResponse.json({ success: false, error: "You are not a participant of this conversation." }, { status: 403 });
    }

    let result;
    let message: string;

    switch (action) {
      case "archive": {
        if (participant.is_archived) {
          return NextResponse.json({ success: true, message: "Conversation already archived." });
        }
        const { error } = await serverClient
          .from("conversation_participants")
          .update({ is_archived: true, is_muted: false })
          .eq("conversation_id", params.id)
          .eq("participant_id", user.id);
        if (error) {
          console.error("[conversations] POST archive", error);
          return NextResponse.json({ success: false, error: "Failed to archive." }, { status: 500 });
        }
        result = { success: true, message: "Conversation archived." };
        break;
      }
      case "unarchive": {
        if (!participant.is_archived) {
          return NextResponse.json({ success: true, message: "Conversation already active." });
        }
        const { error } = await serverClient
          .from("conversation_participants")
          .update({ is_archived: false })
          .eq("conversation_id", params.id)
          .eq("participant_id", user.id);
        if (error) {
          console.error("[conversations] POST unarchive", error);
          return NextResponse.json({ success: false, error: "Failed to unarchive." }, { status: 500 });
        }
        result = { success: true, message: "Conversation unarchived." };
        break;
      }
      case "mute": {
        if (participant.is_muted) {
          return NextResponse.json({ success: true, message: "Conversation already muted." });
        }
        const { error } = await serverClient
          .from("conversation_participants")
          .update({ is_muted: true })
          .eq("conversation_id", params.id)
          .eq("participant_id", user.id);
        if (error) {
          console.error("[conversations] POST mute", error);
          return NextResponse.json({ success: false, error: "Failed to mute." }, { status: 500 });
        }
        result = { success: true, message: "Conversation muted." };
        break;
      }
      case "unmute": {
        if (!participant.is_muted) {
          return NextResponse.json({ success: true, message: "Conversation already active." });
        }
        const { error } = await serverClient
          .from("conversation_participants")
          .update({ is_muted: false })
          .eq("conversation_id", params.id)
          .eq("participant_id", user.id);
        if (error) {
          console.error("[conversations] POST unmute", error);
          return NextResponse.json({ success: false, error: "Failed to unmute." }, { status: 500 });
        }
        result = { success: true, message: "Conversation unmuted." };
        break;
      }
      default:
        return NextResponse.json({ success: false, error: "Invalid action." }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[conversations] POST", error);
    return NextResponse.json({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
